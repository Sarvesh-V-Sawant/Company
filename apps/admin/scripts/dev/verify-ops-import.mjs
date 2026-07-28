#!/usr/bin/env node
/**
 * End-to-end import flow verification: template → preview → commit → idempotency →
 * discard → format validation (GSTIN, GSTRatePercent) → relation resolution.
 * REFUSES to run in production.
 *
 * Usage (from repo root, with dev server running on :3000):
 *   node apps/admin/scripts/dev/verify-ops-import.mjs
 */

import { createRequire } from 'module';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: NODE_ENV is production.'); process.exit(1);
}

if (!process.env.MONGODB_URI) {
  const envPath = resolve('apps/admin/.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const BASE     = 'http://localhost:3000';
const PASSWORD = process.env.OPS_TEST_PASSWORD || createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16) + 'Aa1!';
const require  = createRequire(import.meta.url);
const mongoose = require('mongoose');
const ExcelJS  = require('exceljs');

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'phased_test_admin@test.local', password: PASSWORD }),
  });
  const j = await res.json();
  if (res.status !== 200 || !j.data?.accessToken) throw new Error(`Login failed: ${JSON.stringify(j)}`);
  return j.data.accessToken;
}
function authHeaders(token) { return { 'Cookie': `__session=${token}` }; }

async function template(token, entity) {
  const res = await fetch(`${BASE}/api/v1/ops/import/template?entity=${entity}`, { headers: authHeaders(token) });
  console.log(`TEMPLATE [${entity}] GET /import/template: ${res.status}`);
  if (res.status !== 200) { console.log('  FAIL'); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb  = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws  = wb.worksheets[0];
  const hdrs = [];
  ws.getRow(1).eachCell(cell => hdrs.push(String(cell.value ?? '')));
  console.log(`  Header row: ${JSON.stringify(hdrs)}`);
  return hdrs;
}

async function buildXlsx(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(headers.map(h => row[h] ?? ''));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function preview(token, entity, xlsxBuf, filename) {
  const fd = new FormData();
  fd.append('entityType', entity);
  fd.append('file', new File([xlsxBuf], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const res = await fetch(`${BASE}/api/v1/ops/import/preview`, { method: 'POST', headers: authHeaders(token), body: fd });
  const j   = await res.json();
  const d   = j.data ?? j;
  console.log(`PREVIEW [${entity}] ${filename}: ${res.status} totalRows=${d.totalRows} validRows=${d.validRows} errorRows=${d.errorRows}`);
  const errs = d.rows?.flatMap(r => r.errors) ?? [];
  errs.forEach(e => console.log(`  row=${e.rowNumber} field=${e.field} message="${e.message}"`));
  return { status: res.status, batchId: d.batchId, errorRows: d.errorRows, validRows: d.validRows };
}

async function commit(token, batchId) {
  const res = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'commit' }),
  });
  const j = await res.json();
  console.log(`COMMIT batchId=${batchId}: ${res.status} ${JSON.stringify(j.data ?? j.error)}`);
  return { status: res.status, data: j.data, error: j.error };
}

async function discard(token, batchId) {
  const res = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'discard' }),
  });
  const j = await res.json();
  console.log(`DISCARD batchId=${batchId}: ${res.status}`);
  return { status: res.status, data: j.data };
}

function getModel(entity) {
  const schemas = {
    CANTEEN:      new mongoose.Schema({ code: String }, { strict: false }),
    MANUFACTURER: new mongoose.Schema({ code: String }, { strict: false }),
    PRODUCT:      new mongoose.Schema({ sku: String },  { strict: false }),
  };
  const names = { CANTEEN: 'Canteen', MANUFACTURER: 'Manufacturer', PRODUCT: 'Product' };
  const name  = names[entity];
  return mongoose.models[name] ?? mongoose.model(name, schemas[entity]);
}

// ── MAIN: template → preview → commit → idempotency → discard, per entity ────

const token = await loginAdmin();
await mongoose.connect(process.env.MONGODB_URI);
console.log('Admin login: OK\n');

const ENTITIES = ['CANTEEN', 'MANUFACTURER', 'PRODUCT'];
const TEST_PREFIX = 'VOI_'; // Verify-Ops-Import prefix — distinct from PHASED_TEST_/IMP_

for (const entity of ENTITIES) {
  console.log(`\n${'='.repeat(60)}\nENTITY: ${entity}\n${'='.repeat(60)}`);
  const headers = await template(token, entity);
  if (!headers) continue;
  const Model = getModel(entity);

  const cleanRows = {
    CANTEEN: [{ Code: `${TEST_PREFIX}C1`, Name: 'VOI Canteen 1', Type: 'main' }],
    MANUFACTURER: [{ Code: `${TEST_PREFIX}M1`, Name: 'VOI Mfr 1', PrimaryEmail: 'voi1@test.local' }],
    PRODUCT: [{ SKU: `${TEST_PREFIX}P1`, Name: 'VOI Product 1', ManufacturerCode: 'PHASED_TEST_MFR1', UOM: 'PCS' }],
  }[entity];

  const cleanBuf = await buildXlsx(headers, cleanRows);
  const { batchId: cleanId } = await preview(token, entity, cleanBuf, `${entity}-clean.xlsx`);

  const before = await Model.countDocuments();
  const c1 = await commit(token, cleanId);
  const after = await Model.countDocuments();
  console.log(`  collection count BEFORE=${before} AFTER=${after} delta=${after - before}`);

  // Idempotency: commit same batchId again — must not double-insert
  const before2 = await Model.countDocuments();
  const c2 = await commit(token, cleanId);
  const after2 = await Model.countDocuments();
  console.log(`  idempotency retry: status=${c2.status} code=${c2.error?.code ?? '-'} delta=${after2 - before2} ${after2 === before2 ? 'PASS' : 'FAIL — DOUBLE INSERT'}`);

  // Discard: preview + discard, zero records land
  const discardBuf = await buildXlsx(headers, cleanRows.map(r => ({ ...r, Code: (r.Code ?? '') + '_D', SKU: (r.SKU ?? '') + '_D' })));
  const { batchId: discardId } = await preview(token, entity, discardBuf, `${entity}-discard.xlsx`);
  const beforeD = await Model.countDocuments();
  await discard(token, discardId);
  const afterD = await Model.countDocuments();
  console.log(`  discard delta=${afterD - beforeD} ${afterD === beforeD ? 'PASS' : 'FAIL'}`);
}

