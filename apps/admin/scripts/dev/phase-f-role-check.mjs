#!/usr/bin/env node
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

const adminToken = await loginAs('phased_test_admin@test.local', 'admin');
const list = await api(adminToken, 'GET', '/api/v1/ops/canteens');
const j = JSON.parse(list.text);
const id = j.data?.[0]?._id;
console.log('using canteen id', id);

for (const role of ['manager', 'executive']) {
  const token = await loginAs(`phased_test_${role}@test.local`, role);
  if (!token) continue;
  const res = await api(token, 'PATCH', `/api/v1/ops/canteens/${id}/status`, { isActive: true });
  console.log(`${role}: status=${res.status} ct=${res.contentType} body="${res.text.slice(0,150).replace(/\n/g,' ')}"`);
}
