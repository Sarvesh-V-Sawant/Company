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
import { OpsAddress } from '@models/ops/OpsAddress';
import { PriceList } from '@models/ops/PriceList';
import { CommissionRule } from '@models/ops/CommissionRule';
import { AppError } from '@services/AuthService';
import { CreateCanteenSchema } from '@validators/ops/canteen';
import { CreateManufacturerSchema } from '@validators/ops/manufacturer';
import { CreateProductSchema } from '@validators/ops/product';
import { CreateAddressSchema } from '@validators/ops/address';
import { CreateCommissionRuleSchema } from '@validators/ops/commission-rule';
import { CreatePriceListSchema } from '@validators/ops/price-list';
import { normalizeCellValue } from '@lib/utils/ops-guards';
import { assertDefaultCommissionRule } from '@services/ops/ManufacturerService';
import { assertPriceListRefs, assertNoOverlap as assertNoPriceListOverlap } from '@services/ops/PriceListService';
import { assertNoCommissionOverlap } from '@services/ops/CommissionRuleService';
import { Chain } from '@models/ops/Chain';
import { ChainLineItem } from '@models/ops/ChainLineItem';
import { ChainEvent } from '@models/ops/ChainEvent';
import { ChainService, computeLineTotals } from '@services/ops/ChainService';
import { VARIANCE_REASONS } from '@validators/ops/chain';

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

export interface RowOutcome {
  rowNumber: number;
  key: string;
  action: 'created' | 'updated';
}

export interface CommitResult {
  batchId: string;
  status: 'committed';
  createdCount: number;
  updatedCount: number;
  rowOutcomes?: RowOutcome[];
}

// ─── Parse & preview ─────────────────────────────────────────────────────────

// ─── Row candidates ──────────────────────────────────────────────────────────
// ONE place that turns a sheet row into the object the single-record zod schema validates.
// Preview and commit both go through these, so a row can never pass one and fail the other.

const PLACEHOLDER_ID = '000000000000000000000000';

/** "a@x.com, b@y.com; c@z.com" -> ['a@x.com', 'b@y.com', 'c@z.com'] */
export function splitEmails(v: unknown): string[] {
  return String(v ?? '').split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
}

function canteenCandidate(d: Record<string, unknown>) {
  return {
    code: str(d.code),
    name: str(d.name),
    type: str(d.type).toLowerCase(),
    parentCanteenId: PLACEHOLDER_ID, // relation is resolved separately; the id shape is what matters here
    gstin: strOpt(d.gstin),
    contactPerson: strOpt(d.contactPerson),
    phone: strOpt(d.phone),
    email: strOpt(d.email),
  };
}

function manufacturerCandidate(d: Record<string, unknown>) {
  return {
    code: str(d.code),
    name: str(d.name),
    gstin: strOpt(d.gstin),
    primaryEmail: str(d.primaryEmail),
    additionalEmails: splitEmails(d.additionalEmails),
    contactPerson: strOpt(d.contactPerson),
    phone: strOpt(d.phone),
    portalName: strOpt(d.portalName),
    portalUrl: strOpt(d.portalUrl),
  };
}

function productCandidate(d: Record<string, unknown>, manufacturerId?: string) {
  return {
    sku: str(d.sku),
    name: str(d.name),
    manufacturerId: manufacturerId ?? PLACEHOLDER_ID,
    uom: str(d.uom),
    packSize: strOpt(d.packSize) !== undefined ? Number(d.packSize) : undefined,
    hsnCode: strOpt(d.hsnCode),
    gstRatePercent: strOpt(d.gstRatePercent) !== undefined ? Number(d.gstRatePercent) : undefined,
  };
}

function addressCandidate(d: Record<string, unknown>) {
  const ownerType = str(d.ownerType).toLowerCase() as 'canteen' | 'manufacturer' | 'company';
  return {
    ownerType,
    ownerId: ownerType === 'company' ? undefined : PLACEHOLDER_ID,
    label: str(d.label),
    addressType: str(d.addressType),
    line1: str(d.line1),
    line2: strOpt(d.line2),
    city: str(d.city),
    state: str(d.state),
    stateCode: str(d.stateCode),
    pincode: str(d.pincode),
    gstin: strOpt(d.gstin),
    isDefault: String(d.isDefault ?? '').toLowerCase() === 'true',
  };
}

function commissionCandidate(d: Record<string, unknown>, scopeId?: string) {
  const scope = str(d.scope).toLowerCase() as 'manufacturer' | 'product' | 'canteen';
  const id = scopeId ?? PLACEHOLDER_ID;
  return {
    scope,
    manufacturerId: scope === 'manufacturer' ? id : undefined,
    productId: scope === 'product' ? id : undefined,
    canteenId: scope === 'canteen' ? id : undefined,
    type: str(d.type),
    value: numOpt(d.value),
    effectiveFrom: str(d.effectiveFrom),
    effectiveTo: strOpt(d.effectiveTo),
    gstApplicable: String(d.gstApplicable ?? '').toLowerCase() === 'true',
    sacCode: strOpt(d.sacCode),
    notes: strOpt(d.notes),
  };
}

/**
 * Format problems in ONE row, with no database access — used at preview so bad emails, GSTINs,
 * pincodes, state codes, dates and rates show up before the user commits. Commit runs the very
 * same schemas on the very same candidates (plus relation checks).
 */
export function rowFormatIssues(
  entityType: ImportEntityType,
  d: Record<string, unknown>,
): Array<{ field: string; message: string }> {
  const out: Array<{ field: string; message: string }> = [];
  const push = (issues: Array<{ path: Array<string | number>; message: string }>, skip: string[] = []) => {
    for (const i of issues) {
      if (skip.includes(String(i.path[0]))) continue; // placeholder-only failures
      out.push({ field: i.path.join('.') || '(row)', message: i.message });
    }
  };
  switch (entityType) {
    case 'CANTEEN': {
      const r = CreateCanteenSchema.safeParse(canteenCandidate(d));
      if (!r.success) push(r.error.issues, ['parentCanteenId']);
      break;
    }
    case 'MANUFACTURER': {
      const r = CreateManufacturerSchema.safeParse(manufacturerCandidate(d));
      if (!r.success) push(r.error.issues);
      const rule = strOpt(d.defaultCommissionRuleId);
      if (rule && !/^[0-9a-f]{24}$/i.test(rule)) out.push({ field: 'defaultCommissionRuleId', message: 'Must be a 24-character commission rule id' });
      break;
    }
    case 'PRODUCT': {
      const r = CreateProductSchema.safeParse(productCandidate(d));
      if (!r.success) push(r.error.issues, ['manufacturerId']);
      break;
    }
    case 'ADDRESS': {
      const r = CreateAddressSchema.safeParse(addressCandidate(d));
      if (!r.success) push(r.error.issues, ['ownerId']);
      break;
    }
    case 'COMMISSION_RULE': {
      const r = CreateCommissionRuleSchema.safeParse(commissionCandidate(d));
      if (!r.success) push(r.error.issues, ['manufacturerId', 'productId', 'canteenId']);
      break;
    }
    case 'PRICE_LIST': {
      const r = CreatePriceListSchema.safeParse({
        manufacturerId: PLACEHOLDER_ID,
        effectiveFrom: str(d.effectiveFrom).slice(0, 10),
        effectiveTo: strOpt(d.effectiveTo)?.slice(0, 10),
        items: [{ productId: PLACEHOLDER_ID, rate: numOpt(d.rate) }],
      });
      if (!r.success) push(r.error.issues.map((i) => ({ path: i.path[0] === 'items' ? i.path.slice(2) : i.path, message: i.message })));
      break;
    }
    case 'CHAIN_LINES':
      for (const e of validateChainLineRow(d, 0)) out.push({ field: e.field, message: e.message });
      break;
    default:
      break;
  }
  return out;
}

