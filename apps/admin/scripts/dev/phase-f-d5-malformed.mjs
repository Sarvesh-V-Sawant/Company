import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
if (!process.env.MONGODB_URI) {
  const e = resolve('apps/admin/.env.local');
  if (existsSync(e)) {
    for (const line of readFileSync(e, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i === -1) continue;
      const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
const require = createRequire(import.meta.url);
const ExcelJS  = require('exceljs');
const BASE = 'http://localhost:3000';
async function loginAdmin() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'phased_test_admin@test.local', password: 'TestPass123!' }) });
  const j = await res.json(); return j.data.accessToken;
}
function authHeaders(token) { return { Cookie: `__session=${token}` }; }
async function buildXlsx(headers, rows) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Import');
  ws.addRow(headers); for (const row of rows) ws.addRow(headers.map(h => row[h] ?? ''));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const token = await loginAdmin();

// MANUFACTURER: row missing Code, row with bad GSTIN, row otherwise ok
const mfrHeaders = ['Code','Name','GSTIN','PrimaryEmail','ContactPerson','Phone'];
const mfrRows = [
  { Name: 'No Code Mfr', PrimaryEmail: 'x@y.com' },
  { Code: 'D5_MFR_BADGSTIN', Name: 'Bad GSTIN Mfr', GSTIN: 'NOT_A_VALID_GSTIN', PrimaryEmail: 'x@y.com' },
  { Code: 'D5_MFR_OK', Name: 'OK Mfr', PrimaryEmail: 'ok@y.com' },
];
const mfrBuf = await buildXlsx(mfrHeaders, mfrRows);
const fd1 = new FormData(); fd1.append('entityType', 'MANUFACTURER');
fd1.append('file', new File([mfrBuf], 'd5-mfr.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
const pv1 = await fetch(`${BASE}/api/v1/ops/import/preview`, { method: 'POST', headers: authHeaders(token), body: fd1 });
const pv1j = await pv1.json();
console.log('MANUFACTURER preview status=' + pv1.status, 'totalRows=' + pv1j.data.totalRows, 'validRows=' + pv1j.data.validRows, 'errorRows=' + pv1j.data.errorRows);
(pv1j.data.rows ?? []).forEach(r => (r.errors ?? []).forEach(e => console.log('  row=' + e.rowNumber + ' field=' + e.field + ' message="' + e.message + '"')));
console.log('  -> Row with bad GSTIN "NOT_A_VALID_GSTIN" flagged as error? ' + ((pv1j.data.rows ?? []).some(r => r.rowNumber === 3 && (r.errors ?? []).length > 0)));

// PRODUCT: row referencing non-existent ManufacturerCode
const prodHeaders = ['SKU','Name','ManufacturerCode','UOM','PackSize','HSNCode','GSTRatePercent'];
const prodRows = [{ SKU: 'D5_P_NOMFR', Name: 'No Such Mfr Product', ManufacturerCode: 'DOES_NOT_EXIST_CODE', UOM: 'PCS' }];
const prodBuf = await buildXlsx(prodHeaders, prodRows);
const fd2 = new FormData(); fd2.append('entityType', 'PRODUCT');
fd2.append('file', new File([prodBuf], 'd5-prod.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
const pv2 = await fetch(`${BASE}/api/v1/ops/import/preview`, { method: 'POST', headers: authHeaders(token), body: fd2 });
const pv2j = await pv2.json();
console.log('\nPRODUCT preview status=' + pv2.status, 'errorRows=' + pv2j.data.errorRows, '(nonexistent mfr code caught at PREVIEW? ' + (pv2j.data.errorRows > 0) + ')');
const commit2 = await fetch(`${BASE}/api/v1/ops/import/commit`, { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: pv2j.data.batchId, action: 'commit' }) });
const c2j = await commit2.json();
console.log('PRODUCT commit (should reject via relation-resolution guard) status=' + commit2.status, JSON.stringify(c2j.error ?? c2j.data));
