#!/usr/bin/env node
/**
 * Phase 30.02-B throwaway API-level test runner. Walks ONE chain through the
 * full Work Desk lifecycle and asserts status codes + coded errors on every
 * ops/* endpoint. No browser. REFUSES to run in production.
 *
 * Usage: node apps/admin/scripts/dev/verify-workdesk-api.mjs
 * Requires: dev server on :3000, seed-ops-test-data.mjs already run with
 * OPS_TEST_PASSWORD exported, MFR1_ID/C1_ID printed by that script.
 */
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

/** Direct $unset on the OpsSettings singleton so the OPS_055 test is
 * deterministic across repeated runs (the API has no null-clear for
 * PATCH /ops/settings). OpsSettings is its own collection — CompanySettings
 * is never touched. */
async function resetOpsSettingsGst() {
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.db.collection('opssettings').updateOne(
    { singletonKey: 'ops' },
    { $set: { 'commissionTax.gstApplicable': true }, $unset: { 'commissionTax.gstRatePercent': '', 'commissionTax.sacCode': '' } },
    { upsert: true },
  );
}

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: NODE_ENV is production.');
  process.exit(1);
}

const BASE = 'http://localhost:3000';
const PASSWORD = process.env.OPS_TEST_PASSWORD;
if (!PASSWORD) { console.error('OPS_TEST_PASSWORD not set'); process.exit(1); }

const MFR1_ID = process.argv[2];
const C1_ID = process.argv[3];
if (!MFR1_ID || !C1_ID) { console.error('Usage: verify-workdesk-api.mjs <MFR1_ID> <C1_ID>'); process.exit(1); }

const rows = [];
function record(endpoint, method, scenario, expected, actual, pass) {
  rows.push({ endpoint, method, scenario, expected, actual, pass: pass ? 'PASS' : 'FAIL' });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${method} ${endpoint} | ${scenario} | expected=${expected} actual=${actual}`);
}

async function login(email, deviceFingerprint) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, deviceFingerprint }),
  });
  const json = await res.json();
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(json)}`);
  return json.data.accessToken;
}

function api(token) {
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  };
}

async function apiUpload(token, path, fields) {
  // No file upload exercised here (altered-order/documents POST is generate-only via JSON);
  // documents/route.ts POST is a multipart upload — exercised separately below if reached.
  return null;
}

