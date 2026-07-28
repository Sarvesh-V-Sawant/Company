#!/usr/bin/env node
/**
 * Attendance flow verification: check-in, check-out, officeIp validation-mode
 * enforcement on checkout, and payslip list. Reverts any CompanySettings/
 * Employee fields it mutates for the officeIp test.
 * REFUSES to run in production.
 *
 * Usage (from repo root, with dev server running on :3000):
 *   node apps/admin/scripts/dev/verify-attendance-flow.mjs
 */

import { createHash, randomUUID } from 'crypto';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: NODE_ENV is production.'); process.exit(1);
}

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
const mongoose = require('mongoose');
const BASE = 'http://localhost:3000';
const PASSWORD = process.env.OPS_TEST_PASSWORD || createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16) + 'Aa1!';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function loginAs(email, role) {
  const fp = sha256('seed-fp-' + role);
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, deviceFingerprint: fp }),
  });
  const j = await r.json();
  if (r.status !== 200) { console.log(`login ${email} FAILED ${r.status}: ${JSON.stringify(j).slice(0,200)}`); return null; }
  return { token: j.data?.accessToken, fp };
}
async function api(token, fp, method, path, body) {
  const o = { method, headers: { 'Content-Type': 'application/json', Cookie: `__session=${token}`, 'X-Device-Fingerprint': fp } };
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  const text = await r.text();
  return { status: r.status, text };
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('=== Check-in / check-out / payslip (employee, bypass mode) ===');
const sess = await loginAs('phased_test_employee@test.local', 'employee');
if (!sess) process.exit(1);

const checkin = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkin', {
  latitude: 19.201, longitude: 73.086, accuracy: 10,
  nonce: randomUUID(), timestamp: new Date().toISOString(),
});
console.log(`CHECK-IN status=${checkin.status} ${checkin.status === 200 ? 'PASS' : 'FAIL'}`);
console.log(`  ${checkin.text.slice(0, 200)}`);

const checkout = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkout', {
  nonce: randomUUID(), timestamp: new Date().toISOString(), latitude: 19.201, longitude: 73.086, accuracy: 10,
});
console.log(`CHECK-OUT status=${checkout.status} ${checkout.status === 200 ? 'PASS' : 'FAIL'}`);
console.log(`  ${checkout.text.slice(0, 300)}`);

const payslip = await api(sess.token, sess.fp, 'GET', '/api/v1/payroll/me');
console.log(`PAYROLL/ME status=${payslip.status} ${payslip.status === 200 ? 'PASS' : 'FAIL'}`);

// ── officeIp validation-mode enforcement on checkout (investigate only) ──────

console.log('\n=== officeIp checkout validation-mode enforcement ===');
const settingsColl = db.collection('companysettings');
const empColl = db.collection('employees');
const usersColl = db.collection('users');

const originalSettings = await settingsColl.findOne({});
const testUser = await usersColl.findOne({ employeeId: 'PHASED_TEST_EMPLOYEE' });
const originalEmp = await empColl.findOne({ userId: testUser._id });

try {
  await empColl.updateOne({ userId: testUser._id }, { $set: { allowOutsideGeofence: false } });
  await settingsColl.updateOne({}, { $set: { attendanceValidationMode: 'geofence' } });

  const gf = originalSettings.geoFence;
  const sess2 = await loginAs('phased_test_employee@test.local', 'employee');
  const cin2 = await api(sess2.token, sess2.fp, 'POST', '/api/v1/attendance/checkin', {
    latitude: gf.latitude, longitude: gf.longitude, accuracy: 10,
    nonce: randomUUID(), timestamp: new Date().toISOString(),
  });
  console.log(`STEP1 check-in (bypass=false, mode=geofence, at-office-coords) status=${cin2.status}`);

  await settingsColl.updateOne({}, { $set: { attendanceValidationMode: 'officeIp', allowedOfficeIps: ['203.0.113.5'] } });
  const cout2 = await api(sess2.token, sess2.fp, 'POST', '/api/v1/attendance/checkout', {
    nonce: randomUUID(), timestamp: new Date().toISOString(),
  });
  console.log(`STEP2 check-out (bypass=false, mode=officeIp, disallowed IP) status=${cout2.status}`);
  console.log(`  ${cout2.text.slice(0, 200)}`);
  console.log(`  ${cout2.status === 422 ? 'PASS — checkout enforces officeIp mode (ATT_004)' : 'FAIL'}`);
} finally {
  await settingsColl.updateOne({}, { $set: {
    attendanceValidationMode: originalSettings?.attendanceValidationMode ?? 'geofence',
    allowedOfficeIps: originalSettings?.allowedOfficeIps ?? [],
  }});
  await empColl.updateOne({ userId: testUser._id }, { $set: { allowOutsideGeofence: originalEmp?.allowOutsideGeofence ?? true } });
  console.log('\nReverted CompanySettings + employee allowOutsideGeofence.');
}

await mongoose.disconnect();
console.log('\nDone.');
