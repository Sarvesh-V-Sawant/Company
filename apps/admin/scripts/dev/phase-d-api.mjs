/**
 * Phase D — API-layer UAT for all 6 master pages.
 * D2 empty state, D3 create→list, D4 search/filter, D6 edit preservation,
 * D7 deactivate/reactivate, D8 pagination, D9 price-list (API), D10 company address, D11 employee lockout.
 */
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

if (process.env.NODE_ENV === 'production') { console.error('REFUSED'); process.exit(1); }

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

const BASE = 'http://localhost:3000';

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

async function loginAs(email, role) {
  const fp = sha256('seed-fp-' + role);
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', deviceFingerprint: fp }),
  });
  const j = await r.json();
  if (r.status !== 200) { console.log(`  login ${email} FAILED ${r.status}: ${JSON.stringify(j).slice(0,100)}`); return null; }
  return j.data?.accessToken;
}

async function api(token, method, path, body) {
  const o = { method, headers: { 'Content-Type': 'application/json', Cookie: `__session=${token}` } };
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = text; }
  return { status: r.status, data: d };
}

function chk(label, cond, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? '  [' + detail + ']' : ''}`);
}

async function d2(token, entity, path) {
  const r = await api(token, 'GET', `${path}?search=ZZZ_NOMATCH_99999`);
  chk(`D2 [${entity}] empty state`, r.status === 200 && (r.data?.data?.length ?? -1) === 0, `rows=${r.data?.data?.length}`);
}

async function d3(token, entity, path, body) {
  const cr = await api(token, 'POST', path, body);
  chk(`D3 [${entity}] create 201`, cr.status === 201, `status=${cr.status} err=${JSON.stringify(cr.data?.error ?? '').slice(0,80)}`);
  const id = cr.data?.data?._id;
  if (!id) { chk(`D3 [${entity}] ID returned`, false); return null; }
  const list = await api(token, 'GET', path);
  const found = (list.data?.data ?? []).some(r => r._id === id);
  chk(`D3 [${entity}] appears in list`, found);
  return id;
}

async function d4(token, entity, path, term) {
  const all  = await api(token, 'GET', path);
  const filt = await api(token, 'GET', `${path}?search=${encodeURIComponent(term)}`);
  const ac = all.data?.data?.length ?? 0, fc = filt.data?.data?.length ?? 0;
  chk(`D4 [${entity}] search narrows`, fc <= ac && fc > 0, `${ac}→${fc}`);
  const active = await api(token, 'GET', `${path}?isActive=true`);
  console.log(`  D4 [${entity}] isActive=true filter: ${active.data?.data?.length ?? 0} rows`);
}

async function d6(token, entity, path, fullBody, editField, editValue) {
  console.log(`\n  ── D6 [${entity}] EDIT PRESERVATION ──`);
  const cr = await api(token, 'POST', path, fullBody);
  if (cr.status !== 201) { chk(`D6 [${entity}] create`, false, `${cr.status} ${JSON.stringify(cr.data).slice(0,120)}`); return; }
  const id = cr.data?.data?._id;
  const before = (await api(token, 'GET', `${path}/${id}`)).data?.data ?? {};
  const patch  = await api(token, 'PATCH', `${path}/${id}`, { [editField]: editValue });
  chk(`D6 [${entity}] PATCH ${editField}`, patch.status === 200, `status=${patch.status}`);
  const after  = (await api(token, 'GET', `${path}/${id}`)).data?.data ?? {};
  const skip = new Set(['updatedAt', '__v', 'createdAt']);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(k => !skip.has(k));
  console.log(`  Before/After (${keys.length} fields):`);
  let preserved = true;
  for (const k of keys) {
    const bv = JSON.stringify(before[k]); const av = JSON.stringify(after[k]);
    if (k === editField) {
      console.log(`    ${k}: ${bv} → ${av}  [CHANGED ✓]`);
    } else if (bv !== av) {
      console.log(`    ${k}: ${bv} → ${av}  [DRIFT ✗]`);
      preserved = false;
    } else {
      console.log(`    ${k}: ${av}  [same ✓]`);
    }
  }
  chk(`D6 [${entity}] untouched fields preserved`, preserved);
}

async function d7(token, entity, path, id) {
  const da = await api(token, 'PATCH', `${path}/${id}/status`, { isActive: false });
  chk(`D7 [${entity}] deactivate`, da.status === 200, `status=${da.status}`);
  const re = await api(token, 'PATCH', `${path}/${id}/status`, { isActive: true });
  chk(`D7 [${entity}] reactivate`, re.status === 200, `status=${re.status}`);
  const conf = await api(token, 'GET', `${path}/${id}`);
  chk(`D7 [${entity}] isActive=true confirmed`, conf.data?.data?.isActive === true);
}

async function d8(token, entity, path, makeBody) {
  const ids = [];
  for (let i = 0; i < 25; i++) {
    const r = await api(token, 'POST', path, makeBody(i));
    if (r.data?.data?._id) ids.push(r.data.data._id);
  }
  const p1 = await api(token, 'GET', `${path}?page=1&limit=20`);
  const p2 = await api(token, 'GET', `${path}?page=2&limit=20`);
  const r1 = p1.data?.data?.length ?? 0, r2 = p2.data?.data?.length ?? 0;
  chk(`D8 [${entity}] page1=20 rows`, r1 === 20, `got ${r1}`);
  chk(`D8 [${entity}] page2 has rows`, r2 > 0, `got ${r2}`);
  const s1 = new Set((p1.data?.data ?? []).map(r => r._id));
  const overlap = (p2.data?.data ?? []).filter(r => s1.has(r._id)).length;
  chk(`D8 [${entity}] pages distinct`, overlap === 0, `overlap=${overlap}`);
  return ids;
}

async function d9(token, mfr1Id, p1Id, p3Id, yr = 2040) {
  console.log('\n  ── D9 PRICE-LIST API VALIDATION ──');
  const plr = await api(token, 'POST', '/api/v1/ops/price-lists', {
    manufacturerId: mfr1Id, effectiveFrom: `${yr}-08-01`, effectiveTo: `${yr}-12-31`,
    items: [{ productId: p1Id, rate: 150 }, { productId: p3Id, rate: 200 }],
  });
  chk('D9 create price-list 2 items', plr.status === 201, `status=${plr.status}`);
  const plId = plr.data?.data?._id;
  if (plId) {
    const got = await api(token, 'GET', `/api/v1/ops/price-lists/${plId}`);
    const items = got.data?.data?.items ?? [];
    console.log(`  D9 GET items count=${items.length}`);
    items.forEach((it, i) => {
      const pid = it.productId;
      const pop = pid && typeof pid === 'object' && pid.sku;
      chk(`D9 item[${i}] productId populated sku="${pid?.sku ?? '?'}" name="${pid?.name ?? '?'}"`, !!pop);
      console.log(`    rate=${it.rate}`);
    });
  }
  const neg = await api(token, 'POST', '/api/v1/ops/price-lists', {
    manufacturerId: mfr1Id, effectiveFrom: `${yr+10}-07-01`, effectiveTo: `${yr+10}-12-31`,
    items: [{ productId: p1Id, rate: -5 }],
  });
  console.log(`  D9 negative rate: status=${neg.status} errCode="${neg.data?.error?.code ?? 'none'}"`);
}

async function d10(token) {
  console.log('\n  ── D10 COMPANY ADDRESS ──');
  const r = await api(token, 'POST', '/api/v1/ops/addresses', {
    ownerType: 'company', label: 'D10 HQ', addressType: 'both',
    line1: '123 Corp Blvd', city: 'Mumbai', state: 'Maharashtra', stateCode: 'MH', pincode: '400001', isDefault: false,
  });
  chk('D10 create company addr (no ownerId)', r.status === 201, `status=${r.status} err=${JSON.stringify(r.data?.error ?? '')}`);
  if (r.data?.data?._id) {
    const got = await api(token, 'GET', `/api/v1/ops/addresses/${r.data.data._id}`);
    const d = got.data?.data ?? {};
    chk('D10 ownerType=company stored', d.ownerType === 'company');
    chk('D10 ownerId null/absent', !d.ownerId, `ownerId=${d.ownerId}`);
  }
}

async function d11() {
  console.log('\n  ── D11 EMPLOYEE LOCKOUT ──');
  const empToken = await loginAs('phased_test_employee@test.local', 'employee');
  if (!empToken) { chk('D11 employee login', false); return; }
  const pr = await fetch(`${BASE}/desk`, { headers: { Cookie: `__session=${empToken}` }, redirect: 'manual' });
  console.log(`  D11 GET /desk: status=${pr.status} location="${pr.headers.get('location') ?? 'none'}"`);
  chk('D11 /desk blocked (redirect or non-200)', pr.status !== 200 || !!pr.headers.get('location'), `status=${pr.status}`);
  const mr = await fetch(`${BASE}/desk/masters/canteens`, { headers: { Cookie: `__session=${empToken}` }, redirect: 'manual' });
  console.log(`  D11 GET /desk/masters/canteens: status=${mr.status} location="${mr.headers.get('location') ?? 'none'}"`);
  const ar = await api(empToken, 'GET', '/api/v1/ops/canteens');
  chk('D11 /api/v1/ops/canteens as employee → 403', ar.status === 403, `got ${ar.status}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
