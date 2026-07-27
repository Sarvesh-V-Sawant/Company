/**
 * Phase E cleanup: deactivate all throwaway test records created during Phase D/30.01 UAT.
 * Soft-delete only (isActive=false). Reports counts.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
const _require = createRequire(new URL('file:///D:/projects/Company/apps/admin/package.json'));
const mongoose = _require('mongoose');

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

await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB');

const baseSchema = new mongoose.Schema({}, { strict: false });
const Canteen        = mongoose.model('Canteen',        baseSchema);
const Manufacturer   = mongoose.model('Manufacturer',   baseSchema);
const Product        = mongoose.model('Product',        baseSchema);
const OpsAddress     = mongoose.model('OpsAddress',     baseSchema);
const PriceList      = mongoose.model('PriceList',      baseSchema);
const CommissionRule = mongoose.model('CommissionRule', baseSchema);

// Patterns that identify Phase D throwaway test records
const codeRe  = /^(D3C_|D6C_|D8C|D7TST_)/i;
const mfrRe   = /^(D3M_|D6M_)/i;
const prodRe  = /^(D3P_|D6P_)/i;
const addrRe  = /^(D3 Addr|D6 Addr|D10 HQ)/i;

// IDs of seeded PHASED manufacturers to find their test price lists / commission rules
const phMfrs = await Manufacturer.find({ code: /^PHASED_TEST_/ }).select('_id').lean();
const phMfrIds = phMfrs.map(m => m._id);
console.log(`Seeded PHASED manufacturers: ${phMfrIds.length}`);

async function deactivate(Model, name, filter) {
  const r = await Model.updateMany({ ...filter, isActive: true }, { $set: { isActive: false } });
  console.log(`  ${name}: deactivated ${r.modifiedCount} (matched ${r.matchedCount})`);
  return r.modifiedCount;
}

console.log('\n--- Deactivating Phase D test records ---');

await deactivate(Canteen,        'Canteen',        { code: codeRe });
await deactivate(Manufacturer,   'Manufacturer',   { code: mfrRe });
await deactivate(Product,        'Product',        { sku: prodRe });
await deactivate(OpsAddress,     'OpsAddress',     { label: addrRe });
// Price lists with effectiveFrom far in future (>= year 2027) created by Phase D
await deactivate(PriceList,      'PriceList',      { effectiveFrom: { $gte: new Date('2027-01-01') } });
// Commission rules with effectiveFrom far in future (>= year 2027)
await deactivate(CommissionRule, 'CommissionRule', { effectiveFrom: { $gte: new Date('2027-01-01') } });

// Also deactivate any addresses with label matching D10 HQ pattern
await deactivate(OpsAddress, 'OpsAddress(company)', { label: /^D10 HQ/i });

console.log('\n--- Active counts after cleanup ---');
const [cants, mfrs, prods, addrs, pls, crs] = await Promise.all([
  Canteen.countDocuments({ isActive: true }),
  Manufacturer.countDocuments({ isActive: true }),
  Product.countDocuments({ isActive: true }),
  OpsAddress.countDocuments({ isActive: true }),
  PriceList.countDocuments({ isActive: true }),
  CommissionRule.countDocuments({ isActive: true }),
]);
console.log(`  Canteens active: ${cants}`);
console.log(`  Manufacturers active: ${mfrs}`);
console.log(`  Products active: ${prods}`);
console.log(`  Addresses active: ${addrs}`);
console.log(`  PriceLists active: ${pls}`);
console.log(`  CommissionRules active: ${crs}`);

await mongoose.disconnect();
console.log('\nPhase E cleanup complete.');
