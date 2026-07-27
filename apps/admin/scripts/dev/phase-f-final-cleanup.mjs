import { createRequire } from 'module';
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
const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

async function del(coll, filter) {
  const r = await db.collection(coll).deleteMany(filter);
  console.log(`${coll}: deletedCount=${r.deletedCount}`);
  return r.deletedCount;
}

const testUsers = await db.collection('users').find({ employeeId: { $regex: '^PHASED_TEST_' } }).project({ _id: 1 }).toArray();
const testUserIds = testUsers.map(u => u._id);

const testMfrs = await db.collection('manufacturers').find({ code: { $regex: '^(PHASED_TEST_|IMP_M|D5_MFR)' } }).project({ _id: 1 }).toArray();
const testMfrIds = testMfrs.map(m => m._id);

await del('employees', { userId: { $in: testUserIds } });
await del('users', { employeeId: { $regex: '^PHASED_TEST_' } });
await del('pricelists', { manufacturerId: { $in: testMfrIds } });
await del('commissionrules', { manufacturerId: { $in: testMfrIds } });
await del('manufacturers', { code: { $regex: '^(PHASED_TEST_|IMP_M|D5_MFR)' } });
await del('canteens', { code: { $regex: '^PHASED_TEST_' } });
await del('products', { sku: { $regex: '^(PHASED_TEST_|IMP_P|D5_P)' } });
await del('opsaddresses', { label: { $regex: '^E1 Test' } });
await del('importbatches', { entityType: { $in: ['CANTEEN', 'MANUFACTURER', 'PRODUCT'] } });
await del('attendancesessions', { employeeId: { $in: testUserIds } });
await del('attendancedays', { employeeId: { $in: testUserIds } });
await del('usednonces', { employeeId: { $in: testUserIds } });

await mongoose.disconnect();