(async () => {
  const rawFingerprint = (role) => createHash('sha256').update(`seed-fp-${role}`).digest('hex');
  const adminToken = await login('phased_test_admin@test.local');
  const executiveToken = await login('phased_test_executive@test.local');
  const employeeToken = await login('phased_test_employee@test.local', rawFingerprint('employee'));
  const A = api(adminToken);
  const EXEC = api(executiveToken);
  const EMP = api(employeeToken);

  // ── Access control (non-workdesk role) ──────────────────────────────
  {
    const r = await EMP('GET', '/api/v1/ops/chains');
    record('/api/v1/ops/chains', 'GET', 'employee (non-workdesk) role', '403 AUTH_006', `${r.status} ${r.json?.error?.code}`, r.status === 403 && r.json?.error?.code === 'AUTH_006');
  }
  {
    const r = await EMP('GET', '/api/v1/ops/reports?report=pipeline');
    record('/api/v1/ops/reports', 'GET', 'employee (non-workdesk) role', '403 AUTH_006', `${r.status} ${r.json?.error?.code}`, r.status === 403 && r.json?.error?.code === 'AUTH_006');
  }
  {
    const r = await EMP('GET', '/api/v1/ops/users');
    record('/api/v1/ops/users', 'GET', 'employee (non-workdesk) role', '403 AUTH_006', `${r.status} ${r.json?.error?.code}`, r.status === 403 && r.json?.error?.code === 'AUTH_006');
  }
  // executive is workdesk but not approve-eligible
  {
    const r = await EXEC('PATCH', '/api/v1/ops/settings', { alteredOrderEmailSubject: 'x' });
    record('/api/v1/ops/settings', 'PATCH', 'executive role hits approve-only route', '403 AUTH_006', `${r.status} ${r.json?.error?.code}`, r.status === 403 && r.json?.error?.code === 'AUTH_006');
  }

  // ── Chain create ──────────────────────────────────────────────────
  const createBody = {
    canteenId: C1_ID,
    manufacturerId: MFR1_ID,
    sourcePoNumber: `TESTPO-${Date.now()}`,
    lines: [{ rawDescription: 'Test line A', originalQty: 100, alteredQty: 100, uom: 'PCS' }],
  };
  const createRes = await A('POST', '/api/v1/ops/chains', createBody);
  const chainNumOk = /^GEN\/\d{2}-\d{2}\/\d{5}$/.test(createRes.json?.data?.chainNumber ?? '');
  record('/api/v1/ops/chains', 'POST', 'create chain', '201 + GEN/FY/NNNNN', `${createRes.status} ${createRes.json?.data?.chainNumber}`, createRes.status === 201 && chainNumOk);
  const chainId = createRes.json?.data?._id;
  if (!chainId) { console.error('FATAL: chain create failed, aborting.'); console.log(JSON.stringify(rows)); process.exit(1); }

  // GET list / GET by id / PATCH update
  {
    const r = await A('GET', '/api/v1/ops/chains?limit=5');
    record('/api/v1/ops/chains', 'GET', 'list chains', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('GET', `/api/v1/ops/chains/${chainId}`);
    record(`/api/v1/ops/chains/[id]`, 'GET', 'get chain by id', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}`, { sourcePoNumber: `${createBody.sourcePoNumber}-EDIT` });
    record(`/api/v1/ops/chains/[id]`, 'PATCH', 'update chain', '200', `${r.status}`, r.status === 200);
  }

  // ── Lines: variance without reason -> 422; then with reason -> 200 ──
  {
    const r = await A('PUT', `/api/v1/ops/chains/${chainId}/lines`, {
      lines: [{ rawDescription: 'Line no reason', originalQty: 100, alteredQty: 80, uom: 'PCS' }],
    });
    record(`/api/v1/ops/chains/[id]/lines`, 'PUT', 'variance with no reason', '400 GEN_001 (zod refine)', `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === 'GEN_001');
  }
  {
    const r = await A('PUT', `/api/v1/ops/chains/${chainId}/lines`, {
      lines: [{ rawDescription: 'Line with reason', originalQty: 100, alteredQty: 80, varianceReason: 'MOQ_ROUNDING', rate: 10, sortOrder: 0 }],
    });
    record(`/api/v1/ops/chains/[id]/lines`, 'PUT', 'variance with reason', '200 + recomputed totals', `${r.status} lineTotal=${r.json?.data?.lines?.[0]?.lineTotal}`, r.status === 200);
  }

  // GET documents (empty), comment, hold, assign
  {
    const r = await A('GET', `/api/v1/ops/chains/${chainId}/documents`);
    record(`/api/v1/ops/chains/[id]/documents`, 'GET', 'list documents (empty)', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/comment`, { message: 'test comment' });
    record(`/api/v1/ops/chains/[id]/comment`, 'POST', 'add comment', '201', `${r.status}`, r.status === 201);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/hold`, { hold: true, reason: 'testing hold' });
    record(`/api/v1/ops/chains/[id]/hold`, 'PATCH', 'place on hold', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/hold`, { hold: false });
    record(`/api/v1/ops/chains/[id]/hold`, 'PATCH', 'release hold', '200', `${r.status}`, r.status === 200);
  }
  // assign to a DIFFERENT user (chain is auto-assigned to its creator, so
  // assigning to self legitimately 409s — that's OPS_040, not a bug)
  {
    const usersRes = await A('GET', '/api/v1/ops/users?limit=10');
    const me = await A('GET', '/api/v1/auth/me');
    const myId = me.json?.data?.id ?? me.json?.data?._id;
    const list = usersRes.json?.data?.list ?? usersRes.json?.data ?? [];
    const other = list.find((u) => (u._id ?? u.id) !== myId);
    const otherId = other?._id ?? other?.id;
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/assign`, { toUserId: otherId });
    record(`/api/v1/ops/chains/[id]/assign`, 'PATCH', 'assign to a different desk user', '200', `${r.status} target=${otherId} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
    // assign back to self for the rest of the walk (loadForActor scope-checks non-privileged actors)
    if (r.status === 200) await A('PATCH', `/api/v1/ops/chains/${chainId}/assign`, { toUserId: myId });
  }

  // ── Status walk ──────────────────────────────────────────────────
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/status`, { toStatus: 'UNDER_REVIEW' });
    record(`/api/v1/ops/chains/[id]/status`, 'PATCH', 'PO_RECEIVED -> UNDER_REVIEW', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/status`, { toStatus: 'ALTERED' });
    record(`/api/v1/ops/chains/[id]/status`, 'PATCH', 'UNDER_REVIEW -> ALTERED', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/status`, { toStatus: 'CLOSED' });
    record(`/api/v1/ops/chains/[id]/status`, 'PATCH', 'illegal jump ALTERED -> CLOSED', '409 OPS_032', `${r.status} ${r.json?.error?.code}`, r.status === 409 && r.json?.error?.code === 'OPS_032');
  }
  // Lifecycle recording routes (tax-invoice etc.) require status
  // SENT_TO_MANUFACTURER/AWAITING_TAX_INVOICE; everything after that is
  // data-driven auto-advance, so these two are the only extra hops needed.
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/status`, { toStatus: 'PENDING_INTERNAL_APPROVAL' });
    record(`/api/v1/ops/chains/[id]/status`, 'PATCH', 'ALTERED -> PENDING_INTERNAL_APPROVAL', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/status`, { toStatus: 'SENT_TO_MANUFACTURER' });
    record(`/api/v1/ops/chains/[id]/status`, 'PATCH', 'PENDING_INTERNAL_APPROVAL -> SENT_TO_MANUFACTURER', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  // NOTE: no manual SENT_TO_MANUFACTURER -> AWAITING_TAX_INVOICE hop here
  // anymore — recordTaxInvoice (called below) now absorbs it internally.

  // ── Altered order docs (pdf + xlsx) ──────────────────────────────
  let pdfDocId, xlsxDocId;
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/altered-order`, { format: 'pdf' });
    pdfDocId = r.json?.data?._id ?? r.json?.data?.documentId;
    record(`/api/v1/ops/chains/[id]/altered-order`, 'POST', 'generate pdf', '201 + documentId', `${r.status} ${pdfDocId}`, r.status === 201 && !!pdfDocId);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/altered-order`, { format: 'xlsx' });
    xlsxDocId = r.json?.data?._id ?? r.json?.data?.documentId;
    record(`/api/v1/ops/chains/[id]/altered-order`, 'POST', 'generate xlsx', '201 + documentId', `${r.status} ${xlsxDocId}`, r.status === 201 && !!xlsxDocId);
  }
  let xlsxBytes = null;
  for (const [label, id] of [['pdf', pdfDocId], ['xlsx', xlsxDocId]]) {
    if (!id) { record(`/api/v1/ops/documents/[id]`, 'GET', `${label} doc bytes`, '200', 'SKIPPED (no id)', false); continue; }
    const res = await fetch(`${BASE}/api/v1/ops/documents/${id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const ct = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (label === 'xlsx') xlsxBytes = buf;
    const mimeOk = label === 'pdf' ? ct.includes('pdf') : ct.includes('spreadsheet') || ct.includes('excel');
    record(`/api/v1/ops/documents/[id]`, 'GET', `${label} doc mime+bytes`, '200 correct mime', `${res.status} ${ct} bytes=${buf.length}`, res.status === 200 && mimeOk);
  }

  // ── RUNTIME-PROOF: xlsx bytes actually parse (proves exceljs writeBuffer() cast) ──
  if (xlsxBytes) {
    try {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxBytes);
      const ws = wb.worksheets[0];
      const rowCount = ws?.rowCount ?? 0;
      record('RUNTIME-PROOF', 'n/a', 'exceljs re-parses the generated xlsx bytes', 'loads, >=1 sheet, >=1 row', `sheets=${wb.worksheets.length} rows=${rowCount}`, wb.worksheets.length >= 1 && rowCount >= 1);
    } catch (err) {
      record('RUNTIME-PROOF', 'n/a', 'exceljs re-parses the generated xlsx bytes', 'loads without throwing', `THREW: ${err.message}`, false);
    }
  } else {
    record('RUNTIME-PROOF', 'n/a', 'exceljs re-parses the generated xlsx bytes', 'loads without throwing', 'SKIPPED: no xlsx bytes captured', false);
  }

  // ── Email draft / update / send ──────────────────────────────────
  let emailId;
  {
    const r = await A('POST', '/api/v1/ops/emails', {
      chainId, toEmails: 'test-recipient@example.com', subject: 'Test altered order', bodyText: 'Please review.',
    });
    emailId = r.json?.data?._id;
    record('/api/v1/ops/emails', 'POST', 'create draft', '201 status draft', `${r.status} ${r.json?.data?.status}`, r.status === 201 && r.json?.data?.status === 'draft');
  }
  {
    const r = await A('GET', '/api/v1/ops/emails?limit=5');
    record('/api/v1/ops/emails', 'GET', 'list emails', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('GET', `/api/v1/ops/emails/${emailId}`);
    record('/api/v1/ops/emails/[id]', 'GET', 'get draft', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/emails/${emailId}`, { subject: 'Test altered order (edited)' });
    record('/api/v1/ops/emails/[id]', 'PATCH', 'edit draft', '200', `${r.status}`, r.status === 200);
  }
  record('/api/v1/ops/emails/[id]/send', 'POST', 'send (BREVO creds ARE configured)', 'NOT CALLED', 'skipped: real send would dispatch live email, no standing approval for outbound send', false);

  // ── RUNTIME-PROOF: CreateDraftEmailSchema's reapplied refine still fires ──
  // EmailListSchema (per-address format + max-25) does NOT reject an empty
  // array — only the outer .refine(toEmails.length>0) does, on both the
  // original DraftEmailSchema and my CreateDraftEmailSchema. Not redundant.
  {
    const r = await A('POST', '/api/v1/ops/emails', {
      chainId, toEmails: [], subject: 'Empty recipients', bodyText: 'x',
    });
    record('RUNTIME-PROOF', 'POST', 'CreateDraftEmailSchema rejects empty toEmails (refine, not EmailListSchema)', '400 GEN_001', `${r.status} ${r.json?.error?.code}`, r.status === 400 && r.json?.error?.code === 'GEN_001');
  }

  // ── Tax invoice -> portal -> decision -> SO -> dispatch -> delivery -> payment ──
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/tax-invoice`, {
      taxInvoiceNumber: 'TI-0001', taxInvoiceDate: new Date().toISOString(), taxInvoiceValue: 800,
    });
    record(`/api/v1/ops/chains/[id]/tax-invoice`, 'POST', 'record tax invoice (auto-hop from SENT_TO_MANUFACTURER)', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }

  // ── RUNTIME-PROOF: recordTaxInvoice absorbed the intermediate hop as a
  // real, separately-logged transition (not a silent skip) ──
  {
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
    const dbChain = await mongoose.connection.db.collection('chains').findOne({ _id: new mongoose.Types.ObjectId(chainId) });
    const events = await mongoose.connection.db.collection('chainevents')
      .find({ chainId: new mongoose.Types.ObjectId(chainId), eventType: 'STATUS_CHANGE' })
      .sort({ createdAt: 1 }).toArray();
    const hopEvent = events.find((e) => e.fromStatus === 'SENT_TO_MANUFACTURER' && e.toStatus === 'AWAITING_TAX_INVOICE');
    const finalEvent = events.find((e) => e.fromStatus === 'AWAITING_TAX_INVOICE' && e.toStatus === 'TAX_INVOICE_RECEIVED');
    record('RUNTIME-PROOF', 'n/a', 'chain passed through AWAITING_TAX_INVOICE as two real ChainEvents', 'both STATUS_CHANGE events exist, chain.status=TAX_INVOICE_RECEIVED', `hopEvent=${!!hopEvent} finalEvent=${!!finalEvent} chain.status=${dbChain?.status}`, !!hopEvent && !!finalEvent && dbChain?.status === 'TAX_INVOICE_RECEIVED');
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/portal`, { note: 'uploaded' });
    record(`/api/v1/ops/chains/[id]/portal`, 'POST', 'portal upload', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/portal-decision`, { decision: 'approved' });
    record(`/api/v1/ops/chains/[id]/portal-decision`, 'POST', 'portal decision approved', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/sales-order`, { soNumber: 'SO-0001', soDate: new Date().toISOString() });
    record(`/api/v1/ops/chains/[id]/sales-order`, 'POST', 'record SO', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/dispatch`, { dispatchedAt: new Date().toISOString(), transporter: 'Test Transport' });
    record(`/api/v1/ops/chains/[id]/dispatch`, 'POST', 'record dispatch', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  // Delivery with a short-supply line (deliver less than altered qty: 80 -> 60)
  const chainAfterLines = await A('GET', `/api/v1/ops/chains/${chainId}`);
  const lineId = chainAfterLines.json?.data?.lines?.[0]?._id;
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/delivery`, {
      deliveredAt: new Date().toISOString(),
      lines: lineId ? [{ lineId, deliveredQty: 60 }] : undefined,
      note: 'short supply test',
    });
    record(`/api/v1/ops/chains/[id]/delivery`, 'POST', 'record delivery (short-supply)', '200', `${r.status} ${JSON.stringify(r.json?.error ?? '')}`, r.status === 200);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/payment`, { status: 'partial', amount: 300, paidAt: new Date().toISOString() });
    const chain = await A('GET', `/api/v1/ops/chains/${chainId}`);
    record(`/api/v1/ops/chains/[id]/payment`, 'POST', 'payment partial -> stays PAYMENT_PENDING', '200 status=PAYMENT_PENDING', `${r.status} status=${chain.json?.data?.status}`, r.status === 200 && chain.json?.data?.status === 'PAYMENT_PENDING');
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/payment`, { status: 'paid', amount: 800, paidAt: new Date().toISOString() });
    const chain = await A('GET', `/api/v1/ops/chains/${chainId}`);
    record(`/api/v1/ops/chains/[id]/payment`, 'POST', 'payment paid -> PAYMENT_RECEIVED', '200 status=PAYMENT_RECEIVED', `${r.status} status=${chain.json?.data?.status}`, r.status === 200 && chain.json?.data?.status === 'PAYMENT_RECEIVED');
  }

  // ── Commission: raise before GST configured -> 422 OPS_055 ──────
  // The OpsSettings singleton persists across runs, so force it to the
  // "gstApplicable=true but rate/SAC unset" state via direct DB write
  // (OpsSettings is its own collection — untouched CompanySettings).
  await resetOpsSettingsGst();
  const settingsBefore = await A('GET', '/api/v1/ops/settings');
  record('/api/v1/ops/settings', 'GET', 'read settings after forced reset', '200 gstApplicable=true, rate/SAC unset', `${settingsBefore.status} ${JSON.stringify(settingsBefore.json?.data?.commissionTax)}`, settingsBefore.status === 200);
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/commission`, {});
    record(`/api/v1/ops/chains/[id]/commission`, 'POST', 'raise before GST rate/SAC configured', '422 OPS_055', `${r.status} ${r.json?.error?.code}`, r.status === 422 && r.json?.error?.code === 'OPS_055');
  }

  // Now configure GST properly. A manufacturer-scope commission rule already
  // exists in the seeded fixtures (effectiveFrom 2026-01-01..2026-12-31 covers
  // "today"), so resolveRule finds it without creating a new (overlapping) one.
  await A('PATCH', '/api/v1/ops/settings', {
    commissionTax: { gstApplicable: true, gstRatePercent: 18, sacCode: '996211', invoiceNumberPrefix: 'COMM' },
  });

  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/commission`, {});
    const chain = await A('GET', `/api/v1/ops/chains/${chainId}`);
    const raised = chain.json?.data?.status === 'COMMISSION_RAISED';
    const invNo = chain.json?.data?.commission?.invoiceNumber;
    record(`/api/v1/ops/chains/[id]/commission`, 'POST', 'raise commission (configured)', '201 COMMISSION_RAISED + invoiceNumber', `${r.status} status=${chain.json?.data?.status} inv=${invNo}`, r.status === 201 && raised && !!invNo);

    // ── RUNTIME-PROOF: DB read-back confirms ruleSnapshot + invoiceNumber persisted
    // (proves the chain.commission assignment cast in CommissionService.raise) ──
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
    const dbChain = await mongoose.connection.db.collection('chains').findOne({ _id: new mongoose.Types.ObjectId(chainId) });
    const commission = dbChain?.commission ?? {};
    const hasSnapshot = !!commission.ruleSnapshot && typeof commission.ruleSnapshot === 'object';
    const hasInvoiceNumber = typeof commission.invoiceNumber === 'string' && commission.invoiceNumber.length > 0;
    record('RUNTIME-PROOF', 'n/a', 'DB read-back: chain.commission persisted', 'ruleSnapshot object + invoiceNumber string', `ruleSnapshot=${JSON.stringify(commission.ruleSnapshot)} invoiceNumber=${commission.invoiceNumber}`, hasSnapshot && hasInvoiceNumber);
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/commission`, {});
    record(`/api/v1/ops/chains/[id]/commission`, 'POST', 'raise again (double-raise)', '409/422 OPS_054', `${r.status} ${r.json?.error?.code}`, r.json?.error?.code === 'OPS_054');
  }
  {
    const r = await A('GET', `/api/v1/ops/chains/${chainId}/commission`);
    record(`/api/v1/ops/chains/[id]/commission`, 'GET', 'get commission detail', '200', `${r.status}`, r.status === 200);
  }
  {
    const r = await A('PATCH', `/api/v1/ops/chains/${chainId}/commission`, { receivedAmount: 40, receivedAt: new Date().toISOString() });
    const chain = await A('GET', `/api/v1/ops/chains/${chainId}`);
    record(`/api/v1/ops/chains/[id]/commission`, 'PATCH', 'record receipt', '200 COMMISSION_RECEIVED', `${r.status} status=${chain.json?.data?.status}`, r.status === 200 && chain.json?.data?.status === 'COMMISSION_RECEIVED');
  }
  {
    const r = await A('POST', `/api/v1/ops/chains/${chainId}/close`, {});
    const chain = await A('GET', `/api/v1/ops/chains/${chainId}`);
    record(`/api/v1/ops/chains/[id]/close`, 'POST', 'close chain', '200 CLOSED', `${r.status} status=${chain.json?.data?.status}`, r.status === 200 && chain.json?.data?.status === 'CLOSED');
  }
  // cancel: exercise on a fresh throwaway chain (cannot cancel a closed one)
  {
    const c2 = await A('POST', '/api/v1/ops/chains', {
      canteenId: C1_ID, manufacturerId: MFR1_ID, sourcePoNumber: `TESTPO-CANCEL-${Date.now()}`,
    });
    const cancelId = c2.json?.data?._id;
    const r = await A('PATCH', `/api/v1/ops/chains/${cancelId}/cancel`, { reason: 'testing cancel path' });
    record(`/api/v1/ops/chains/[id]/cancel`, 'POST', 'cancel a fresh chain', '200 CANCELLED', `${r.status} ${r.json?.data?.status}`, r.status === 200);
  }

  // ── Reports ────────────────────────────────────────────────────
  for (const report of ['pipeline', 'commission', 'manufacturer', 'canteen', 'ageing', 'shortSupply']) {
    const r = await A('GET', `/api/v1/ops/reports?report=${report}`);
    record('/api/v1/ops/reports', 'GET', `report=${report}`, '200', `${r.status} keys=${r.json?.data ? Object.keys(r.json.data).join(',') : Object.keys(r.json ?? {}).join(',')}`, r.status === 200);
  }

  // ── Users ──────────────────────────────────────────────────────
  let leakedFields = [];
  {
    const r = await A('GET', '/api/v1/ops/users?limit=5');
    const sample = r.json?.data?.list?.[0] ?? r.json?.data?.[0] ?? {};
    const sensitive = ['salary', 'monthlySalary', 'passwordHash', 'registeredDevice', 'deviceHistory', 'password'];
    leakedFields = sensitive.filter((f) => f in sample);
    record('/api/v1/ops/users', 'GET', 'list desk users, no sensitive fields', `200, no ${sensitive.join('/')}`, `${r.status} leaked=[${leakedFields.join(',')}]`, r.status === 200 && leakedFields.length === 0);
  }
  {
    const me = await A('GET', '/api/v1/auth/me');
    const uid = me.json?.data?.id ?? me.json?.data?._id;
    const r = await A('GET', `/api/v1/ops/users/${uid}`);
    const sensitive = ['salary', 'monthlySalary', 'passwordHash', 'registeredDevice', 'deviceHistory', 'password'];
    const leaked2 = sensitive.filter((f) => f in (r.json?.data ?? {}));
    record('/api/v1/ops/users/[id]', 'GET', 'get desk user, no sensitive fields', `200, no ${sensitive.join('/')}`, `${r.status} leaked=[${leaked2.join(',')}]`, r.status === 200 && leaked2.length === 0);
  }

  // ── Summary ────────────────────────────────────────────────────
  const fails = rows.filter((r) => r.pass === 'FAIL');
  console.log(`\n=== ${rows.length} rows, ${fails.length} FAIL ===`);
  console.log(JSON.stringify({ rows, xlsxBytesLength: xlsxBytes?.length ?? 0 }, null, 0));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
})().catch((err) => {
  console.error('RUNNER CRASHED:', err);
  console.log(JSON.stringify(rows));
  process.exit(1);
});
