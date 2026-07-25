import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError, success } from '@lib/utils/api-response';
import { parseExcelBuffer, type RowError } from '@services/ops/ImportEngine';
import type { ImportEntityType } from '@models/ops/ImportBatch';

export const dynamic = 'force-dynamic';

const ALLOWED: ImportEntityType[] = ['CANTEEN', 'MANUFACTURER', 'PRODUCT'];

const COLUMN_MAPS: Record<ImportEntityType, Record<string, string>> = {
  CANTEEN:        { Code: 'code', Name: 'name', Type: 'type', ParentCanteenCode: 'parentCanteenCode', GSTIN: 'gstin', ContactPerson: 'contactPerson', Phone: 'phone', Email: 'email' },
  MANUFACTURER:   { Code: 'code', Name: 'name', GSTIN: 'gstin', PrimaryEmail: 'primaryEmail', ContactPerson: 'contactPerson', Phone: 'phone' },
  PRODUCT:        { SKU: 'sku', Name: 'name', ManufacturerCode: 'manufacturerCode', UOM: 'uom', PackSize: 'packSize', HSNCode: 'hsnCode', GSTRatePercent: 'gstRatePercent' },
  ADDRESS:        {},
  PRICE_LIST:     {},
  CHAIN_LINES:    {},
};

function validateRow(entityType: ImportEntityType, data: Record<string, unknown>, rowNum: number): RowError[] {
  const errs: RowError[] = [];
  const require = (field: string) => { if (!data[field]) errs.push({ rowNumber: rowNum, field, message: `${field} is required` }); };
  if (entityType === 'CANTEEN')       { require('code'); require('name'); require('type'); }
  if (entityType === 'MANUFACTURER')  { require('code'); require('name'); require('primaryEmail'); }
  if (entityType === 'PRODUCT')       { require('sku'); require('name'); require('manufacturerCode'); require('uom'); }
  return errs;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload;
  try { payload = await getAuthUser(request); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Unauthorized.', err.httpStatus); throw err; }
  try { assertRole(payload, 'super_admin', 'admin', 'manager'); }
  catch (err) { if (err instanceof AuthError) return apiError(err.code, 'Forbidden.', err.httpStatus); throw err; }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiError('GEN_001', 'Expected multipart/form-data.', 400); }

  const file = formData.get('file');
  const rawEntity = String(formData.get('entityType') ?? '').toUpperCase() as ImportEntityType;

  if (!file || !(file instanceof File)) return apiError('GEN_001', 'Field "file" is required.', 400);
  if (!ALLOWED.includes(rawEntity)) return apiError('GEN_001', `entityType must be one of: ${ALLOWED.join(', ')}.`, 400);

  const buffer = new Uint8Array(await file.arrayBuffer());
  const columnMapping = COLUMN_MAPS[rawEntity];

  try {
    const result = await parseExcelBuffer(buffer, rawEntity, file.name, payload.userId, columnMapping, (data, rowNum) => validateRow(rawEntity, data, rowNum));
    return success(result);
  } catch (err) {
    if (err instanceof Error) return apiError('OPS_018', err.message, 422);
    throw err;
  }
}