/**
 * Columns that are identifiers or codes, never quantities. Excel turns "07" or "411001" typed
 * into a General cell into a number and drops the leading zero; these columns are read back as
 * text so the zero survives wherever the file still has it.
 */
const TEXT_FIELDS = new Set([
  'code', 'sku', 'ownerCode', 'scopeCode', 'manufacturerCode', 'canteenCode', 'parentCanteenCode',
  'stateCode', 'pincode', 'hsnCode', 'gstin', 'phone', 'sacCode', 'label', 'uom',
]);
const FIXED_WIDTH: Record<string, number> = { stateCode: 2, pincode: 6 };

/**
 * Text for a numeric cell in a code-like column. Uses the cell's displayed text first (so a
 * "00" or "000000" number format gives back the padded value), then restores the fixed widths
 * we know: GST state code (2) and pincode (6). HSN codes are 4, 6 or 8 digits, so a short
 * numeric value is padded up to the next valid width.
 */
function numberCellText(cell: { text?: string; numFmt?: string }, n: number, key: string): string {
  let t = '';
  try { t = String(cell.text ?? '').trim(); } catch { t = ''; }
  if (!/^\d+$/.test(t)) t = Number.isInteger(n) ? n.toLocaleString('fullwide', { useGrouping: false }) : String(n);
  // A number format made only of zeros ("000", "00") is how Excel shows a padded code: honour its width.
  const fmt = typeof cell.numFmt === 'string' ? cell.numFmt : '';
  if (/^0+$/.test(fmt) && /^\d+$/.test(t) && t.length < fmt.length) t = t.padStart(fmt.length, '0');
  if (/^\d+$/.test(t)) {
    const w = FIXED_WIDTH[key];
    if (w && t.length < w) t = t.padStart(w, '0');
    if (key === 'hsnCode') {
      const target = t.length <= 4 ? 4 : t.length <= 6 ? 6 : 8;
      if (t.length < target) t = t.padStart(target, '0');
    }
  }
  return t;
}

/** Hard ceiling per import: a batch stores every row in one document (16 MB Mongo limit). */
export const MAX_IMPORT_ROWS = 5000;

const up = (v: unknown): string => String(v ?? '').trim().toUpperCase();

/**
 * Identity keys of a row within its own sheet. Two rows that share any key describe the same
 * record (or, for defaults, contend for the same slot) and must not both be imported.
 */
export function duplicateKeysOf(entityType: ImportEntityType, d: Record<string, unknown>): string[] {
  switch (entityType) {
    case 'CANTEEN':
    case 'MANUFACTURER':
      return up(d.code) ? [`code:${up(d.code)}`] : [];
    case 'PRODUCT':
      return up(d.sku) ? [`sku:${up(d.sku)}`] : [];
    case 'ADDRESS': {
      const keys: string[] = [];
      if (up(d.label)) keys.push(`address:${up(d.ownerType)}|${up(d.ownerCode)}|${up(d.label)}`);
      if (String(d.isDefault ?? '').toLowerCase() === 'true') {
        keys.push(`default:${up(d.ownerType)}|${up(d.ownerCode)}|${up(d.addressType)}`);
      }
      return keys;
    }
    case 'PRICE_LIST':
      return up(d.sku) ? [`line:${up(d.manufacturerCode)}|${up(d.canteenCode)}|${up(d.effectiveFrom)}|${up(d.sku)}`] : [];
    case 'COMMISSION_RULE':
      return up(d.scopeCode) ? [`rule:${up(d.scope)}|${up(d.scopeCode)}|${up(d.effectiveFrom)}`] : [];
    case 'CHAIN_LINES':
      return up(d.sku) ? [`sku:${up(d.sku)}`] : [];
    default:
      return [];
  }
}

export async function parseExcelBuffer(
  buffer: Uint8Array,
  entityType: ImportEntityType,
  fileName: string,
  uploadedBy: string,
  columnMapping: Record<string, string>,
  rowValidator: (rowData: Record<string, unknown>, rowNum: number) => RowError[],
  chainId?: string,
): Promise<PreviewResult> {
  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  await (wb.xlsx as unknown as { load(b: Uint8Array): Promise<void> }).load(buffer);
  const ws = wb.worksheets[0];

  if (!ws) throw new AppError('OPS_018', 422, 'The workbook has no worksheet.');

  // Headers are indexed by real column number. Pushing only non-empty header cells (the old
  // behaviour) shifted every later column left by one whenever a header cell was blank.
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(normalizeCellValue(cell.value) ?? '').trim();
  });
  // Header matching ignores case and stray spaces ("manufacturercode " still maps).
  const mappingByLower = new Map(Object.entries(columnMapping).map(([k, v]) => [k.toLowerCase(), v]));

  const rows: ParsedRow[] = [];
  ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return;

    const data: Record<string, unknown> = {};
    let hasContent = false;
    row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell, colNumber: number) => {
      const header = headers[colNumber - 1];
      if (header) {
        const mappedKey = columnMapping[header] ?? mappingByLower.get(header.toLowerCase()) ?? header;
        let value = normalizeCellValue(cell.value);
        if (typeof value === 'number' && TEXT_FIELDS.has(mappedKey)) value = numberCellText(cell, value, mappedKey);
        if (typeof value === 'string') value = value.trim();
        data[mappedKey] = value;
        if (value !== null && value !== undefined && value !== '') hasContent = true;
      }
    });
    // Excel keeps formatting on emptied rows; those are not data.
    if (!hasContent) return;

    const errors = rowValidator(data, rowNumber);
    rows.push({ rowNumber, data, errors });
  });

  if (rows.length === 0) {
    throw new AppError('OPS_018', 422, 'The sheet has no data rows. Fill in at least one row below the header.');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      'OPS_018',
      422,
      `The sheet has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split the file and import in parts.`,
    );
  }

  // Two rows for the same record in one sheet: the second used to silently overwrite the first.
  const seenKeys = new Map<string, number>();
  for (const r of rows) {
    for (const key of duplicateKeysOf(entityType, r.data)) {
      const first = seenKeys.get(key);
      if (first !== undefined) {
        r.errors.push({ rowNumber: r.rowNumber, field: '(duplicate)', message: `Same record as row ${first} (${key.replace(/^[a-z]+:/, '')})` });
      } else {
        seenKeys.set(key, r.rowNumber);
      }
    }
  }

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
    chainId: chainId ? new mongoose.Types.ObjectId(chainId) : undefined,
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

  const existingBatch = await ImportBatch.findById(batchId).select('status errorRows');
  if (!existingBatch) throw new AppError('OPS_019', 404, 'Import batch not found.');
  if (existingBatch.status !== 'previewed' && existingBatch.status !== 'committing')
    throw new AppError('OPS_020', 409, `Batch status is "${existingBatch.status}" — only "previewed" batches can be committed.`);
  if (existingBatch.errorRows > 0)
    throw new AppError('OPS_021', 422, `Batch has ${existingBatch.errorRows} row error(s). Fix the file and re-upload before committing.`);

  // Atomic claim: previewed -> committing. Two concurrent commits (double click, two tabs) used
  // to both run the whole upsert; one would then crash on a unique index or double-apply. Only
  // one request can win this update. A claim untouched for 10 minutes is treated as abandoned.
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const batch = await ImportBatch.findOneAndUpdate(
    {
      _id: batchId,
      $or: [{ status: 'previewed' }, { status: 'committing', updatedAt: { $lt: staleBefore } }],
    },
    { $set: { status: 'committing' } },
    { new: true },
  );
  if (!batch) {
    throw new AppError('OPS_020', 409, 'This batch is already being committed, or has been committed. Reload to see the result.');
  }

  try {
    return await runCommit(batch, batchId, actorId);
  } catch (err) {
    // Release the claim so the user can fix the cause and commit again (upserts are idempotent).
    await ImportBatch.updateOne({ _id: batchId, status: 'committing' }, { $set: { status: 'previewed' } }).catch(() => undefined);
    throw err;
  }
}

