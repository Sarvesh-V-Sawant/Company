#!/usr/bin/env node
/**
 * Phase 30.01-F item C5 — officeIp validation-mode checkout contradiction test.
 * Investigate only, revert settings after.
 */
import { createHash, randomUUID } from 'crypto';
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
const mongoose = require('mongoose');
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const BASE = 'http://localhost:3000';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function loginAs(email, role) {
  const fp = sha256('seed-fp-' + role);
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!', deviceFingerprint: fp }),
  });
  const j = await r.json();
  if (r.status !== 200) { console.log(`login FAILED ${r.status}: ${JSON.stringify(j).slice(0,200)}`); return null; }
  return { token: j.data?.accessToken, fp };
}
async function api(token, fp, method, path, body) {
  const o = { method, headers: { 'Content-Type': 'application/json', Cookie: `__session=${token}`, 'X-Device-Fingerprint': fp } };
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  const text = await r.text();
  return { status: r.status, text };
}

const settingsColl = db.collection('companysettings');
const empColl = db.collection('employees');
const usersColl = db.collection('users');

const originalSettings = await settingsColl.findOne({});
console.log('geoFence:', JSON.stringify(originalSettings?.geoFence));
console.log('original attendanceValidationMode:', originalSettings?.attendanceValidationMode);
console.log('original allowedOfficeIps:', JSON.stringify(originalSettings?.allowedOfficeIps));

const testUser = await usersColl.findOne({ employeeId: 'PHASED_TEST_EMPLOYEE' });
const originalEmp = await empColl.findOne({ userId: testUser._id });
console.log('original allowOutsideGeofence:', originalEmp?.allowOutsideGeofence);

try {
  // Step 1: geofence mode, bypass=false, check in at the actual office geofence coords
  await empColl.updateOne({ userId: testUser._id }, { $set: { allowOutsideGeofence: false } });
  await settingsColl.updateOne({}, { $set: { attendanceValidationMode: 'geofence' } });

  const sess = await loginAs('phased_test_employee@test.local', 'employee');
  const gf = originalSettings.geoFence;
  const checkin = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkin', {
    latitude: gf.latitude, longitude: gf.longitude, accuracy: 10,
    nonce: randomUUID(), timestamp: new Date().toISOString(),
  });
  console.log('\nSTEP1 check-in (bypass=false, mode=geofence, coords=office) status=' + checkin.status);
  console.log('STEP1 body=' + checkin.text.slice(0, 300));

  // Step 2: switch to officeIp mode with an IP that will NOT match localhost, attempt checkout
  await settingsColl.updateOne({}, { $set: { attendanceValidationMode: 'officeIp', allowedOfficeIps: ['203.0.113.5'] } });

  const checkout = await api(sess.token, sess.fp, 'POST', '/api/v1/attendance/checkout', {
    nonce: randomUUID(), timestamp: new Date().toISOString(),
  });
  console.log('\nSTEP2 check-out (bypass=false, mode=officeIp, disallowed IP) status=' + checkout.status);
  console.log('STEP2 body=' + checkout.text.slice(0, 300));
} finally {
  // Revert
  await settingsColl.updateOne({}, { $set: {
    attendanceValidationMode: originalSettings?.attendanceValidationMode ?? 'geofence',
    allowedOfficeIps: originalSettings?.allowedOfficeIps ?? [],
  }});
  await empColl.updateOne({ userId: testUser._id }, { $set: { allowOutsideGeofence: originalEmp?.allowOutsideGeofence ?? true } });
  console.log('\nReverted settings + employee flag.');
  await mongoose.disconnect();
}
