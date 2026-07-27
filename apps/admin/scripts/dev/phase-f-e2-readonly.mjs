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
const total = await db.collection('opsaddresses').countDocuments();
const wouldFail = await db.collection('opsaddresses').countDocuments({ ownerType: { $in: ['canteen','manufacturer'] }, $or: [{ ownerId: { $exists: false } }, { ownerId: null }] });
console.log('Total addresses:', total, ' Would now fail validation (canteen/mfr missing ownerId):', wouldFail);
await mongoose.disconnect();