const adminToken = await loginAs('phased_test_admin@test.local', 'admin');
if (!adminToken) { console.error('Admin login failed'); process.exit(1); }
console.log('Admin session: OK\n');

const mfrs  = await api(adminToken, 'GET', '/api/v1/ops/manufacturers?limit=10&search=PHASED');
const mfr1  = mfrs.data?.data?.[0];
const mfr2  = mfrs.data?.data?.[1];
const prods = await api(adminToken, 'GET', '/api/v1/ops/products?limit=10&search=PHASED');
const p1 = prods.data?.data?.[0]; const p2 = prods.data?.data?.[1]; const p3 = prods.data?.data?.[2];

if (!mfr1?._id) { console.error('No seeded manufacturers. Run seed script first.'); process.exit(1); }
console.log(`Seed: MFR1=${mfr1._id} MFR2=${mfr2?._id ?? 'none'} P1=${p1?._id ?? 'none'} P2=${p2?._id ?? 'none'} P3=${p3?._id ?? 'none'}\n`);

const ts = Date.now().toString(36);
// Unique year base per run to avoid date-overlap errors across reruns
const YR = 2050 + (Date.now() % 100);

console.log('=== CANTEENS ===');
await d2(adminToken, 'canteens', '/api/v1/ops/canteens');
const cantId = await d3(adminToken, 'canteens', '/api/v1/ops/canteens', { code: `D3C_${ts}`, name: `D3 Canteen ${ts}`, type: 'main' });
if (cantId) await d4(adminToken, 'canteens', '/api/v1/ops/canteens', `D3 Canteen ${ts}`);
await d6(adminToken, 'canteens', '/api/v1/ops/canteens',
  { code: `D6C_${ts}`, name: `D6 Canteen ${ts}`, type: 'main', gstin: '22ABCDE1234F1Z5', contactPerson: 'Alice D6', phone: '9999999991', email: 'cant.d6@test.local' },
  'contactPerson', 'Alice Edited'
);
if (cantId) await d7(adminToken, 'canteens', '/api/v1/ops/canteens', cantId);
await d8(adminToken, 'canteens', '/api/v1/ops/canteens', i => ({ code: `D8C${i.toString().padStart(3,'0')}_${ts}`, name: `D8 Canteen ${i} ${ts}`, type: 'main' }));

