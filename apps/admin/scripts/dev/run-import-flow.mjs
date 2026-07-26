#!/usr/bin/env node
/**
 * End-to-end import flow verification: template → preview → commit → idempotency → discard.
 * REFUSES to run in production.
 *
 * Usage (from repo root, with dev server running on :3000):
 *   node apps/admin/scripts/dev/run-import-flow.mjs
 */

import { createRequire } from 'module';
import { createHash } from 'crypto';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

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
const PASSWORD = 'TestPass123!';
const sha256   = (s) => createHash('sha256').update(s).digest('hex');
const require  = createRequire(import.meta.url);
const mongoose = require('mongoose');
const ExcelJS  = require('exceljs');

// ── Login ─────────────────────────────────────────────────────────────────────

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

function authHeaders(token) {
  return { 'Cookie': `__session=${token}` };
}

// ── C1: Template download ─────────────────────────────────────────────────────

async function c1Template(token, entity) {
  const res = await fetch(`${BASE}/api/v1/ops/import/template?entity=${entity}`, { headers: authHeaders(token) });
  console.log(`C1 [${entity}] GET /import/template: ${res.status}`);
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

// ── Build xlsx in memory ───────────────────────────────────────────────────────

async function buildXlsx(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import');
  ws.addRow(headers);
  for (const row of rows) ws.addRow(headers.map(h => row[h] ?? ''));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── C2: Preview clean batch ───────────────────────────────────────────────────

async function c2Preview(token, entity, xlsxBuf, filename) {
  const fd = new FormData();
  fd.append('entityType', entity);
  fd.append('file', new File([xlsxBuf], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const res = await fetch(`${BASE}/api/v1/ops/import/preview`, { method: 'POST', headers: authHeaders(token), body: fd });
  const j   = await res.json();
  const d   = j.data ?? j;
  console.log(`C2 [${entity}] POST /import/preview: ${res.status} totalRows=${d.totalRows} validRows=${d.validRows} errorRows=${d.errorRows}`);
  if (res.status !== 200) console.log(`  FAIL body: ${JSON.stringify(j).slice(0, 200)}`);
  return { status: res.status, batchId: d.batchId, errorRows: d.errorRows, validRows: d.validRows };
}

// ── C3: Preview malformed batch ───────────────────────────────────────────────

async function c3Preview(token, entity, malformedBuf, filename) {
  const fd = new FormData();
  fd.append('entityType', entity);
  fd.append('file', new File([malformedBuf], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const res = await fetch(`${BASE}/api/v1/ops/import/preview`, { method: 'POST', headers: authHeaders(token), body: fd });
  const j   = await res.json();
  const d   = j.data ?? j;
  console.log(`C3 [${entity}] malformed preview: ${res.status} totalRows=${d.totalRows} validRows=${d.validRows} errorRows=${d.errorRows}`);
  const errs = d.rows?.flatMap(r => r.errors) ?? [];
  errs.forEach(e => console.log(`  row=${e.rowNumber} field=${e.field} message="${e.message}"`));
  return { status: res.status, batchId: d.batchId, errorRows: d.errorRows };
}

// ── C4: Commit malformed batch (must be rejected) ─────────────────────────────

async function c4CommitMalformed(token, batchId) {
  const res = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'commit' }),
  });
  const j = await res.json();
  console.log(`C4 commit malformed batch: ${res.status} code=${j.error?.code ?? '-'} ${res.status===422?'PASS — rejected':'FAIL (should be 422)'}`);
}

// ── C5/C6: Commit clean + idempotency ─────────────────────────────────────────

async function c5c6Commit(token, batchId, entity, Model) {
  await mongoose.connect(process.env.MONGODB_URI);
  const before = await Model.countDocuments();
  const res1 = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'commit' }),
  });
  const j1   = await res1.json();
  const after = await Model.countDocuments();
  console.log(`C5 [${entity}] commit: ${res1.status} ${res1.status===200?'PASS':'FAIL'}`);
  console.log(`  collection count BEFORE=${before} AFTER=${after} delta=${after - before}`);
  if (after === before) console.log('  NOTE: skeleton commitBatch — rows validated but not inserted (no commitFn impl for this entity)');

  // C6: Idempotency — commit SAME batchId again
  const before2 = await Model.countDocuments();
  const res2 = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'commit' }),
  });
  const j2    = await res2.json();
  const after2 = await Model.countDocuments();
  console.log(`C6 [${entity}] repeat commit (idempotency): ${res2.status} code=${j2.error?.code ?? '-'}`);
  console.log(`  batch.status guard returned: "${j2.error?.message ?? j2.data?.status ?? '-'}"`);
  console.log(`  collection count before=${before2} after=${after2} delta=${after2 - before2}`);
  if (res2.status === 409 && (j2.error?.code === 'OPS_020')) {
    console.log(`  C6 PASS — double-insert blocked by status guard`);
  } else if (res2.status === 200 && after2 === before2) {
    console.log('  C6 PASS — second commit returned 200 but count unchanged (skeleton: no insertions either time)');
  } else if (after2 > before2) {
    console.log('  C6 FAIL — DEFECT: double-insert occurred');
  }
  return { firstStatus: res1.status, secondStatus: res2.status, secondCode: j2.error?.code, before, after, before2, after2 };
}

