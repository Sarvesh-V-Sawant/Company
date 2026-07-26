#!/usr/bin/env node
/**
 * Seed throwaway test data for ops permission + import flow verification.
 * REFUSES to run in production.
 *
 * Usage (from repo root):
 *   node apps/admin/scripts/dev/seed-ops-test-data.mjs
 *   node apps/admin/scripts/dev/seed-ops-test-data.mjs --cleanup
 *
 * Reads MONGODB_URI from process.env (set via .env.local before calling).
 * No credentials are committed in this file.
 */

import { createHash } from 'crypto';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSED: NODE_ENV is production. This script must not run in production.');
  process.exit(1);
}

// Load .env.local if MONGODB_URI not already set
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

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** raw fingerprint sent in X-Device-Fingerprint header — 64-char hex, passes Zod /^[0-9a-f]{64}$/i */
export function rawFingerprint(role) { return sha256(`seed-fp-${role}`); }

const SEED_PREFIX = 'PHASED_TEST_';
const PASSWORD    = 'TestPass123!';
const ROLES       = ['super_admin', 'admin', 'manager', 'executive', 'employee'];

// ── Inline schemas (strict:false so extra fields like createdBy are stored) ──

const UserSchema = new mongoose.Schema({
  employeeId:              { type: String, unique: true },
  firstName:               String,
  lastName:                String,
  email:                   { type: String, unique: true, lowercase: true, trim: true },
  passwordHash:            { type: String, select: false },
  role:                    String,
  monthlySalary:           { type: Number, default: 0 },
  dateOfJoining:           { type: Date, default: new Date() },
  isActive:                { type: Boolean, default: true },
  requiresPasswordChange:  { type: Boolean, default: false },
  registeredDevice:        { type: mongoose.Schema.Types.Mixed, default: null },
  deviceHistory:           { type: Array, default: [] },
  leaveBalances:           { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const EmployeeSchema = new mongoose.Schema({
  userId:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  employeeCode:         { type: String, required: true, unique: true },
  firstName:            { type: String, required: true },
  lastName:             { type: String, required: true },
  joiningDate:          { type: Date, required: true },
  monthlySalary:        { type: Number, required: true, default: 0 },
  status:               { type: String, default: 'active' },
  allowOutsideGeofence: { type: Boolean, default: false },
}, { timestamps: true });

// strict:false so createdBy/updatedBy are stored even though not declared
const MfrSchema      = new mongoose.Schema({ code: { type: String, unique: true }, name: String, primaryEmail: String, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });
const CanteenSchema  = new mongoose.Schema({ code: { type: String, unique: true }, name: String, type: String, parentCanteenId: mongoose.Schema.Types.ObjectId, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });
const ProductSchema  = new mongoose.Schema({ sku: { type: String, unique: true }, name: String, uom: String, manufacturerId: mongoose.Schema.Types.ObjectId, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });
const PriceListSchema = new mongoose.Schema({ manufacturerId: mongoose.Schema.Types.ObjectId, canteenId: mongoose.Schema.Types.ObjectId, effectiveFrom: Date, effectiveTo: Date, items: Array, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });
const CommRuleSchema  = new mongoose.Schema({ scope: String, manufacturerId: mongoose.Schema.Types.ObjectId, productId: mongoose.Schema.Types.ObjectId, type: String, value: Number, effectiveFrom: Date, effectiveTo: Date, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });

const User         = mongoose.models['User']           ?? mongoose.model('User',           UserSchema);
const Employee     = mongoose.models['Employee']       ?? mongoose.model('Employee',       EmployeeSchema);
const Manufacturer = mongoose.models['Manufacturer']   ?? mongoose.model('Manufacturer',   MfrSchema);
const Canteen      = mongoose.models['Canteen']        ?? mongoose.model('Canteen',        CanteenSchema);
const Product      = mongoose.models['Product']        ?? mongoose.model('Product',        ProductSchema);
const PriceList    = mongoose.models['PriceList']      ?? mongoose.model('PriceList',      PriceListSchema);
const CommRule     = mongoose.models['CommissionRule'] ?? mongoose.model('CommissionRule', CommRuleSchema);

async function cleanup() {
  const testUsers = await User.find({ employeeId: { $regex: `^${SEED_PREFIX}` } }).select('_id').lean();
  const testUserIds = testUsers.map(u => u._id);
  const empDel = testUserIds.length ? await Employee.deleteMany({ userId: { $in: testUserIds } }) : { deletedCount: 0 };
  const ur = await User.deleteMany({ employeeId: { $regex: `^${SEED_PREFIX}` } });
  const mr = await Manufacturer.deleteMany({ code: { $regex: `^${SEED_PREFIX}` } });
  const cr = await Canteen.deleteMany({ code: { $regex: `^${SEED_PREFIX}` } });
  const pr = await Product.deleteMany({ sku: { $regex: `^${SEED_PREFIX}` } });
  console.log(`Cleanup: users=${ur.deletedCount} employees=${empDel.deletedCount} manufacturers=${mr.deletedCount} canteens=${cr.deletedCount} products=${pr.deletedCount}`);
}

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const role of ROLES) {
    const email = `phased_test_${role}@test.local`;
    const empId = `${SEED_PREFIX}${role.toUpperCase()}`;
    await User.deleteOne({ employeeId: empId });

    let registeredDevice = null;
    if (role !== 'admin') {
      const fp = rawFingerprint(role);
      registeredDevice = { fingerprintHash: sha256(fp), registeredAt: new Date(), deviceInfo: 'seed-test-device', platform: 'android' };
    }
    await User.create({ employeeId: empId, firstName: 'Test', lastName: role, email, passwordHash: hash, role, monthlySalary: 0, requiresPasswordChange: false, registeredDevice });
    console.log(`user: ${role} -> ${email}`);
  }

  // Employee record for the employee test user (needed by /payroll/me and /attendance/checkin)
  // allowOutsideGeofence:true so check-in/out work from localhost during dev testing
  const empUser = await User.findOne({ employeeId: `${SEED_PREFIX}EMPLOYEE` }).lean();
  if (empUser) {
    await Employee.deleteOne({ employeeCode: `${SEED_PREFIX}EMP001` });
    await Employee.create({ userId: empUser._id, employeeCode: `${SEED_PREFIX}EMP001`, firstName: 'Test', lastName: 'Employee', joiningDate: new Date('2025-01-01'), monthlySalary: 0, status: 'active', allowOutsideGeofence: true });
    console.log('employee record: created (allowOutsideGeofence=true for localhost testing)');
  }

  const adminUser = await User.findOne({ employeeId: `${SEED_PREFIX}ADMIN` }).lean();
  if (!adminUser) throw new Error('Admin user not found');
  const actorId = adminUser._id;

  await Manufacturer.deleteMany({ code: { $regex: `^${SEED_PREFIX}` } });
  await Canteen.deleteMany({ code: { $regex: `^${SEED_PREFIX}` } });
  await Product.deleteMany({ sku: { $regex: `^${SEED_PREFIX}` } });

  const mfr1 = await Manufacturer.create({ code: `${SEED_PREFIX}MFR1`, name: 'Test Mfr Alpha', primaryEmail: 'mfr1@test.local', createdBy: actorId, updatedBy: actorId });
  const mfr2 = await Manufacturer.create({ code: `${SEED_PREFIX}MFR2`, name: 'Test Mfr Beta',  primaryEmail: 'mfr2@test.local', createdBy: actorId, updatedBy: actorId });
  const c1   = await Canteen.create({ code: `${SEED_PREFIX}C1`, name: 'Test Main Canteen',  type: 'main', createdBy: actorId, updatedBy: actorId });
  const c2   = await Canteen.create({ code: `${SEED_PREFIX}C2`, name: 'Test Sub Canteen',   type: 'subsidiary', parentCanteenId: c1._id, createdBy: actorId, updatedBy: actorId });
  const p1   = await Product.create({ sku: `${SEED_PREFIX}P001`, name: 'Test Product Alfa',  uom: 'PCS', manufacturerId: mfr1._id, createdBy: actorId, updatedBy: actorId });
  const p2   = await Product.create({ sku: `${SEED_PREFIX}P002`, name: 'Test Product Beta',  uom: 'KG',  manufacturerId: mfr1._id, createdBy: actorId, updatedBy: actorId });
  const p3   = await Product.create({ sku: `${SEED_PREFIX}P003`, name: 'Test Product Gamma', uom: 'LTR', manufacturerId: mfr2._id, createdBy: actorId, updatedBy: actorId });
  await PriceList.create({ manufacturerId: mfr1._id, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-06-30'), items: [{ productId: p1._id, rate: 100 }, { productId: p2._id, rate: 200 }], createdBy: actorId, updatedBy: actorId });
  await CommRule.create({ scope: 'manufacturer', manufacturerId: mfr1._id, type: 'percentage', value: 5, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-12-31'), createdBy: actorId, updatedBy: actorId });

  console.log('\n=== Seeded IDs ===');
  console.log(`MFR1_ID=${mfr1._id}  MFR2_ID=${mfr2._id}`);
  console.log(`C1_ID=${c1._id}      C2_ID=${c2._id}`);
  console.log(`P1_ID=${p1._id}  P2_ID=${p2._id}  P3_ID=${p3._id}`);
  console.log('\nTest emails (no passwords printed):');
  for (const role of ROLES) console.log(`  phased_test_${role}@test.local`);
}

await mongoose.connect(MONGODB_URI);
console.log('Connected.');
if (process.argv.includes('--cleanup')) { await cleanup(); } else { await seed(); }
await mongoose.disconnect();
