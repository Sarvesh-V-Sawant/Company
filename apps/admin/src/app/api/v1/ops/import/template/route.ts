import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertWorkDeskAccess } from '@mw/requireRole';
import { apiError } from '@lib/utils/api-response';

export const dynamic = 'force-dynamic';

const TEMPLATES: Record<string, { headers: string[]; example: (string | number)[] }> = {
  CANTEEN: {
    headers: ['Code', 'Name', 'Type', 'ParentCanteenCode', 'GSTIN', 'ContactPerson', 'Phone', 'Email'],
    example:  ['CNT001', 'Main Canteen', 'main', '', '22ABCDE1234F1Z5', 'John Doe', '9876543210', 'canteen@example.com'],
  },
  MANUFACTURER: {
    headers: ['Code', 'Name', 'GSTIN', 'PrimaryEmail', 'AdditionalEmails', 'DefaultCommissionRuleId', 'ContactPerson', 'Phone'],
    // AdditionalEmails: separate with commas. DefaultCommissionRuleId: only for an EXISTING manufacturer, and the
    // rule must be a manufacturer-scope rule for that same manufacturer — leave blank on first import.
    example:  ['MFR001', 'ABC Manufacturers', '22ABCDE1234F1Z5', 'contact@mfr.com', 'accounts@mfr.com, dispatch@mfr.com', '', 'Jane Doe', '9876543210'],
  },
  PRODUCT: {
    headers: ['SKU', 'Name', 'ManufacturerCode', 'UOM', 'PackSize', 'HSNCode', 'GSTRatePercent'],
    example:  ['PROD001', 'Product Name', 'MFR001', 'PCS', 12, '09011100', 5],
  },
  ADDRESS: {
    headers: ['OwnerType', 'OwnerCode', 'Label', 'AddressType', 'Line1', 'Line2', 'City', 'State', 'StateCode', 'Pincode', 'GSTIN', 'IsDefault'],
    example:  ['canteen', 'CNT001', 'Main Warehouse', 'shipTo', '123 Industrial Area', '', 'Pune', 'Maharashtra', '27', '411001', '', 'true'],
  },
  PRICE_LIST: {
    headers: ['ManufacturerCode', 'CanteenCode', 'EffectiveFrom', 'EffectiveTo', 'SKU', 'Rate'],
    example:  ['MFR001', 'CNT001', '2026-01-01', '', 'PROD001', 45.5],
  },
  COMMISSION_RULE: {
    headers: ['Scope', 'ScopeCode', 'Type', 'Value', 'EffectiveFrom', 'EffectiveTo', 'GSTApplicable', 'SACCode', 'Notes'],
    example:  ['manufacturer', 'MFR001', 'percentage', 5, '2026-01-01', '', 'false', '', ''],
  },
  // Loaded into ONE chain chosen on the Import screen; the existing lines are replaced.
  // SKU or Item is required. A VarianceReason is required whenever FinalQty differs from PoQty
  // (EXPIRY_RISK, SLOW_MOVING, EXISTING_STOCK, WASTAGE_HISTORY, MOQ_ROUNDING, MANUFACTURER_UNAVAILABLE, CANTEEN_REQUEST, OTHER).
  CHAIN_LINES: {
    headers: ['SKU', 'Item', 'UOM', 'PackSize', 'PoQty', 'FinalQty', 'VarianceReason', 'VarianceNote', 'Rate', 'GSTRatePercent'],
    example:  ['PROD001', '', 'PCS', 12, 100, 80, 'SLOW_MOVING', '', 45.5, 5],
  },
};

/** Identifier columns are formatted as Text so Excel keeps leading zeros (07, 0901, 011001). */
const TEXT_HEADERS = new Set([
  'Code', 'SKU', 'OwnerCode', 'ScopeCode', 'ManufacturerCode', 'CanteenCode', 'ParentCanteenCode',
  'StateCode', 'Pincode', 'HSNCode', 'GSTIN', 'Phone', 'SACCode', 'Label', 'UOM',
  'DefaultCommissionRuleId', 'EffectiveFrom', 'EffectiveTo',
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertWorkDeskAccess(payload); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  const entity = (new URL(request.url).searchParams.get('entity') ?? 'CANTEEN').toUpperCase();
  const template = TEMPLATES[entity];
  if (!template) return apiError('GEN_001', `No template for entity "${entity}".`, 400);

  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet('Import');

  ws.addRow(template.headers);
  ws.addRow(template.example);

  ws.getRow(1).font = { bold: true };
  template.headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = 20;
    if (TEXT_HEADERS.has(h)) ws.getColumn(i + 1).numFmt = '@';
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${entity}-import-template.xlsx"`,
    },
  });
}
