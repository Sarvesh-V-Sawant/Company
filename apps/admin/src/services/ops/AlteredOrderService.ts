/**
 * Altered order document generation (Phase 30.04).
 *
 * Produces the revised-order document that is sent to the manufacturer, in
 * either PDF or XLSX, and FILES IT IN THE VAULT before returning. Callers then
 * attach the stored document rather than regenerating bytes, so what the
 * manufacturer receives is byte-identical to what is on record. That is the
 * whole point of generating and storing in one step.
 *
 * The document title and company identity are read from OpsSettings, never
 * hardcoded, because the legally correct name is an admin/CA decision.
 */
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { AppError } from '@services/AuthService';
import { Chain } from '@models/ops/Chain';
import { ChainLineItem } from '@models/ops/ChainLineItem';
import { OpsSettingsService } from '@services/ops/OpsSettingsService';
import { uploadDocument } from '@services/ops/DocumentVaultService';
import { renderPdf, formatAmount, type PdfDocSpec } from '@lib/documents/pdf';
import { round2 } from '@services/ops/ChainService';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type AlteredOrderFormat = 'pdf' | 'xlsx';

export interface GeneratedAlteredOrder {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  format: AlteredOrderFormat;
  docType: 'ALTERED_ORDER';
  version: number;
}

interface PopulatedRef {
  _id: mongoose.Types.ObjectId;
  code?: string;
  name?: string;
}

interface PopulatedAddress {
  _id: mongoose.Types.ObjectId;
  label?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  gstin?: string;
}

interface LineRow {
  sku: string;
  description: string;
  uom: string;
  originalQty: number;
  alteredQty: number;
  rate: number;
  taxableValue: number;
  gstRatePercent: number;
  taxAmount: number;
  lineTotal: number;
  varianceReason: string;
}

/** Formats an address into printable lines. */
function addressLines(addr?: PopulatedAddress | null): string[] {
  if (!addr) return ['—'];
  const out: string[] = [];
  if (addr.label) out.push(addr.label);
  if (addr.line1) out.push(addr.line1);
  if (addr.line2) out.push(addr.line2);
  const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
  if (cityLine) out.push(cityLine);
  if (addr.gstin) out.push(`GSTIN: ${addr.gstin}`);
  return out.length > 0 ? out : ['—'];
}

function fmtDate(d?: Date | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toISOString().slice(0, 10);
}

export class AlteredOrderService {
  /**
   * Loads everything the document needs. Kept separate so both output formats
   * render from exactly the same data.
   */
  private static async loadContext(chainId: string) {
    await connectDB();

    if (!/^[0-9a-f]{24}$/i.test(chainId)) {
      throw new AppError('OPS_030', 400, 'Invalid chain ID.');
    }

    const chain = await Chain.findById(chainId)
      .populate('canteenId', 'code name type')
      .populate('originCanteenId', 'code name')
      .populate('manufacturerId', 'code name gstin primaryEmail')
      .populate('shipToAddressId')
      .populate('billToAddressId');

    if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

    const lines = await ChainLineItem.find({ chainId: new mongoose.Types.ObjectId(chainId) })
      .sort({ sortOrder: 1 })
      .populate('productId', 'sku name uom packSize gstRatePercent')
      .lean();

    if (lines.length === 0) {
      throw new AppError(
        'OPS_037',
        422,
        'This chain has no order lines yet, so there is nothing to generate. Add the lines first.',
      );
    }

    const settings = await OpsSettingsService.get();

    const rows: LineRow[] = lines.map((l) => {
      const product = (l.productId ?? null) as unknown as
        | { sku?: string; name?: string; uom?: string }
        | null;
      return {
        sku: product?.sku ?? '—',
        description: product?.name ?? l.rawDescription ?? '—',
        uom: l.uom ?? product?.uom ?? 'PCS',
        originalQty: Number(l.originalQty ?? 0),
        alteredQty: Number(l.alteredQty ?? 0),
        rate: Number(l.rate ?? 0),
        taxableValue: Number(l.taxableValue ?? 0),
        gstRatePercent: Number(l.gstRatePercent ?? 0),
        taxAmount: Number(l.taxAmount ?? 0),
        lineTotal: Number(l.lineTotal ?? 0),
        varianceReason: l.varianceReason ?? '',
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        taxableValue: acc.taxableValue + r.taxableValue,
        taxAmount: acc.taxAmount + r.taxAmount,
        lineTotal: acc.lineTotal + r.lineTotal,
      }),
      { taxableValue: 0, taxAmount: 0, lineTotal: 0 },
    );

    return {
      chain,
      rows,
      settings,
      totals: {
        taxableValue: round2(totals.taxableValue),
        taxAmount: round2(totals.taxAmount),
        lineTotal: round2(totals.lineTotal),
      },
      canteen: chain.canteenId as unknown as PopulatedRef | null,
      manufacturer: chain.manufacturerId as unknown as PopulatedRef | null,
      shipTo: chain.shipToAddressId as unknown as PopulatedAddress | null,
      billTo: chain.billToAddressId as unknown as PopulatedAddress | null,
    };
  }