console.log('\n=== MANUFACTURERS ===');
await d2(adminToken, 'manufacturers', '/api/v1/ops/manufacturers');
const mfrNewId = await d3(adminToken, 'manufacturers', '/api/v1/ops/manufacturers', { code: `D3M_${ts}`, name: `D3 Mfr ${ts}`, primaryEmail: `d3m${ts}@test.local` });
if (mfrNewId) await d4(adminToken, 'manufacturers', '/api/v1/ops/manufacturers', `D3 Mfr ${ts}`);
await d6(adminToken, 'manufacturers', '/api/v1/ops/manufacturers',
  { code: `D6M_${ts}`, name: `D6 Mfr ${ts}`, primaryEmail: `d6m${ts}@test.local`, gstin: '22XYZAB1234F1Z5', contactPerson: 'Bob D6', phone: '8888888881' },
  'contactPerson', 'Bob Edited'
);
if (mfrNewId) await d7(adminToken, 'manufacturers', '/api/v1/ops/manufacturers', mfrNewId);

console.log('\n=== PRODUCTS ===');
await d2(adminToken, 'products', '/api/v1/ops/products');
const prodNewId = await d3(adminToken, 'products', '/api/v1/ops/products', { sku: `D3P_${ts}`, name: `D3 Prod ${ts}`, uom: 'PCS', manufacturerId: mfr1._id });
if (prodNewId) await d4(adminToken, 'products', '/api/v1/ops/products', `D3 Prod ${ts}`);
await d6(adminToken, 'products', '/api/v1/ops/products',
  { sku: `D6P_${ts}`, name: `D6 Prod ${ts}`, uom: 'KG', manufacturerId: mfr1._id, packSize: 12, hsnCode: '09011100', gstRatePercent: 5 },
  'packSize', 24
);
if (prodNewId) await d7(adminToken, 'products', '/api/v1/ops/products', prodNewId);