async function runCommit(
  batch: InstanceType<typeof ImportBatch>,
  batchId: string,
  actorId: string,
): Promise<CommitResult> {
  const storedRows = (batch.rows ?? []) as Array<{ rowNumber: number; data: Record<string, unknown> }>;
  const validRows: ParsedRow[] = storedRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data, errors: [] }));

  // Defence in depth for batches previewed before duplicate detection existed.
  const dupSeen = new Map<string, number>();
  const dupErrors: string[] = [];
  for (const r of validRows) {
    for (const key of duplicateKeysOf(batch.entityType, r.data)) {
      const first = dupSeen.get(key);
      if (first !== undefined) dupErrors.push(`Row ${r.rowNumber}: same record as row ${first}`);
      else dupSeen.set(key, r.rowNumber);
    }
  }
  if (dupErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — duplicate rows in the sheet:\n${dupErrors.join('\n')}`);
  }
  if (validRows.length === 0) {
    throw new AppError('OPS_018', 422, 'This batch has no rows to import.');
  }

  const actorOid = new mongoose.Types.ObjectId(actorId);

  let createdCount = 0;
  let updatedCount = 0;
  let rowOutcomes: RowOutcome[] | undefined;

  if (batch.entityType === 'CANTEEN') {
    ({ createdCount, updatedCount, rowOutcomes } = await upsertCanteens(validRows, actorOid));
  } else if (batch.entityType === 'MANUFACTURER') {
    ({ createdCount, updatedCount, rowOutcomes } = await upsertManufacturers(validRows, actorOid));
  } else if (batch.entityType === 'PRODUCT') {
    ({ createdCount, updatedCount, rowOutcomes } = await upsertProducts(validRows, actorOid));
  } else if (batch.entityType === 'ADDRESS') {
    ({ createdCount, updatedCount } = await upsertAddresses(validRows, actorOid));
  } else if (batch.entityType === 'PRICE_LIST') {
    ({ createdCount, updatedCount } = await upsertPriceLists(validRows, actorOid));
  } else if (batch.entityType === 'COMMISSION_RULE') {
    ({ createdCount, updatedCount } = await upsertCommissionRules(validRows, actorOid));
  } else if (batch.entityType === 'CHAIN_LINES') {
    // Chain lines are imported into one specific chain, recorded on the batch at
    // preview time. Without it there is nowhere to put the rows.
    if (!batch.chainId) {
      throw new AppError(
        'OPS_058',
        422,
        'This import is not linked to a chain. Start the import from the chain you want to load lines into.',
      );
    }
    ({ createdCount, updatedCount } = await replaceChainLines(
      validRows,
      actorOid,
      String(batch.chainId),
    ));
  } else {
    throw new AppError('OPS_018', 422, `Commit not yet implemented for entity type "${batch.entityType}".`);
  }

  await ImportBatch.findByIdAndUpdate(batchId, {
    status: 'committed',
    importedRows: createdCount + updatedCount,
    createdCount,
    updatedCount,
  });

  return { batchId, status: 'committed', createdCount, updatedCount, rowOutcomes };
}

export async function discardBatch(batchId: string): Promise<void> {
  await connectDB();
  // Only an uncommitted batch can be discarded — discarding a committed one used to rewrite
  // history (the data stayed, the record said "discarded").
  const res = await ImportBatch.updateOne(
    { _id: batchId, status: { $in: ['previewed', 'discarded'] } },
    { $set: { status: 'discarded' } },
  );
  if (res.matchedCount === 0) {
    const exists = await ImportBatch.exists({ _id: batchId });
    if (!exists) throw new AppError('OPS_019', 404, 'Import batch not found.');
    throw new AppError('OPS_020', 409, 'This batch has already been committed or is being committed and cannot be discarded.');
  }
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
): Promise<{ createdCount: number; updatedCount: number; rowOutcomes: RowOutcome[] }> {
  // Phase 1: resolve all parentCanteenCode references before writing anything.
  // A parent may already exist in the DB, OR be a "main" row defined earlier in
  // this same sheet — the latter is resolved in Phase 2 once that row is created.
  const parentCodeCache = new Map<string, mongoose.Types.ObjectId>();
  const inSheetMainCodes = new Set(
    rows.filter((r) => str(r.data.type).toLowerCase() === 'main').map((r) => str(r.data.code).toUpperCase()),
  );
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
    if (parentCodeCache.has(parentCodeUpper) || inSheetMainCodes.has(parentCodeUpper)) continue;

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
    const parsed = CreateCanteenSchema.safeParse(canteenCandidate(row.data));
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

  // `type` is immutable through the single-record API (UpdateCanteenSchema has no such field).
  // An import must not flip an existing main into a subsidiary (or back) and orphan its children.
  const immutableErrors: string[] = [];
  for (const row of rows) {
    const existing = await Canteen.findOne({ code: str(row.data.code).toUpperCase() })
      .select('type parentCanteenId')
      .lean<{ type: string; parentCanteenId?: mongoose.Types.ObjectId }>();
    if (!existing) continue;
    const wantedType = str(row.data.type).toLowerCase();
    if (existing.type !== wantedType) {
      immutableErrors.push(`Row ${row.rowNumber}: ${str(row.data.code).toUpperCase()} is an existing ${existing.type} canteen; its type cannot be changed by import`);
      continue;
    }
    const rawParent = strOpt(row.data.parentCanteenCode);
    if (wantedType === 'subsidiary' && rawParent && existing.parentCanteenId) {
      const parent = await Canteen.findOne({ code: rawParent.toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (parent && String(parent._id) !== String(existing.parentCanteenId)) {
        immutableErrors.push(`Row ${row.rowNumber}: ${str(row.data.code).toUpperCase()} already belongs to a different parent canteen; the parent cannot be changed by import`);
      }
    }
  }
  if (immutableErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — fields that cannot be changed by import:\n${immutableErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows. Mains are processed first so a subsidiary row
  // that references a main defined earlier in the SAME sheet can resolve it.
  let createdCount = 0;
  let updatedCount = 0;
  const rowOutcomes: RowOutcome[] = [];
  const orderedRows = [...rows].sort((a, b) => {
    const aMain = str(a.data.type).toLowerCase() === 'main' ? 0 : 1;
    const bMain = str(b.data.type).toLowerCase() === 'main' ? 0 : 1;
    return aMain - bMain;
  });

  for (const row of orderedRows) {
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
    let savedId: mongoose.Types.ObjectId;
    if (existing) {
      await Canteen.findByIdAndUpdate(existing._id, { $set: fields });
      savedId = existing._id;
      updatedCount++;
      rowOutcomes.push({ rowNumber: row.rowNumber, key: codeUpper, action: 'updated' });
    } else {
      const created = await Canteen.create({ ...fields, code: codeUpper, isActive: true, createdBy: actorOid });
      savedId = created._id as mongoose.Types.ObjectId;
      createdCount++;
      rowOutcomes.push({ rowNumber: row.rowNumber, key: codeUpper, action: 'created' });
    }
    if (type === 'main') parentCodeCache.set(codeUpper, savedId);
  }

  return { createdCount, updatedCount, rowOutcomes };
}

async function upsertManufacturers(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number; rowOutcomes: RowOutcome[] }> {
  // Phase 1: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const parsed = CreateManufacturerSchema.safeParse(manufacturerCandidate(row.data));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // DefaultCommissionRuleId can only point at a rule that targets THIS manufacturer, so the
  // manufacturer has to exist already (create the rule, then set it on the next import).
  const ruleErrors: string[] = [];
  for (const row of rows) {
    const ruleId = strOpt(row.data.defaultCommissionRuleId);
    if (!ruleId) continue;
    const mfr = await Manufacturer.findOne({ code: str(row.data.code).toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    if (!mfr) {
      ruleErrors.push(`Row ${row.rowNumber}: DefaultCommissionRuleId cannot be set on a new manufacturer — import it first, add the rule, then set it`);
      continue;
    }
    try {
      await assertDefaultCommissionRule(String(mfr._id), ruleId);
    } catch (err) {
      if (err instanceof AppError) { ruleErrors.push(`Row ${row.rowNumber}: ${err.message}`); continue; }
      throw err;
    }
  }
  if (ruleErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${ruleErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows.
  let createdCount = 0;
  let updatedCount = 0;
  const rowOutcomes: RowOutcome[] = [];

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
    if (strOpt(row.data.portalName)) fields.portalName = str(row.data.portalName);
    if (strOpt(row.data.portalUrl)) fields.portalUrl = str(row.data.portalUrl);
    if (strOpt(row.data.additionalEmails)) fields.additionalEmails = splitEmails(row.data.additionalEmails).map((e) => e.toLowerCase());
    if (strOpt(row.data.defaultCommissionRuleId)) fields.defaultCommissionRuleId = new mongoose.Types.ObjectId(str(row.data.defaultCommissionRuleId));

    const existing = await Manufacturer.findOne({ code: codeUpper }).lean<{ _id: mongoose.Types.ObjectId }>();
    if (existing) {
      await Manufacturer.findByIdAndUpdate(existing._id, { $set: fields });
      updatedCount++;
      rowOutcomes.push({ rowNumber: row.rowNumber, key: codeUpper, action: 'updated' });
    } else {
      await Manufacturer.create({ ...fields, code: codeUpper, isActive: true, createdBy: actorOid });
      createdCount++;
      rowOutcomes.push({ rowNumber: row.rowNumber, key: codeUpper, action: 'created' });
    }
  }

  return { createdCount, updatedCount, rowOutcomes };
}

async function upsertProducts(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number; rowOutcomes: RowOutcome[] }> {
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
    const parsed = CreateProductSchema.safeParse(
      productCandidate(row.data, mfrCodeCache.get(str(row.data.manufacturerCode).toUpperCase())?.toString()),
    );
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
  const rowOutcomes: RowOutcome[] = [];

  // A product's manufacturer is not editable through the single-record API. Re-pointing it here
  // would leave existing chain lines and price lists attached to the wrong manufacturer.
  const moveErrors: string[] = [];
  for (const row of rows) {
    const existing = await Product.findOne({ sku: str(row.data.sku).toUpperCase() })
      .select('manufacturerId')
      .lean<{ manufacturerId: mongoose.Types.ObjectId }>();
    const wanted = mfrCodeCache.get(str(row.data.manufacturerCode).toUpperCase());
    if (existing && wanted && String(existing.manufacturerId) !== String(wanted)) {
      moveErrors.push(`Row ${row.rowNumber}: SKU ${str(row.data.sku).toUpperCase()} already exists under a different manufacturer; it cannot be moved by import`);
    }
  }
  if (moveErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — fields that cannot be changed by import:\n${moveErrors.join('\n')}`);
  }

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
      rowOutcomes.push({ rowNumber: row.rowNumber, key: skuUpper, action: 'updated' });
    } else {
      await Product.create({ ...fields, sku: skuUpper, isActive: true, createdBy: actorOid });
      createdCount++;
      rowOutcomes.push({ rowNumber: row.rowNumber, key: skuUpper, action: 'created' });
    }
  }

  return { createdCount, updatedCount, rowOutcomes };
}


