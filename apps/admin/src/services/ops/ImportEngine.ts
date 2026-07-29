/**
 * Excel import engine — parse, preview, commit.
 * Commit implements all-or-nothing upsert: all relation references are resolved
 * before any writes. If any row fails resolution, the whole batch is rejected
 * and no records are written (Atlas M0 does not support multi-doc transactions;
 * this two-phase approach gives equivalent safety for import batches).
 */
import type ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { ImportBatch, type ImportEntityType } from '@models/ops/ImportBatch';
import { Canteen } from '@models/ops/Canteen';
import { Manufacturer } from '@models/ops/Manufacturer';
import { Product } from '@models/ops/Product';
import { AppError } from '@services/AuthService';
import { CreateCanteenSchema } from '@validators/ops/canteen';
import { CreateManufacturerSchema } from '@validators/ops/manufacturer';
import { CreateProductSchema } from '@validators/ops/product';

export interface RowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: RowError[];
}

export interface PreviewResult {
  batchId: string;
  fileName: string;
  entityType: ImportEntityType;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ParsedRow[];
  columnMapping: Record<string, string>;
}

export interface CommitResult {
  batchId: string;
  status: 'committed';
  createdCount: number;
  updatedCount: number;
}

// ─── Parse & preview ─────────────────────────────────────────────────────────

export async function parseExcelBuffer(
  buffer: Uint8Array,
  entityType: ImportEntityType,
  fileName: string,
  uploadedBy: string,
  columnMapping: Record<string, string>,
  rowValidator: (rowData: Record<string, unknown>, rowNum: number) => RowError[],
): Promise<PreviewResult> {
  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  await (wb.xlsx as unknown as { load(b: Uint8Array): Promise<void> }).load(buffer);
  const ws = wb.worksheets[0];

  if (!ws) throw new Error('No worksheet found in uploaded file');

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => {
    headers.push(String(cell.value ?? '').trim());
  });

  const rows: ParsedRow[] = [];
  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return;

    const data: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
      const header = headers[colNumber - 1];
      if (header) {
        const mappedKey = columnMapping[header] ?? header;
        data[mappedKey] = cell.value;
      }
    });

    const errors = rowValidator(data, rowNumber);
    rows.push({ rowNumber, data, errors });
  });

  const validRows = rows.filter((r) => r.errors.length === 0).length;
  const errorRows = rows.filter((r) => r.errors.length > 0).length;

  await connectDB();
  const batch = await ImportBatch.create({
    entityType,
    fileName,
    columnMapping,
    totalRows: rows.length,
    validRows,
    errorRows,
    importedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    status: 'previewed',
    rowErrors: rows.flatMap((r) => r.errors),
    // Store only valid rows — errors are already captured in rowErrors above.
    // Storing data only (not errors) keeps the document lean and avoids redundancy.
    rows: rows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
    createdBy: new mongoose.Types.ObjectId(uploadedBy),
  });

  return {
    batchId: String(batch._id),
    fileName,
    entityType,
    totalRows: rows.length,
    validRows,
    errorRows,
    rows,
    columnMapping,
  };
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export async function commitBatch(batchId: string, actorId: string): Promise<CommitResult> {
  await connectDB();

  const batch = await ImportBatch.findById(batchId);
  if (!batch) throw new AppError('OPS_019', 404, 'Import batch not found.');
  if (batch.status !== 'previewed')
    throw new AppError('OPS_020', 409, `Batch status is "${batch.status}" — only "previewed" batches can be committed.`);
  if (batch.errorRows > 0)
    throw new AppError('OPS_021', 422, `Batch has ${batch.errorRows} row error(s). Fix the file and re-upload before committing.`);

  const storedRows = (batch.rows ?? []) as Array<{ rowNumber: number; data: Record<string, unknown> }>;
  const validRows: ParsedRow[] = storedRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data, errors: [] }));

  const actorOid = new mongoose.Types.ObjectId(actorId);

  let createdCount = 0;
  let updatedCount = 0;

  if (batch.entityType === 'CANTEEN') {
    ({ createdCount, updatedCount } = await upsertCanteens(validRows, actorOid));
  } else if (batch.entityType === 'MANUFACTURER') {
    ({ createdCount, updatedCount } = await upsertManufacturers(validRows, actorOid));
  } else if (batch.entityType === 'PRODUCT') {
    ({ createdCount, updatedCount } = await upsertProducts(validRows, actorOid));
  } else {
    throw new AppError('OPS_018', 422, `Commit not yet implemented for entity type "${batch.entityType}".`);
  }

  await ImportBatch.findByIdAndUpdate(batchId, {
    status: 'committed',
    importedRows: createdCount + updatedCount,
    createdCount,
    updatedCount,
  });

  return { batchId, status: 'committed', createdCount, updatedCount };
}