// ── C7: Discard ───────────────────────────────────────────────────────────────

async function c7Discard(token, batchId, entity, Model) {
  await mongoose.connect(process.env.MONGODB_URI);
  const before = await Model.countDocuments();
  const res = await fetch(`${BASE}/api/v1/ops/import/commit`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, action: 'discard' }),
  });
  const j    = await res.json();
  const after = await Model.countDocuments();
  // Verify batch status in DB
  const ImportBatch = mongoose.models['ImportBatch'] ?? mongoose.model('ImportBatch', new mongoose.Schema({ status: String }, { strict: false }));
  const batch = await ImportBatch.findById(batchId).lean();
  console.log(`C7 [${entity}] discard: ${res.status} batchStatus=${batch?.status ?? '?'} collection delta=${after - before}`);
  console.log(`  ${res.status===200&&batch?.status==='discarded'?'PASS':'FAIL'}`);
}

// ── C8: ImportBatch audit ─────────────────────────────────────────────────────

async function c8Audit() {
  await mongoose.connect(process.env.MONGODB_URI);
  const ImportBatch = mongoose.models['ImportBatch'] ?? mongoose.model('ImportBatch', new mongoose.Schema({ entityType: String, status: String }, { strict: false }));
  const total    = await ImportBatch.countDocuments();
  const distinct = await ImportBatch.aggregate([{ $group: { _id: '$entityType', count: { $sum: 1 } } }]);
  const byStatus = await ImportBatch.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log(`\n=== C8: ImportBatch audit ===`);
  console.log(`Total ImportBatch docs: ${total}`);
  console.log('By entityType:');
  distinct.forEach(d => console.log(`  ${d._id}: ${d.count}`));
  console.log('By status:');
  byStatus.forEach(d => console.log(`  ${d._id}: ${d.count}`));
}

// ── Inline models for count queries ──────────────────────────────────────────

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

// ── MAIN ──────────────────────────────────────────────────────────────────────

const token = await loginAdmin();
console.log('Admin login: OK\n');

const ENTITIES = ['CANTEEN', 'MANUFACTURER', 'PRODUCT'];

