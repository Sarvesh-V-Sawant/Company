#!/usr/bin/env node
import { createHash, randomUUID } from 'crypto';
const BASE = 'http://localhost:3000';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function loginAs(email, role) {
  const fp = sha256('seed-fp-' + role);
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', deviceFingerprint: fp }),
  });
  const j = await r.json();
  if (r.status !== 200) { console.log(`login ${email} FAILED ${r.status}: ${JSON.stringify(j).slice(0,200)}`); return null; }
  return { token: j.data?.accessToken, fp };
}

async function api(token, fp, method, path, body) {
  const o = { method, headers: {
    'Content-Type': 'application/json',
    Cookie: `__session=${token}`,
    'X-Device-Fingerprint': fp,
  }};
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  const text = await r.text();
  return { status: r.status, text };
}

const sess = await loginAs('phased_test_employee@test.local', 'employee');
if (!sess) process.exit(1);
console.log('employee login OK');

const checkinBody = {
  latitude: 19.201,
  longitude: 73.086,
  accuracy: 10,
  nonce: randomUUID(),
  timestamp: new Date().toISOString(),
};
const cin = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkin', checkinBody);
console.log('CHECK-IN status=' + cin.status);
console.log('CHECK-IN body=' + cin.text.slice(0, 300));

const checkoutBody = {
  nonce: randomUUID(),
  timestamp: new Date().toISOString(),
  latitude: 19.201,
  longitude: 73.086,
  accuracy: 10,
};
const cout = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkout', checkoutBody);
console.log('CHECK-OUT status=' + cout.status);
console.log('CHECK-OUT body=' + cout.text.slice(0, 400));

const payslip = await api(sess.token, sess.fp, 'GET', '/api/v1/payroll/me');
console.log('PAYROLL/ME status=' + payslip.status);
console.log('PAYROLL/ME body=' + payslip.text.slice(0, 200));