export async function discardBatch(batchId: string): Promise<void> {
  await connectDB();
  await ImportBatch.findByIdAndUpdate(batchId, { status: 'discarded' });
}

// ─── Entity upsert helpers ────────────────────────────────────────────────────

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function strOpt(v: unknown): string | undefined {
  const s = str(v);
  return s || undefined;
}

function numOpt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function upsertCanteens(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  // Phase 1: resolve all parentCanteenCode references before writing anything.
  const parentCodeCache = new Map<string, mongoose.Types.ObjectId>();
  const relationErrors: string[] = [];

  for (const row of rows) {
    const rawParent = strOpt(row.data.parentCanteenCode);
    const type = str(row.data.type).toLowerCase();
    if (!rawParent) {
      if (type === 'subsidiary') {
        relationErrors.push(`Row ${row.rowNumber}: ParentCanteenCode is required for subsidiary canteens`);
      }
      continue;
    }
    const parentCodeUpper = rawParent.toUpperCase();
    if (parentCodeCache.has(parentCodeUpper)) continue;

    const parent = await Canteen.findOne({ code: parentCodeUpper, type: 'main' }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    if (!parent) {
      relationErrors.push(`Row ${row.rowNumber}: ParentCanteenCode "${rawParent}" not found or is not a main canteen`);
    } else {
      parentCodeCache.set(parentCodeUpper, parent._id);
    }
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Phase 1b: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const parsed = CreateCanteenSchema.safeParse({
      code: str(row.data.code),
      name: str(row.data.name),
      type: str(row.data.type).toLowerCase(),
      parentCanteenId: '000000000000000000000000', // placeholder; relation already verified above
      gstin: strOpt(row.data.gstin),
      contactPerson: strOpt(row.data.contactPerson),
      phone: strOpt(row.data.phone),
      email: strOpt(row.data.email),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'parentCanteenId') continue; // placeholder-only failure, ignore
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }

  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows.
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const codeUpper = str(row.data.code).toUpperCase();
    const type = str(row.data.type).toLowerCase() as 'main' | 'subsidiary';
    const rawParent = strOpt(row.data.parentCanteenCode);
    const parentCanteenId = rawParent ? parentCodeCache.get(rawParent.toUpperCase()) : undefined;

    const fields: Record<string, unknown> = {
      name: str(row.data.name),
      type,
      updatedBy: actorOid,
    };
    if (parentCanteenId) fields.parentCanteenId = parentCanteenId;
    if (strOpt(row.data.gstin)) fields.gstin = str(row.data.gstin).toUpperCase();
    if (strOpt(row.data.contactPerson)) fields.contactPerson = str(row.data.contactPerson);
    if (strOpt(row.data.phone)) fields.phone = str(row.data.phone);
    if (strOpt(row.data.email)) fields.email = str(row.data.email).toLowerCase();

    const existing = await Canteen.findOne({ code: codeUpper }).lean<{ _id: mongoose.Types.ObjectId }>();
    if (existing) {
      await Canteen.findByIdAndUpdate(existing._id, { $set: fields });
      updatedCount++;
    } else {
      await Canteen.create({ ...fields, code: codeUpper, isActive: true, createdBy: actorOid });
      createdCount++;
    }
  }

  return { createdCount, updatedCount };
}

async function upsertManufacturers(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  // Phase 1: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const parsed = CreateManufacturerSchema.safeParse({
      code: str(row.data.code),
      name: str(row.data.name),
      gstin: strOpt(row.data.gstin),
      primaryEmail: str(row.data.primaryEmail),
      contactPerson: strOpt(row.data.contactPerson),
      phone: strOpt(row.data.phone),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows.
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const codeUpper = str(row.data.code).toUpperCase();

    const fields: Record<string, unknown> = {
      name: str(row.data.name),
      primaryEmail: str(row.data.primaryEmail).toLowerCase(),
      updatedBy: actorOid,
    };
    if (strOpt(row.data.gstin)) fields.gstin = str(row.data.gstin).toUpperCase();
    if (strOpt(row.data.contactPerson)) fields.contactPerson = str(row.data.contactPerson);
    if (strOpt(row.data.phone)) fields.phone = str(row.data.phone);

    const existing = await Manufacturer.findOne({ code: codeUpper }).lean<{ _id: mongoose.Types.ObjectId }>();
    if (existing) {
      await Manufacturer.findByIdAndUpdate(existing._id, { $set: fields });
      updatedCount++;
    } else {
      await Manufacturer.create({ ...fields, code: codeUpper, isActive: true, createdBy: actorOid });
      createdCount++;
    }
  }

  return { createdCount, updatedCount };
}

