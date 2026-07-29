#!/usr/bin/env node
/**
 * Remove throwaway ops test users/records created by seed-ops-test-data.mjs,
 * verify-ops-import.mjs, verify-ops-permissions.mjs, and verify-attendance-flow.mjs.
 * Hard delete (these are fixtures, not production data). Prints real deletedCount
 * values per collection.
 * REFUSES to run in production.
 *
 * Usage (from repo root):
 *   node apps/admin/scripts/dev/cleanup-ops-test-data.mjs
 */

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
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

async function del(coll, filter) {
  const r = await db.collection(coll).deleteMany(filter);
  console.log(`${coll}: deletedCount=${r.deletedCount}`);
  return r.deletedCount;
}

// Test-fixture naming patterns used across the ops dev scripts.
const CODE_RE = '^(PHASED_TEST_|IMP_[A-Z]|VOI_|TP_?(SU|AD|MA|EX)[A-Z0-9]*)';

const testUsers = await db.collection('users').find({ employeeId: { $regex: '^PHASED_TEST_' } }).project({ _id: 1 }).toArray();
const testUserIds = testUsers.map(u => u._id);

const testMfrs = await db.collection('manufacturers').find({ code: { $regex: CODE_RE } }).project({ _id: 1 }).toArray();
const testMfrIds = testMfrs.map(m => m._id);

await del('employees', { userId: { $in: testUserIds } });
await del('users', { employeeId: { $regex: '^PHASED_TEST_' } });
await del('pricelists', { manufacturerId: { $in: testMfrIds } });
await del('commissionrules', { manufacturerId: { $in: testMfrIds } });
await del('manufacturers', { code: { $regex: CODE_RE } });
await del('canteens', { code: { $regex: CODE_RE } });
await del('products', { sku: { $regex: CODE_RE } });
await del('opsaddresses', { label: { $regex: '^(E1 Test|D6 Edit Test)' } });
await del('importbatches', { entityType: { $in: ['CANTEEN', 'MANUFACTURER', 'PRODUCT'] } });
await del('attendancesessions', { employeeId: { $in: testUserIds } });
await del('attendancedays', { employeeId: { $in: testUserIds } });
await del('usednonces', { employeeId: { $in: testUserIds } });

// ── Owner-approved full wipe of the six ops master collections (dev DB only) ──
// Behind an explicit flag so it can never fire by accident. Approved scope:
// canteens, manufacturers, products, opsaddresses, pricelists, commissionrules,
// and importbatches (batch rows reference documents being wiped). Touches
// NOTHING else — no users, employees, attendance, payroll, settings, notifications.
async function wipeAllOpsMasterData() {
  const dbName = db.databaseName;
  if (process.env.NODE_ENV === 'production') {
    console.error('REFUSED: NODE_ENV is production.'); process.exit(1);
  }
  if (!/test|dev/i.test(dbName) || /prod/i.test(dbName)) {
    console.error(`REFUSED: connection target database "${dbName}" does not look like a dev database.`);
    process.exit(1);
  }

  const WIPE_COLLECTIONS = ['canteens', 'manufacturers', 'products', 'opsaddresses', 'pricelists', 'commissionrules', 'importbatches'];

  console.log(`\n=== APPROVED WIPE — dev database "${dbName}" ===`);
  console.log('BEFORE counts:');
  const before = {};
  for (const coll of WIPE_COLLECTIONS) {
    before[coll] = await db.collection(coll).countDocuments();
    console.log(`  ${coll}: ${before[coll]}`);
  }

  console.log('\nDeleting:');
  for (const coll of WIPE_COLLECTIONS) {
    const r = await db.collection(coll).deleteMany({});
    console.log(`  ${coll}: deletedCount=${r.deletedCount}`);
  }
}

if (process.argv.includes('--wipe-all')) {
  await wipeAllOpsMasterData();
}

await mongoose.disconnect();
console.log('\nCleanup complete.');