// ── Malformed data: missing required field ────────────────────────────────────

console.log(`\n${'='.repeat(60)}\nMALFORMED: missing required field\n${'='.repeat(60)}`);
{
  const headers = ['Code', 'Name', 'GSTIN', 'PrimaryEmail', 'ContactPerson', 'Phone'];
  const rows = [{ Name: 'No Code Mfr', PrimaryEmail: 'x@y.com' }];
  const buf = await buildXlsx(headers, rows);
  const { batchId, errorRows } = await preview(token, 'MANUFACTURER', buf, 'malformed-missing.xlsx');
  console.log(`  errorRows=${errorRows} (expect >0)`);
  if (batchId) {
    const c = await commit(token, batchId);
    console.log(`  commit while errorRows>0: ${c.status} ${c.status === 422 ? 'PASS — rejected' : 'FAIL'}`);
  }
}

// ── Format validation at commit time: bad GSTIN, bad GSTRatePercent ──────────

console.log(`\n${'='.repeat(60)}\nFORMAT VALIDATION: bad GSTIN (commit-time)\n${'='.repeat(60)}`);
{
  const headers = ['Code', 'Name', 'GSTIN', 'PrimaryEmail', 'ContactPerson', 'Phone'];
  const rows = [{ Code: `${TEST_PREFIX}BADGSTIN`, Name: 'Bad Gstin Mfr', GSTIN: 'NOT_A_VALID_GSTIN', PrimaryEmail: 'badgstin@test.local' }];
  const buf = await buildXlsx(headers, rows);
  const { batchId, errorRows } = await preview(token, 'MANUFACTURER', buf, 'bad-gstin.xlsx');
  console.log(`  preview errorRows=${errorRows} (format not checked at preview — expected 0)`);
  const Manufacturer = getModel('MANUFACTURER');
  const before = await Manufacturer.countDocuments();
  const c = await commit(token, batchId);
  const after = await Manufacturer.countDocuments();
  console.log(`  commit: ${c.status} code=${c.error?.code ?? '-'} ${c.status === 422 ? 'PASS — rejected' : 'FAIL — accepted malformed GSTIN'} (count delta=${after - before})`);
}

console.log(`\n${'='.repeat(60)}\nFORMAT VALIDATION: bad GSTRatePercent (commit-time)\n${'='.repeat(60)}`);
{
  const headers = ['SKU', 'Name', 'ManufacturerCode', 'UOM', 'PackSize', 'HSNCode', 'GSTRatePercent'];
  const rows = [{ SKU: `${TEST_PREFIX}BADRATE`, Name: 'Bad Rate Product', ManufacturerCode: 'PHASED_TEST_MFR1', UOM: 'PCS', GSTRatePercent: 'abc' }];
  const buf = await buildXlsx(headers, rows);
  const { batchId } = await preview(token, 'PRODUCT', buf, 'bad-rate.xlsx');
  const Product = getModel('PRODUCT');
  const before = await Product.countDocuments();
  const c = await commit(token, batchId);
  const after = await Product.countDocuments();
  console.log(`  commit: ${c.status} code=${c.error?.code ?? '-'} ${c.status === 422 ? 'PASS — rejected' : 'FAIL — accepted malformed rate'} (count delta=${after - before})`);
}

// ── Relation resolution: non-existent ManufacturerCode ───────────────────────

console.log(`\n${'='.repeat(60)}\nRELATION RESOLUTION: non-existent ManufacturerCode\n${'='.repeat(60)}`);
{
  const headers = ['SKU', 'Name', 'ManufacturerCode', 'UOM', 'PackSize', 'HSNCode', 'GSTRatePercent'];
  const rows = [{ SKU: `${TEST_PREFIX}NOMFR`, Name: 'No Such Mfr Product', ManufacturerCode: 'DOES_NOT_EXIST_CODE', UOM: 'PCS' }];
  const buf = await buildXlsx(headers, rows);
  const { batchId, errorRows } = await preview(token, 'PRODUCT', buf, 'no-mfr.xlsx');
  console.log(`  preview errorRows=${errorRows} (relation not checked at preview — expected 0)`);
  const c = await commit(token, batchId);
  console.log(`  commit: ${c.status} code=${c.error?.code ?? '-'} ${c.status === 422 && c.error?.code === 'OPS_024' ? 'PASS — rejected via relation resolution' : 'FAIL'}`);
}

// ── ImportBatch audit ─────────────────────────────────────────────────────────

const ImportBatch = mongoose.models['ImportBatch'] ?? mongoose.model('ImportBatch', new mongoose.Schema({ entityType: String, status: String }, { strict: false }));
const total    = await ImportBatch.countDocuments();
const distinct = await ImportBatch.aggregate([{ $group: { _id: '$entityType', count: { $sum: 1 } } }]);
console.log(`\n=== ImportBatch audit ===`);
console.log(`Total: ${total}`);
distinct.forEach(d => console.log(`  ${d._id}: ${d.count}`));

if (mongoose.connection.readyState === 1) await mongoose.disconnect();
console.log('\nDone.');
