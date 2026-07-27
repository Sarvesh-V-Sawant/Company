#!/usr/bin/env node
/**
 * Phase 30.01-F, item B4 — status route verification across all 6 ops entities.
 * Logs in as admin, fetches a real id for each entity, PATCHes /status, prints raw result.
 */
import { createHash } from 'crypto';

const BASE = 'http://localhost:3000';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function loginAs(email, role) {
  const fp = sha256('seed-fp-' + role);
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', deviceFingerprint: fp }),
  });
  const j = await r.json();
  if (r.status !== 200) { console.log(`login ${email} FAILED ${r.status}: ${JSON.stringify(j).slice(0,150)}`); return null; }
  return j.data?.accessToken;
}

async function api(token, method, path, body) {
  const o = { method, headers: { 'Content-Type': 'application/json', Cookie: `__session=${token}` } };
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  const text = await r.text();
  return { status: r.status, contentType: r.headers.get('content-type'), text };
}

const ENTITIES = [
  { name: 'canteens', listPath: '/api/v1/ops/canteens' },
  { name: 'manufacturers', listPath: '/api/v1/ops/manufacturers' },
  { name: 'products', listPath: '/api/v1/ops/products' },
  { name: 'addresses', listPath: '/api/v1/ops/addresses' },
  { name: 'price-lists', listPath: '/api/v1/ops/price-lists' },
  { name: 'commission-rules', listPath: '/api/v1/ops/commission-rules' },
];

const adminToken = await loginAs('phased_test_admin@test.local', 'admin');
if (!adminToken) process.exit(1);
console.log('admin login OK\n');

for (const ent of ENTITIES) {
  const list = await api(adminToken, 'GET', ent.listPath);
  let id = null;
  try {
    const j = JSON.parse(list.text);
    id = j.data?.[0]?._id ?? j.data?.items?.[0]?._id ?? j.data?.data?.[0]?._id;
  } catch {}
  console.log(`--- ${ent.name} ---`);
  console.log(`  LIST ${ent.listPath} -> status=${list.status} ct=${list.contentType} id=${id}`);
  if (!id) { console.log('  SKIP status test: no id found'); continue; }
  const url = `/api/v1/ops/${ent.name}/${id}/status`;
  const res = await api(adminToken, 'PATCH', url, { isActive: false });
  console.log(`  PATCH ${url}`);
  console.log(`  status=${res.status} content-type=${res.contentType}`);
  console.log(`  body(200)="${res.text.slice(0,200).replace(/\n/g,' ')}"`);
  console.log();
}