  /** Builds the PDF bytes. */
  private static renderPdfBytes(ctx: Awaited<ReturnType<typeof AlteredOrderService.loadContext>>): Uint8Array {
    const { chain, rows, settings, totals, canteen, manufacturer, shipTo, billTo } = ctx;
    const identity = settings.companyIdentity;

    const issuerLines: string[] = [];
    if (identity.legalName) issuerLines.push(identity.legalName);
    issuerLines.push(...(identity.addressLines ?? []));
    if (identity.gstin) issuerLines.push(`GSTIN: ${identity.gstin}`);
    if (identity.contactEmail) issuerLines.push(identity.contactEmail);
    if (identity.contactPhone) issuerLines.push(identity.contactPhone);

    const spec: PdfDocSpec = {
      title: settings.documentTitles.alteredOrderTitle,
      subtitle: `${chain.chainNumber}   |   Date: ${fmtDate(new Date())}`,
      issuerLines: issuerLines.length > 0 ? issuerLines : undefined,
      blocks: [
        {
          heading: 'Order details',
          pairs: [
            ['Reference', chain.chainNumber],
            ['Buyer PO No.', chain.sourcePoNumber ?? '—'],
            ['Buyer PO Date', fmtDate(chain.sourcePoDate)],
            ['Manufacturer', manufacturer?.name ?? '—'],
            ['Canteen', canteen?.name ?? '—'],
          ],
        },
        {
          heading: 'Ship to',
          pairs: addressLines(shipTo).map((l, i) => [i === 0 ? 'Address' : '', l] as [string, string]),
        },
      ],
      table: {
        columns: [
          { header: 'SKU', width: 12 },
          { header: 'Description', width: 30 },
          { header: 'UOM', width: 7 },
          { header: 'PO Qty', width: 9, align: 'right' },
          { header: 'Final Qty', width: 10, align: 'right' },
          { header: 'Rate', width: 10, align: 'right' },
          { header: 'Taxable', width: 11, align: 'right' },
          { header: 'Total', width: 11, align: 'right' },
        ],
        rows: rows.map((r) => [
          r.sku,
          r.description,
          r.uom,
          String(r.originalQty),
          String(r.alteredQty),
          formatAmount(r.rate),
          formatAmount(r.taxableValue),
          formatAmount(r.lineTotal),
        ]),
      },
      totals: [
        ['Taxable value', formatAmount(totals.taxableValue)],
        ['Tax', formatAmount(totals.taxAmount)],
        ['Total', formatAmount(totals.lineTotal)],
      ],
      footerLines: [
        billTo ? `Bill to: ${addressLines(billTo).join(', ')}` : '',
        settings.documentTitles.documentFooterNote ?? '',
        'This is a computer-generated document.',
      ].filter((l) => l.length > 0),
    };

    return renderPdf(spec);
  }

  /** Builds the XLSX bytes. exceljs is imported lazily, as elsewhere in the app. */
  private static async renderXlsxBytes(
    ctx: Awaited<ReturnType<typeof AlteredOrderService.loadContext>>,
  ): Promise<Uint8Array> {
    const { chain, rows, settings, totals, canteen, manufacturer, shipTo } = ctx;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet('Revised Order');

    const header: Array<[string, string]> = [
      [settings.documentTitles.alteredOrderTitle, ''],
      ['Reference', chain.chainNumber],
      ['Buyer PO No.', chain.sourcePoNumber ?? ''],
      ['Buyer PO Date', fmtDate(chain.sourcePoDate)],
      ['Manufacturer', manufacturer?.name ?? ''],
      ['Canteen', canteen?.name ?? ''],
      ['Ship to', addressLines(shipTo).join(', ')],
    ];
    header.forEach((pair) => {
      ws.addRow(pair);
    });
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([]);

    const headerRow = ws.addRow([
      'SKU',
      'Description',
      'UOM',
      'PO Qty',
      'Final Qty',
      'Variance Reason',
      'Rate',
      'Taxable Value',
      'GST %',
      'Tax Amount',
      'Line Total',
    ]);
    headerRow.font = { bold: true };

    rows.forEach((r) => {
      ws.addRow([
        r.sku,
        r.description,
        r.uom,
        r.originalQty,
        r.alteredQty,
        r.varianceReason,
        r.rate,
        r.taxableValue,
        r.gstRatePercent,
        r.taxAmount,
        r.lineTotal,
      ]);
    });

    ws.addRow([]);
    const totalRow = ws.addRow([
      'Total',
      '',
      '',
      '',
      '',
      '',
      '',
      totals.taxableValue,
      '',
      totals.taxAmount,
      totals.lineTotal,
    ]);
    totalRow.font = { bold: true };

    ws.columns.forEach((col, idx) => {
      col.width = idx === 1 ? 38 : 15;
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
  }

  /**
   * Generates the altered order and files it in the vault.
   *
   * @returns the stored document's id and file name, so the caller can attach
   *          the stored copy instead of regenerating bytes.
   */
  static async generateAndStore(
    chainId: string,
    format: AlteredOrderFormat,
    actorId: string,
  ): Promise<GeneratedAlteredOrder> {
    const ctx = await this.loadContext(chainId);

    const bytes =
      format === 'xlsx' ? await this.renderXlsxBytes(ctx) : this.renderPdfBytes(ctx);

    // Slashes in the chain number would break a file name.
    const safeChainNumber = ctx.chain.chainNumber.replace(/[^A-Za-z0-9._-]+/g, '-');
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `Revised-Order-${safeChainNumber}-${stamp}.${format}`;

    const doc = await uploadDocument({
      chainId,
      docType: 'ALTERED_ORDER',
      fileName,
      mimeType: format === 'xlsx' ? XLSX_MIME : 'application/pdf',
      buffer: bytes,
      uploadedBy: actorId,
      notes: 'Generated by Genesis Work Desk',
      // Bytes this app produced itself; MIME/size validation applies to uploads.
      trusted: true,
    });

    return {
      documentId: String(doc._id),
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      format,
      docType: 'ALTERED_ORDER',
      version: doc.version,
    };
  }
}