async function upsertAddresses(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  // Phase 1: resolve OwnerCode -> ownerId for canteen/manufacturer owners.
  const ownerCache = new Map<string, mongoose.Types.ObjectId>();
  const relationErrors: string[] = [];

  for (const row of rows) {
    const ownerType = str(row.data.ownerType).toLowerCase();
    const ownerCode = strOpt(row.data.ownerCode);
    if (ownerType === 'company') continue;
    if (!ownerCode) {
      relationErrors.push(`Row ${row.rowNumber}: OwnerCode is required when OwnerType is "${ownerType}"`);
      continue;
    }
    const cacheKey = `${ownerType}:${ownerCode.toUpperCase()}`;
    if (ownerCache.has(cacheKey)) continue;

    const Model = ownerType === 'canteen' ? Canteen : ownerType === 'manufacturer' ? Manufacturer : null;
    if (!Model) {
      relationErrors.push(`Row ${row.rowNumber}: OwnerType must be canteen, manufacturer or company`);
      continue;
    }
    const owner = await Model.findOne({ code: ownerCode.toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    if (!owner) {
      relationErrors.push(`Row ${row.rowNumber}: OwnerCode "${ownerCode}" not found for ${ownerType}`);
    } else {
      ownerCache.set(cacheKey, owner._id);
    }
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Phase 1b: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const ownerType = str(row.data.ownerType).toLowerCase() as 'canteen' | 'manufacturer' | 'company';
    const parsed = CreateAddressSchema.safeParse(addressCandidate(row.data));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'ownerId') continue; // placeholder-only failure, ignore
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Phase 2: upsert all rows. Dedup key: ownerType + ownerId + label.
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const ownerType = str(row.data.ownerType).toLowerCase() as 'canteen' | 'manufacturer' | 'company';
    const ownerCode = strOpt(row.data.ownerCode);
    const ownerId = ownerType === 'company' ? undefined : ownerCache.get(`${ownerType}:${ownerCode!.toUpperCase()}`);

    const fields: Record<string, unknown> = {
      ownerType,
      ownerId,
      label: str(row.data.label),
      addressType: str(row.data.addressType),
      line1: str(row.data.line1),
      line2: strOpt(row.data.line2),
      city: str(row.data.city),
      state: str(row.data.state),
      stateCode: str(row.data.stateCode).toUpperCase(),
      pincode: str(row.data.pincode),
      isDefault: String(row.data.isDefault ?? '').toLowerCase() === 'true',
      updatedBy: actorOid,
    };
    if (strOpt(row.data.gstin)) fields.gstin = str(row.data.gstin).toUpperCase();

    const existing = await OpsAddress.findOne({ ownerType, ownerId: ownerId ?? null, label: fields.label })
      .lean<{ _id: mongoose.Types.ObjectId }>();
    let savedId: mongoose.Types.ObjectId;
    if (existing) {
      await OpsAddress.findByIdAndUpdate(existing._id, { $set: fields });
      savedId = existing._id;
      updatedCount++;
    } else {
      const created = await OpsAddress.create({ ...fields, isActive: true, createdBy: actorOid });
      savedId = created._id as mongoose.Types.ObjectId;
      createdCount++;
    }
    // Same rule as AddressService: one default per owner + address type. Without this an import
    // could leave two "default" addresses and the ship-to pick would be arbitrary.
    if (fields.isDefault && ownerId) {
      await OpsAddress.updateMany(
        { ownerType, ownerId, addressType: fields.addressType, isDefault: true, _id: { $ne: savedId } },
        { $set: { isDefault: false, updatedBy: actorOid } },
      );
    }
  }

  return { createdCount, updatedCount };
}

async function upsertCommissionRules(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  // Phase 1: resolve ScopeCode -> the id field matching each row's scope.
  const scopeCache = new Map<string, mongoose.Types.ObjectId>();
  const relationErrors: string[] = [];

  for (const row of rows) {
    const scope = str(row.data.scope).toLowerCase();
    const scopeCode = strOpt(row.data.scopeCode);
    if (!scopeCode) {
      relationErrors.push(`Row ${row.rowNumber}: ScopeCode is required`);
      continue;
    }
    const cacheKey = `${scope}:${scopeCode.toUpperCase()}`;
    if (scopeCache.has(cacheKey)) continue;

    if (scope === 'manufacturer') {
      const m = await Manufacturer.findOne({ code: scopeCode.toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (!m) { relationErrors.push(`Row ${row.rowNumber}: ScopeCode "${scopeCode}" not found (manufacturer)`); continue; }
      scopeCache.set(cacheKey, m._id);
    } else if (scope === 'canteen') {
      const c = await Canteen.findOne({ code: scopeCode.toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (!c) { relationErrors.push(`Row ${row.rowNumber}: ScopeCode "${scopeCode}" not found (canteen)`); continue; }
      scopeCache.set(cacheKey, c._id);
    } else if (scope === 'product') {
      const p = await Product.findOne({ sku: scopeCode.toUpperCase() }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (!p) { relationErrors.push(`Row ${row.rowNumber}: ScopeCode "${scopeCode}" not found (product SKU)`); continue; }
      scopeCache.set(cacheKey, p._id);
    } else {
      relationErrors.push(`Row ${row.rowNumber}: Scope must be manufacturer, product or canteen`);
    }
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Phase 1b: format validation — same schema the single-record API uses.
  const formatErrors: string[] = [];
  for (const row of rows) {
    const scope = str(row.data.scope).toLowerCase() as 'manufacturer' | 'product' | 'canteen';
    const scopeId = scopeCache.get(`${scope}:${str(row.data.scopeCode).toUpperCase()}`)?.toString();
    const parsed = CreateCommissionRuleSchema.safeParse(commissionCandidate(row.data, scopeId));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        formatErrors.push(`Row ${row.rowNumber}: ${issue.path.join('.')} — ${issue.message}`);
      }
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Overlap checks before the first write — the single-record API enforces these and the
  // import used to bypass them, leaving two active rules for the same window.
  const overlapErrors: string[] = [];
  const planned: Array<{ scope: 'manufacturer' | 'product' | 'canteen'; scopeId: mongoose.Types.ObjectId; from: string; to?: string; rowNumber: number }> = [];
  for (const row of rows) {
    const scope = str(row.data.scope).toLowerCase() as 'manufacturer' | 'product' | 'canteen';
    const scopeId = scopeCache.get(`${scope}:${str(row.data.scopeCode).toUpperCase()}`)!;
    const scopeField = `${scope}Id`;
    const from = str(row.data.effectiveFrom).slice(0, 10);
    const to = strOpt(row.data.effectiveTo)?.slice(0, 10);
    const existing = await CommissionRule.findOne({ scope, [scopeField]: scopeId, effectiveFrom: new Date(from) })
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId }>();
    try {
      await assertNoCommissionOverlap(scope, scopeId, new Date(from), to ? new Date(to) : undefined, existing?._id);
    } catch (err) {
      if (err instanceof AppError) { overlapErrors.push(`Row ${row.rowNumber}: ${err.message}`); continue; }
      throw err;
    }
    planned.push({ scope, scopeId, from, to, rowNumber: row.rowNumber });
  }
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const A = planned[i]; const B = planned[j];
      if (A.scope !== B.scope || String(A.scopeId) !== String(B.scopeId)) continue;
      if (A.from <= (B.to ?? '9999-12-31') && B.from <= (A.to ?? '9999-12-31')) {
        overlapErrors.push(`Row ${B.rowNumber}: date range overlaps the rule on row ${A.rowNumber} for the same scope`);
      }
    }
  }
  if (overlapErrors.length > 0) {
    throw new AppError('OPS_023', 422, `Commit blocked — overlapping commission rules:\n${overlapErrors.join('\n')}`);
  }

  // Phase 2: upsert. Dedup key: scope + scopeId + effectiveFrom (a rule is
  // versioned by its start date, matching how the single-record API treats it).
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const scope = str(row.data.scope).toLowerCase() as 'manufacturer' | 'product' | 'canteen';
    const scopeId = scopeCache.get(`${scope}:${str(row.data.scopeCode).toUpperCase()}`)!;
    const scopeField = `${scope}Id`;
    const effectiveFrom = new Date(str(row.data.effectiveFrom).slice(0, 10));

    const fields: Record<string, unknown> = {
      scope,
      [scopeField]: scopeId,
      type: str(row.data.type),
      value: numOpt(row.data.value),
      effectiveFrom,
      updatedBy: actorOid,
    };
    const unsetRule: Record<string, ''> = {};
    if (strOpt(row.data.effectiveTo)) fields.effectiveTo = new Date(str(row.data.effectiveTo).slice(0, 10));
    else unsetRule.effectiveTo = ''; // blank EffectiveTo = open-ended, not "keep the old end date"
    if (row.data.gstApplicable !== undefined) fields.gstApplicable = String(row.data.gstApplicable).toLowerCase() === 'true';
    if (strOpt(row.data.sacCode)) fields.sacCode = str(row.data.sacCode);
    if (strOpt(row.data.notes)) fields.notes = str(row.data.notes);

    // Atomic upsert on the dedup key (backed by a matching unique index) —
    // closes the check-then-act race a separate findOne+create/update leaves
    // open between two concurrent imports of the same scope+id+date.
    const result = await CommissionRule.findOneAndUpdate(
      { scope, [scopeField]: scopeId, effectiveFrom },
      {
        $set: fields,
        ...(Object.keys(unsetRule).length ? { $unset: unsetRule } : {}),
        $setOnInsert: { isActive: true, createdBy: actorOid },
      },
      { upsert: true, new: false },
    );
    if (result) updatedCount++; else createdCount++;
  }

  return { createdCount, updatedCount };
}

/**
 * Price lists don't map one row to one document — a list has many product/rate
 * lines. Rows sharing the same (ManufacturerCode, CanteenCode, EffectiveFrom)
 * are grouped into a single PriceList document, matching how the sheet a
 * canteen actually sends looks: one header block, many SKU/Rate lines.
 */
async function upsertPriceLists(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
): Promise<{ createdCount: number; updatedCount: number }> {
  const mfrCache = new Map<string, mongoose.Types.ObjectId>();
  const canteenCache = new Map<string, mongoose.Types.ObjectId>();
  const productCache = new Map<string, mongoose.Types.ObjectId>();
  const relationErrors: string[] = [];

  for (const row of rows) {
    const mfrCode = strOpt(row.data.manufacturerCode);
    const canteenCode = strOpt(row.data.canteenCode);
    const sku = strOpt(row.data.sku);

    if (!mfrCode) { relationErrors.push(`Row ${row.rowNumber}: ManufacturerCode is required`); continue; }
    if (!sku) { relationErrors.push(`Row ${row.rowNumber}: SKU is required`); continue; }

    const mfrKey = mfrCode.toUpperCase();
    if (!mfrCache.has(mfrKey)) {
      const m = await Manufacturer.findOne({ code: mfrKey }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (!m) { relationErrors.push(`Row ${row.rowNumber}: ManufacturerCode "${mfrCode}" not found`); continue; }
      mfrCache.set(mfrKey, m._id);
    }

    if (canteenCode) {
      const cKey = canteenCode.toUpperCase();
      if (!canteenCache.has(cKey)) {
        const c = await Canteen.findOne({ code: cKey }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
        if (!c) { relationErrors.push(`Row ${row.rowNumber}: CanteenCode "${canteenCode}" not found`); continue; }
        canteenCache.set(cKey, c._id);
      }
    }

    const skuKey = sku.toUpperCase();
    if (!productCache.has(skuKey)) {
      const p = await Product.findOne({ sku: skuKey }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
      if (!p) { relationErrors.push(`Row ${row.rowNumber}: SKU "${sku}" not found`); continue; }
      productCache.set(skuKey, p._id);
    }
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Group rows into one PriceList per (manufacturerCode, canteenCode, effectiveFrom). Dates are
  // keyed by their calendar day, so "2026-01-01" typed as text and as an Excel date land in the
  // same group instead of two groups silently overwriting one document.
  interface PriceGroup {
    manufacturerId: mongoose.Types.ObjectId;
    canteenId?: mongoose.Types.ObjectId;
    effectiveFrom: string;
    effectiveTo?: string;
    items: { productId: mongoose.Types.ObjectId; rate: number }[];
    rowNumbers: number[];
  }
  const groups = new Map<string, PriceGroup>();
  const formatErrors: string[] = [];
  for (const row of rows) {
    const mfrKey = str(row.data.manufacturerCode).toUpperCase();
    const canteenKey = strOpt(row.data.canteenCode)?.toUpperCase();
    const effectiveFrom = str(row.data.effectiveFrom).slice(0, 10);
    const effectiveTo = strOpt(row.data.effectiveTo)?.slice(0, 10);
    const groupKey = `${mfrKey}|${canteenKey ?? ''}|${effectiveFrom}`;

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        manufacturerId: mfrCache.get(mfrKey)!,
        canteenId: canteenKey ? canteenCache.get(canteenKey) : undefined,
        effectiveFrom,
        effectiveTo,
        items: [],
        rowNumbers: [],
      };
      groups.set(groupKey, group);
    } else if ((group.effectiveTo ?? '') !== (effectiveTo ?? '')) {
      formatErrors.push(`Row ${row.rowNumber}: EffectiveTo differs from the other rows of the same list (${groupKey})`);
    }
    const rate = numOpt(row.data.rate);
    group.items.push({ productId: productCache.get(str(row.data.sku).toUpperCase())!, rate: rate as number });
    group.rowNumbers.push(row.rowNumber);
  }

  // Group-level validation with the same schema the single-record API uses (dates, rate bounds
  // and precision, duplicate products, effectiveTo >= effectiveFrom). Price lists previously
  // skipped this and used a hand-rolled check that had drifted.
  for (const group of groups.values()) {
    const parsed = CreatePriceListSchema.safeParse({
      manufacturerId: group.manufacturerId.toString(),
      canteenId: group.canteenId?.toString(),
      effectiveFrom: group.effectiveFrom,
      effectiveTo: group.effectiveTo,
      items: group.items.map((i) => ({ productId: i.productId.toString(), rate: i.rate })),
    });
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      const idx = issue.path[0] === 'items' && typeof issue.path[1] === 'number' ? issue.path[1] : 0;
      const rowNo = group.rowNumbers[idx] ?? group.rowNumbers[0];
      // The duplicate-product refine has no item index; the row-level check below names the rows.
      if (issue.message.startsWith('Duplicate products')) continue;
      formatErrors.push(`Row ${rowNo}: ${issue.path.join('.')} — ${issue.message}`);
    }
  }

  // Duplicate products inside one list: name the rows rather than a generic message.
  for (const group of groups.values()) {
    const seen = new Map<string, number>();
    group.items.forEach((item, idx) => {
      const key = item.productId.toString();
      if (seen.has(key)) {
        formatErrors.push(`Row ${group.rowNumbers[idx]}: SKU already appears on row ${group.rowNumbers[seen.get(key)!]} for the same ManufacturerCode/CanteenCode/EffectiveFrom group`);
      } else {
        seen.set(key, idx);
      }
    });
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Reference + overlap checks for every list BEFORE the first write. The single-record API
  // enforces both; the import used to bypass them, so a sheet could create products under the
  // wrong manufacturer or two active lists covering the same dates.
  const refErrors: string[] = [];
  const planned: Array<{ group: PriceGroup; existingId?: mongoose.Types.ObjectId }> = [];
  for (const group of groups.values()) {
    try {
      await assertPriceListRefs(
        group.manufacturerId.toString(),
        group.canteenId?.toString(),
        group.items.map((i) => i.productId.toString()),
      );
    } catch (err) {
      if (err instanceof AppError) { refErrors.push(`Row ${group.rowNumbers[0]}: ${err.message}`); continue; }
      throw err;
    }
    const existing = await PriceList.findOne({
      manufacturerId: group.manufacturerId,
      canteenId: group.canteenId ?? { $exists: false },
      effectiveFrom: new Date(group.effectiveFrom),
    }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>();
    try {
      await assertNoPriceListOverlap(
        group.manufacturerId,
        group.canteenId,
        new Date(group.effectiveFrom),
        group.effectiveTo ? new Date(group.effectiveTo) : undefined,
        existing?._id,
      );
    } catch (err) {
      if (err instanceof AppError) { refErrors.push(`Row ${group.rowNumbers[0]}: ${err.message}`); continue; }
      throw err;
    }
    planned.push({ group, existingId: existing?._id });
  }
  // Overlap between two lists of the same sheet (invisible to the database check above).
  const byScope = new Map<string, PriceGroup[]>();
  for (const { group } of planned) {
    const k = `${group.manufacturerId}|${group.canteenId ?? ''}`;
    byScope.set(k, [...(byScope.get(k) ?? []), group]);
  }
  for (const list of byScope.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]; const B = list[j];
        const aEnd = A.effectiveTo ?? '9999-12-31'; const bEnd = B.effectiveTo ?? '9999-12-31';
        if (A.effectiveFrom <= bEnd && B.effectiveFrom <= aEnd) {
          refErrors.push(`Row ${B.rowNumbers[0]}: date range overlaps the list starting ${A.effectiveFrom} (row ${A.rowNumbers[0]}) in the same sheet`);
        }
      }
    }
  }
  if (refErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${refErrors.join('\n')}`);
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const { group } of planned) {
    const fields: Record<string, unknown> = {
      manufacturerId: group.manufacturerId,
      canteenId: group.canteenId,
      effectiveFrom: new Date(group.effectiveFrom),
      items: group.items,
      updatedBy: actorOid,
    };
    const unset: Record<string, ''> = {};
    if (group.effectiveTo) fields.effectiveTo = new Date(group.effectiveTo);
    else unset.effectiveTo = ''; // a blank EffectiveTo in the sheet means open-ended, not "keep the old end date"

    // Atomic upsert on the dedup key (backed by the unique index on manufacturer + canteen +
    // effectiveFrom) — closes the check-then-act race between two concurrent imports.
    const result = await PriceList.findOneAndUpdate(
      {
        manufacturerId: group.manufacturerId,
        canteenId: group.canteenId ?? { $exists: false },
        effectiveFrom: new Date(group.effectiveFrom),
      },
      {
        $set: fields,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $setOnInsert: { isActive: true, createdBy: actorOid },
      },
      { upsert: true, new: false },
    );
    if (result) updatedCount++; else createdCount++;
  }

  return { createdCount, updatedCount };
}

// ─── Chain line items (Phase 30.02) ────────────────────────────────────

/**
 * Column mapping for a chain-lines sheet. Exported so the preview route and the
 * downloadable template stay in step with what commit actually accepts.
 */
export const CHAIN_LINES_COLUMN_MAPPING: Record<string, string> = {
  SKU: 'sku',
  Item: 'rawDescription',
  Description: 'rawDescription',
  UOM: 'uom',
  PackSize: 'packSize',
  PoQty: 'originalQty',
  POQty: 'originalQty',
  FinalQty: 'alteredQty',
  AlteredQty: 'alteredQty',
  VarianceReason: 'varianceReason',
  VarianceNote: 'varianceNote',
  Rate: 'rate',
  GSTRatePercent: 'gstRatePercent',
};

/**
 * Row validator for chain lines. Mirrors ChainLineInputSchema's rules, but
 * reports them per row so the preview screen can show exactly which line is
 * wrong before anything is committed.
 */
export function validateChainLineRow(
  data: Record<string, unknown>,
  rowNumber: number,
): RowError[] {
  const errors: RowError[] = [];

  const sku = strOpt(data.sku);
  const description = strOpt(data.rawDescription);
  if (!sku && !description) {
    errors.push({ rowNumber, field: 'SKU', message: 'Provide either a SKU or an item description' });
  }

  const originalQty = numOpt(data.originalQty);
  const alteredQty = numOpt(data.alteredQty);

  if (originalQty === undefined || originalQty < 0) {
    errors.push({ rowNumber, field: 'PoQty', message: 'PoQty must be a number of zero or more' });
  }
  if (alteredQty === undefined || alteredQty < 0) {
    errors.push({ rowNumber, field: 'FinalQty', message: 'FinalQty must be a number of zero or more' });
  }

  const reason = strOpt(data.varianceReason);
  if (
    originalQty !== undefined &&
    alteredQty !== undefined &&
    originalQty !== alteredQty &&
    !reason
  ) {
    errors.push({
      rowNumber,
      field: 'VarianceReason',
      message: 'A variance reason is required when FinalQty differs from PoQty',
    });
  }
  if (reason && !(VARIANCE_REASONS as readonly string[]).includes(reason.toUpperCase())) {
    errors.push({
      rowNumber,
      field: 'VarianceReason',
      message: `Unknown variance reason. Use one of: ${VARIANCE_REASONS.join(', ')}`,
    });
  }
  if (reason && reason.toUpperCase() === 'OTHER' && !strOpt(data.varianceNote)) {
    errors.push({
      rowNumber,
      field: 'VarianceNote',
      message: 'A note is required when the variance reason is OTHER',
    });
  }

  const rate = numOpt(data.rate);
  if (rate !== undefined && rate < 0) {
    errors.push({ rowNumber, field: 'Rate', message: 'Rate cannot be negative' });
  }

  const gst = numOpt(data.gstRatePercent);
  if (gst !== undefined && (gst < 0 || gst > 100)) {
    errors.push({ rowNumber, field: 'GSTRatePercent', message: 'GST rate must be between 0 and 100' });
  }

  // Same ceilings as ChainLineInputSchema, so a paste error (an extra 0, a phone number in the
  // qty column) is caught here instead of producing a billion-rupee chain.
  if (originalQty !== undefined && originalQty > 10_000_000) {
    errors.push({ rowNumber, field: 'PoQty', message: 'PoQty is unrealistically large (max 10,000,000)' });
  }
  if (alteredQty !== undefined && alteredQty > 10_000_000) {
    errors.push({ rowNumber, field: 'FinalQty', message: 'FinalQty is unrealistically large (max 10,000,000)' });
  }
  if (rate !== undefined && (rate > 1_000_000_000 || Math.abs(Math.round(rate * 100) - rate * 100) > 1e-6)) {
    errors.push({ rowNumber, field: 'Rate', message: 'Rate must be at most 1,000,000,000 with at most 2 decimal places' });
  }
  const packSizeVal = numOpt(data.packSize);
  if (data.packSize !== undefined && data.packSize !== null && data.packSize !== '' && (packSizeVal === undefined || packSizeVal <= 0 || packSizeVal > 1_000_000)) {
    errors.push({ rowNumber, field: 'PackSize', message: 'PackSize must be a positive number up to 1,000,000' });
  }
  if ((strOpt(data.rawDescription)?.length ?? 0) > 300) {
    errors.push({ rowNumber, field: 'Item', message: 'Description is longer than 300 characters' });
  }
  if ((strOpt(data.varianceNote)?.length ?? 0) > 500) {
    errors.push({ rowNumber, field: 'VarianceNote', message: 'Note is longer than 500 characters' });
  }
  if ((strOpt(data.uom)?.length ?? 0) > 20) {
    errors.push({ rowNumber, field: 'UOM', message: 'UOM is longer than 20 characters' });
  }

  return errors;
}

/**
 * Replaces a chain's line items from an imported sheet.
 *
 * Same two-phase approach as the other entities: every SKU is resolved and every
 * row validated before a single write happens, so a bad sheet cannot leave a
 * chain half-loaded. Lines are replaced rather than merged, which matches how the
 * altered order is edited on screen and keeps the recalculated totals correct.
 */
async function replaceChainLines(
  rows: ParsedRow[],
  actorOid: mongoose.Types.ObjectId,
  chainId: string,
): Promise<{ createdCount: number; updatedCount: number }> {
  await connectDB();

  const chain = await Chain.findById(chainId);
  if (!chain) throw new AppError('OPS_031', 404, 'Chain not found.');

  // Refuse to touch a chain whose lines are already locked or which is finished.
  if (chain.status === 'CLOSED' || chain.status === 'CANCELLED') {
    throw new AppError('OPS_033', 409, `Chain is ${chain.status}; its lines can no longer be changed.`);
  }
  if (!ChainService.linesEditable(chain.status as Parameters<typeof ChainService.linesEditable>[0])) {
    throw new AppError(
      'OPS_061',
      409,
      `Line items are locked once the chain reaches ${chain.status}. Move it back before importing lines.`,
    );
  }

  if (rows.length === 0) {
    throw new AppError('OPS_037', 422, 'The sheet contained no line rows.');
  }

  // Phase 1: resolve every SKU, and reject duplicates within the sheet.
  const skuCache = new Map<string, { id: mongoose.Types.ObjectId; uom: string; gstRatePercent?: number }>();
  const relationErrors: string[] = [];
  const seenSkus = new Set<string>();

  for (const row of rows) {
    const rawSku = strOpt(row.data.sku);
    if (!rawSku) continue;
    const skuUpper = rawSku.toUpperCase();

    if (seenSkus.has(skuUpper)) {
      relationErrors.push(`Row ${row.rowNumber}: SKU "${rawSku}" appears more than once in this sheet`);
      continue;
    }
    seenSkus.add(skuUpper);

    if (skuCache.has(skuUpper)) continue;

    const product = await Product.findOne({ sku: skuUpper, isActive: true })
      .select('_id uom gstRatePercent manufacturerId')
      .lean<{ _id: mongoose.Types.ObjectId; uom: string; gstRatePercent?: number; manufacturerId: mongoose.Types.ObjectId }>();

    if (!product) {
      relationErrors.push(`Row ${row.rowNumber}: SKU "${rawSku}" not found or is inactive`);
      continue;
    }
    // A product from a different manufacturer on this chain is almost always a
    // copy-paste error in the sheet, so it is blocked rather than imported.
    if (String(product.manufacturerId) !== String(chain.manufacturerId)) {
      relationErrors.push(
        `Row ${row.rowNumber}: SKU "${rawSku}" belongs to a different manufacturer than this chain`,
      );
      continue;
    }
    skuCache.set(skuUpper, {
      id: product._id,
      uom: product.uom,
      gstRatePercent: product.gstRatePercent,
    });
  }

  if (relationErrors.length > 0) {
    throw new AppError('OPS_024', 422, `Commit blocked — unresolved references:\n${relationErrors.join('\n')}`);
  }

  // Phase 1b: re-run the row rules at commit time. The file could have been
  // re-uploaded, or the rules tightened, since preview.
  const formatErrors: string[] = [];
  for (const row of rows) {
    for (const e of validateChainLineRow(row.data, row.rowNumber)) {
      formatErrors.push(`Row ${e.rowNumber}: ${e.field} — ${e.message}`);
    }
  }
  if (formatErrors.length > 0) {
    throw new AppError('OPS_025', 422, `Commit blocked — invalid field format:\n${formatErrors.join('\n')}`);
  }

  // Phase 2: build every line first, then swap. The new set is inserted before the old one is
  // retired (and the header totals are compare-and-set), so a failure part-way leaves the old
  // lines intact instead of an emptied chain.
  const previousCount = await ChainLineItem.countDocuments({ chainId: chain._id });

  let sortOrder = 0;
  const docs: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const rawSku = strOpt(row.data.sku);
    const product = rawSku ? skuCache.get(rawSku.toUpperCase()) : undefined;

    const originalQty = numOpt(row.data.originalQty) ?? 0;
    const alteredQty = numOpt(row.data.alteredQty) ?? 0;
    const rate = numOpt(row.data.rate);
    const gstRatePercent = numOpt(row.data.gstRatePercent) ?? product?.gstRatePercent;
    const reason = strOpt(row.data.varianceReason);

    const totals = computeLineTotals({ alteredQty, rate, gstRatePercent });

    docs.push({
      chainId: chain._id,
      productId: product?.id,
      rawDescription: strOpt(row.data.rawDescription),
      uom: strOpt(row.data.uom)?.toUpperCase() ?? product?.uom ?? 'PCS',
      packSize: numOpt(row.data.packSize),
      originalQty,
      alteredQty,
      varianceReason: reason ? reason.toUpperCase() : undefined,
      varianceNote: strOpt(row.data.varianceNote),
      rate,
      gstRatePercent,
      taxableValue: totals.taxableValue,
      taxAmount: totals.taxAmount,
      lineTotal: totals.lineTotal,
      sortOrder: sortOrder++,
    });
  }
  await ChainService.swapLineDocs(chain, docs, actorOid);


  await ChainEvent.create({
    chainId: chain._id,
    eventType: 'LINE_EDITED',
    message: `${rows.length} line item(s) imported from a spreadsheet, replacing ${previousCount}`,
    actorUserId: actorOid,
  });

  return { createdCount: rows.length, updatedCount: 0 };
}