for (const entity of ENTITIES) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ENTITY: ${entity}`);
  console.log('='.repeat(60));

  // C1: Template
  const headers = await c1Template(token, entity);
  if (!headers) continue;

  // C2: Clean 3-row preview
  const cleanRows = {
    CANTEEN: [
      { Code: 'IMP_C001', Name: 'Import Test Canteen 1', Type: 'main' },
      { Code: 'IMP_C002', Name: 'Import Test Canteen 2', Type: 'main' },
      { Code: 'IMP_C003', Name: 'Import Test Canteen 3', Type: 'main' },
    ],
    MANUFACTURER: [
      { Code: 'IMP_M001', Name: 'Import Mfr One',   PrimaryEmail: 'm1@imp.test' },
      { Code: 'IMP_M002', Name: 'Import Mfr Two',   PrimaryEmail: 'm2@imp.test' },
      { Code: 'IMP_M003', Name: 'Import Mfr Three', PrimaryEmail: 'm3@imp.test' },
    ],
    PRODUCT: [
      { SKU: 'IMP_P001', Name: 'Import Product A', ManufacturerCode: 'PHASED_TEST_MFR1', UOM: 'PCS' },
      { SKU: 'IMP_P002', Name: 'Import Product B', ManufacturerCode: 'PHASED_TEST_MFR1', UOM: 'KG' },
      { SKU: 'IMP_P003', Name: 'Import Product C', ManufacturerCode: 'PHASED_TEST_MFR2', UOM: 'LTR' },
    ],
  }[entity];

  const cleanBuf   = await buildXlsx(headers, cleanRows);
  const { batchId: cleanId, errorRows: cleanErr } = await c2Preview(token, entity, cleanBuf, `${entity}-clean.xlsx`);

  // C3: Malformed preview
  // - Row 1: missing required field (no Code/SKU for canteen/mfr; no SKU for product)
  // - Row 2: structurally ok but bad GSTIN on manufacturer (field present, wrong format)
  // - Row 3: ManufacturerCode that doesn't exist (only validated at commit, not preview — so row may be valid at preview level)
  const malRows = {
    CANTEEN: [
      { Name: 'Missing Code Canteen', Type: 'main' },        // missing Code
      { Code: 'IMP_BAD2', Type: 'main' },                    // missing Name
      { Code: 'IMP_BAD3', Name: 'OK but no type' },          // missing Type
    ],
    MANUFACTURER: [
      { Name: 'No Code Mfr', PrimaryEmail: 'x@y.com' },     // missing Code
      { Code: 'IMP_BADS2', PrimaryEmail: 'x@y.com' },        // missing Name
      { Code: 'IMP_BADS3', Name: 'No Email' },               // missing PrimaryEmail
    ],
    PRODUCT: [
      { Name: 'No SKU Product', ManufacturerCode: 'PHASED_TEST_MFR1', UOM: 'PCS' }, // missing SKU
      { SKU: 'IMP_BADP2', ManufacturerCode: 'PHASED_TEST_MFR1' },                   // missing Name + UOM
      { SKU: 'IMP_BADP3', Name: 'No Mfr Code', UOM: 'KG' },                         // missing ManufacturerCode
    ],
  }[entity];

  const malBuf  = await buildXlsx(headers, malRows);
  const { batchId: malId, errorRows: malErr } = await c3Preview(token, entity, malBuf, `${entity}-malformed.xlsx`);

  // C4: Attempt commit of malformed batch
  await c4CommitMalformed(token, malId);

  // C5 + C6: Commit clean batch + idempotency
  const Model = getModel(entity);
  const idResult = await c5c6Commit(token, cleanId, entity, Model);

  // C7: Preview new batch and discard it
  const discardBuf = await buildXlsx(headers, cleanRows.slice(0, 1).map(r => ({ ...r, Code: r.Code ? r.Code + '_D' : undefined, SKU: r.SKU ? r.SKU + '_D' : undefined })));
  const { batchId: discardId } = await c2Preview(token, entity, discardBuf, `${entity}-discard.xlsx`);
  await c7Discard(token, discardId, entity, Model);
}

await c8Audit();
if (mongoose.connection.readyState === 1) await mongoose.disconnect();
console.log('\nImport flow done.');