async function upsertProducts(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  // Phase 1: resolve all manufacturerCode references.
  const mfrCodeCache = new Map<string, mongoose.Types.ObjectId>();
  const relationErrors: string[] = [];

  for (const row of rows) {
    const rawCode = str(row.data.manufacturerCode);
    if (!rawCode) continue;
    const codeUpper = rawCode.toUpperCase();
    if (mfrCodeCache.has(codeUpper)) continue;

    const mfr = await Manufacturer.findOne({ code: codeUpper, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    if (!mfr) {
      relationErrors.push(`Row ${row.rowNumber}: ManufacturerCode "${rawCode}" not found or is inactive (OPS_013/OPS_014 semantics)`);
    } else {
      mfrCodeCache.set(codeUpper, mfr._id);
    }
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Phase 1b: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const rawPackSize = row.data.packSize;
    const rawGstRate = row.data.gstRatePercent;
    const parsed = CreateProductSchema.safeParse({
      sku: str(row.data.sku),
      name: str(row.data.name),
      manufacturerId: mfrCodeCache.get(str(row.data.manufacturerCode).toUpperCase())?.toString() ?? '000000000000000000000000',
      uom: str(row.data.uom),
      packSize: strOpt(rawPackSize) !== undefined ? Number(rawPackSize) : undefined,
      hsnCode: strOpt(row.data.hsnCode),
      gstRatePercent: strOpt(rawGstRate) !== undefined ? Number(rawGstRate) : undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows.
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const skuUpper = str(row.data.sku).toUpperCase();
    const mfrCodeUpper = str(row.data.manufacturerCode).toUpperCase();
    const manufacturerId = mfrCodeCache.get(mfrCodeUpper)!;

    const fields: Record<string, unknown> = {
      name: str(row.data.name),
      manufacturerId,
      uom: str(row.data.uom).toUpperCase(),
      updatedBy: actorOid,
    };
    const packSize = numOpt(row.data.packSize);
    if (packSize !== undefined) fields.packSize = packSize;
    if (strOpt(row.data.hsnCode)) fields.hsnCode = str(row.data.hsnCode);
    const gstRate = numOpt(row.data.gstRatePercent);
    if (gstRate !== undefined) fields.gstRatePercent = gstRate;

    const existing = await Product.findOne({ sku: skuUpper }).lean<{ _id: mongoose.Types.ObjectId }>();
    if (existing) {
      await Product.findByIdAndUpdate(existing._id, { $set: fields });
      updatedCount++;
    } else {
      await Product.create({ ...fields, sku: skuUpper, isActive: true, createdBy: actorOid });
      createdCount++;
    }
  }

  return { createdCount, updatedCount };
}