console.log('\n=== ADDRESSES ===');
await d2(adminToken, 'addresses', '/api/v1/ops/addresses');
const aId = await d3(adminToken, 'addresses', '/api/v1/ops/addresses', {
  ownerType: 'manufacturer', ownerId: mfr1._id, label: `D3 Addr ${ts}`, addressType: 'shipTo',
  line1: '1 Test St', city: 'Pune', state: 'Maharashtra', stateCode: 'MH', pincode: '411001', isDefault: false,
});
if (aId) await d4(adminToken, 'addresses', '/api/v1/ops/addresses', `D3 Addr ${ts}`);
await d6(adminToken, 'addresses', '/api/v1/ops/addresses',
  { ownerType: 'manufacturer', ownerId: mfr1._id, label: `D6 Addr ${ts}`, addressType: 'both', line1: '10 Corp Rd', line2: 'Floor 2', city: 'Mumbai', state: 'Maharashtra', stateCode: 'MH', pincode: '400001', isDefault: true },
  'line2', 'Floor 3 Edited'
);
await d10(adminToken);

console.log('\n=== PRICE LISTS ===');
// Price-lists have no text search; use a nonexistent 24-char hex manufacturerId to get empty state
{
  const noMfr = '000000000000000000000001';
  const r = await api(adminToken, 'GET', `/api/v1/ops/price-lists?manufacturerId=${noMfr}`);
  chk('D2 [price-lists] empty state (nonexistent manufacturerId)', r.status === 200 && (r.data?.data?.length ?? -1) === 0, `rows=${r.data?.data?.length}`);
}
if (p1?._id) {
  const yr = YR;
  const plId = await d3(adminToken, 'price-lists', '/api/v1/ops/price-lists', {
    manufacturerId: mfr1._id, effectiveFrom: `${yr}-01-01`, effectiveTo: `${yr}-06-30`,
    items: [{ productId: p1._id, rate: 100 }],
  });
  if (plId) await d7(adminToken, 'price-lists', '/api/v1/ops/price-lists', plId);
  if (p3?._id) await d9(adminToken, mfr1._id, p1._id, p3._id, yr);
  await d6(adminToken, 'price-lists', '/api/v1/ops/price-lists',
    { manufacturerId: mfr2?._id ?? mfr1._id, effectiveFrom: `${yr+1}-01-01`, effectiveTo: `${yr+1}-06-30`, items: [{ productId: p1._id, rate: 55 }] },
    'effectiveTo', `${yr+1}-09-30`
  );
} else {
  console.log('  NOTE: no seeded products — skipping price-list tests');
}

console.log('\n=== COMMISSION RULES ===');
{
  const noMfr = '000000000000000000000001';
  const r = await api(adminToken, 'GET', `/api/v1/ops/commission-rules?manufacturerId=${noMfr}`);
  chk('D2 [commission-rules] empty state (nonexistent manufacturerId)', r.status === 200 && (r.data?.data?.length ?? -1) === 0, `rows=${r.data?.data?.length}`);
}
{
  const yr = YR + 5;
  const crId = await d3(adminToken, 'commission-rules', '/api/v1/ops/commission-rules', {
    scope: 'manufacturer', manufacturerId: mfr1._id, type: 'flat', value: 50,
    effectiveFrom: `${yr}-01-01`, effectiveTo: `${yr}-06-30`,
  });
  if (crId) {
    await d7(adminToken, 'commission-rules', '/api/v1/ops/commission-rules', crId);
    await d6(adminToken, 'commission-rules', '/api/v1/ops/commission-rules',
      { scope: 'manufacturer', manufacturerId: mfr2?._id ?? mfr1._id, type: 'percentage', value: 8, effectiveFrom: `${yr+1}-01-01`, effectiveTo: `${yr+1}-06-30` },
      'value', 10
    );
  }
}

await d11();
console.log('\n=== Phase D API complete ===');
