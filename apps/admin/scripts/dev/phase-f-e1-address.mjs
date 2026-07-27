const BASE = 'http://localhost:3000';
async function loginAdmin() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'phased_test_admin@test.local', password: 'TestPass123!' }) });
  const j = await res.json(); return j.data.accessToken;
}
function authHeaders(token) { return { 'Content-Type': 'application/json', Cookie: `__session=${token}` }; }
const token = await loginAdmin();

const base = { label: 'E1 Test', addressType: 'both', line1: 'Test Line 1', city: 'Mumbai', state: 'Maharashtra', stateCode: 'MH', pincode: '400001' };

// Get a valid canteen id
const canteenList = await fetch(`${BASE}/api/v1/ops/canteens`, { headers: authHeaders(token) });
const canteenJ = await canteenList.json();
const canteenId = canteenJ.data?.[0]?._id;
console.log('using canteenId', canteenId);

async function tryCreate(label, body) {
  const r = await fetch(`${BASE}/api/v1/ops/addresses`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`${label}: status=${r.status} code=${j.error?.code ?? '-'} id=${j.data?._id ?? j.data?.id ?? '-'}`);
  return { status: r.status, id: j.data?._id ?? j.data?.id };
}

await tryCreate('E1a company + NO ownerId (expect success)', { ...base, ownerType: 'company' });
await tryCreate('E1b canteen + NO ownerId (expect reject)', { ...base, ownerType: 'canteen' });
await tryCreate('E1c manufacturer + NO ownerId (expect reject)', { ...base, ownerType: 'manufacturer' });
await tryCreate('E1d canteen + valid ownerId (expect success)', { ...base, ownerType: 'canteen', ownerId: canteenId });
