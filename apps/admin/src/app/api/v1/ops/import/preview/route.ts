import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, AuthError } from '@mw/requireAuth';
import { assertRole } from '@mw/requireRole';
import { apiError, success } from '@lib/utils/api-response';
import { parseExcelBuffer, rowFormatIssues, CHAIN_LINES_COLUMN_MAPPING, type RowError } from '@services/ops/ImportEngine';
import { ChainService } from '@services/ops/ChainService';
import { Chain } from '@models/ops/Chain';
import { connectDB } from '@lib/db/connect';
import type { ImportEntityType } from '@models/ops/ImportBatch';
import { AppError } from '@services/AuthService';

export const dynamic = 'force-dynamic';

const ALLOWED: ImportEntityType[] = ['CANTEEN', 'MANUFACTURER', 'PRODUCT', 'ADDRESS', 'PRICE_LIST', 'COMMISSION_RULE', 'CHAIN_LINES'];

const COLUMN_MAPS: Record<ImportEntityType, Record<string, string>> = {
  CANTEEN:        { Code: 'code', Name: 'name', Type: 'type', ParentCanteenCode: 'parentCanteenCode', GSTIN: 'gstin', ContactPerson: 'contactPerson', Phone: 'phone', Email: 'email' },
  MANUFACTURER:   { Code: 'code', Name: 'name', GSTIN: 'gstin', PrimaryEmail: 'primaryEmail', AdditionalEmails: 'additionalEmails', DefaultCommissionRuleId: 'defaultCommissionRuleId', ContactPerson: 'contactPerson', Phone: 'phone', PortalName: 'portalName', PortalUrl: 'portalUrl' },
  PRODUCT:        { SKU: 'sku', Name: 'name', ManufacturerCode: 'manufacturerCode', UOM: 'uom', PackSize: 'packSize', HSNCode: 'hsnCode', GSTRatePercent: 'gstRatePercent' },
  ADDRESS:        { OwnerType: 'ownerType', OwnerCode: 'ownerCode', Label: 'label', AddressType: 'addressType', Line1: 'line1', Line2: 'line2', City: 'city', State: 'state', StateCode: 'stateCode', Pincode: 'pincode', GSTIN: 'gstin', IsDefault: 'isDefault' },
  PRICE_LIST:     { ManufacturerCode: 'manufacturerCode', CanteenCode: 'canteenCode', EffectiveFrom: 'effectiveFrom', EffectiveTo: 'effectiveTo', SKU: 'sku', Rate: 'rate' },
  COMMISSION_RULE: { Scope: 'scope', ScopeCode: 'scopeCode', Type: 'type', Value: 'value', EffectiveFrom: 'effectiveFrom', EffectiveTo: 'effectiveTo', GSTApplicable: 'gstApplicable', SACCode: 'sacCode', Notes: 'notes' },
  CHAIN_LINES:    CHAIN_LINES_COLUMN_MAPPING,
};

function validateRow(entityType: ImportEntityType, data: Record<string, unknown>, rowNum: number): RowError[] {
  const errs: RowError[] = [];
  // 0 is a real value (a zero rate, a zero commission) — only null, undefined and blank text are "missing".
  const require = (field: string) => {
    const v = data[field];
    if (v === undefined || v === null || String(v).trim() === '') errs.push({ rowNumber: rowNum, field, message: `${field} is required` });
  };
  if (entityType === 'CANTEEN')       { require('code'); require('name'); require('type'); }
  if (entityType === 'MANUFACTURER')  { require('code'); require('name'); require('primaryEmail'); }
  if (entityType === 'PRODUCT')       { require('sku'); require('name'); require('manufacturerCode'); require('uom'); }
  if (entityType === 'ADDRESS')       { require('ownerType'); require('label'); require('addressType'); require('line1'); require('city'); require('state'); require('stateCode'); require('pincode'); }
  if (entityType === 'PRICE_LIST')    { require('manufacturerCode'); require('sku'); require('rate'); require('effectiveFrom'); }
  if (entityType === 'COMMISSION_RULE') { require('scope'); require('scopeCode'); require('type'); require('value'); require('effectiveFrom'); }
  // Format rules come from the same zod schemas the commit step (and the single-record API) use,
  // so a bad email, GSTIN, pincode, state code, date or rate is caught here, not at commit.
  // A field already reported as missing is not reported a second time.
  const missing = new Set(errs.map((e) => e.field));
  for (const issue of rowFormatIssues(entityType, data)) {
    if (missing.has(issue.field)) continue;
    errs.push({ rowNumber: rowNum, field: issue.field, message: issue.message });
  }
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
  catch { return apiError('GEN_001', 'The upload could not be read. Send the file as multipart/form-data and keep it under 10 MB.', 400); }

  const file = formData.get('file');
  const rawEntity = String(formData.get('entityType') ?? '').toUpperCase() as ImportEntityType;

  if (!file || !(file instanceof File)) return apiError('GEN_001', 'Field "file" is required.', 400);
  if (!ALLOWED.includes(rawEntity)) return apiError('GEN_001', `entityType must be one of: ${ALLOWED.join(', ')}.`, 400);

  const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a masters sheet, small enough to bound parse time/memory
  if (file.size === 0) return apiError('GEN_001', 'The uploaded file is empty.', 400);
  if (file.size > MAX_IMPORT_FILE_BYTES) return apiError('GEN_001', `File is too large (max ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB).`, 400);
  if (!/\.xlsx$/i.test(file.name)) return apiError('GEN_001', 'Only .xlsx files are accepted.', 400);

  // Chain-line imports load rows into ONE chain, chosen up front.
  let chainId: string | undefined;
  if (rawEntity === 'CHAIN_LINES') {
    chainId = String(formData.get('chainId') ?? '').trim();
    if (!/^[0-9a-f]{24}$/i.test(chainId)) return apiError('OPS_058', 'Choose the chain to load these lines into.', 400);
    await connectDB();
    const chain = await Chain.findById(chainId).select('status chainNumber').lean<{ status: string; chainNumber: string }>();
    if (!chain) return apiError('OPS_031', 'Chain not found.', 404);
    if (chain.status === 'CLOSED' || chain.status === 'CANCELLED') {
      return apiError('OPS_033', `Chain ${chain.chainNumber} is ${chain.status}; its lines can no longer be changed.`, 409);
    }
    if (!ChainService.linesEditable(chain.status as Parameters<typeof ChainService.linesEditable>[0])) {
      return apiError('OPS_061', `Line items are locked once a chain reaches ${chain.status}.`, 409);
    }
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const columnMapping = COLUMN_MAPS[rawEntity];

  try {
    const result = await parseExcelBuffer(buffer, rawEntity, file.name, payload.userId, columnMapping, (data, rowNum) => validateRow(rawEntity, data, rowNum), chainId);
    return success(result);
  } catch (err) {
    // Coded problems (empty sheet, too many rows) carry a user-facing message. Anything else is a
    // parser failure on a corrupt or non-xlsx file; its message is library internals, so replace it.
    if (err instanceof AppError) return apiError(err.code, err.message, err.httpStatus);
    console.error('[import/preview] Could not read workbook:', err instanceof Error ? err.message : err);
    return apiError('OPS_018', 'The file could not be read. Make sure it is a valid .xlsx workbook and not password-protected.', 422);
  }
}
