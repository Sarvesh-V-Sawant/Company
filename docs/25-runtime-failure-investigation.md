# Phase 15.3 — Runtime Failure Investigation

**Date:** 2026-06-22
**Method:** Live runtime diagnostics — `npm run dev`, Node.js DNS resolution tests, Windows network adapter audit, Atlas SRV/TXT nslookup
**Scope:** Backend startup, DNS resolution, env loading, MongoDB connection, all initializers

---

## Executive Summary

`npm run dev` fails with a single root cause: **Node.js c-ares DNS resolver is targeting `127.0.0.1` as its DNS server, but nothing is listening on `127.0.0.1:53`.** Every `dns.resolve*()` call — including the SRV lookup that `mongoose.connect('mongodb+srv://...')` requires — returns `ECONNREFUSED`. This causes the instrumentation hook to throw, and Next.js 16 exits the dev server (code 1).

**MongoDB Atlas is not broken.** The cluster is running and the SRV record resolves correctly via nslookup. The failure is entirely in Node.js's DNS layer on this Windows machine.

**One critical finding blocks startup. Three secondary findings corrupt configuration.**

---

## Critical Findings

### C1 — Node.js c-ares DNS targets 127.0.0.1 (STARTUP BLOCKER)

**Severity:** CRITICAL — dev server cannot start  
**Category:** System / Network  
**Status:** ROOT CAUSE CONFIRMED

#### Evidence

```
node -e "const dns = require('dns'); console.log(dns.getServers());"
→ [ '127.0.0.1' ]
```

```
node -e "dns.resolve4('google.com', (err, r) => console.log(err ? 'ERROR: ' + err.code : r[0]));"
→ A google.com: ERROR: ECONNREFUSED
```

```
node -e "dns.resolveSrv('_mongodb._tcp.cluster0.l1fsgrj.mongodb.net', (err, r) => console.log(...));"
→ SRV atlas: ERROR: ECONNREFUSED querySrv ECONNREFUSED _mongodb._tcp.cluster0.l1fsgrj.mongodb.net
```

nslookup (Windows DNS Client, NOT c-ares) resolves correctly:
```
nslookup -type=SRV _mongodb._tcp.cluster0.l1fsgrj.mongodb.net
→ Server: dns.google (8.8.8.8)
→ ac-o1wzf7n-shard-00-00.l1fsgrj.mongodb.net:27017
→ ac-o1wzf7n-shard-00-01.l1fsgrj.mongodb.net:27017
→ ac-o1wzf7n-shard-00-02.l1fsgrj.mongodb.net:27017
```

#### Root cause chain

**Step 1 — Inactive adapters have `fec0:0:0:ffff::X` IPv6 DNS entries:**

```
Interface: Local Area Connection* 1  | IPv6 DNS: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
Interface: Local Area Connection* 2  | IPv6 DNS: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
Interface: Bluetooth Network Connection | IPv6 DNS: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
Interface: Loopback Pseudo-Interface 1  | IPv6 DNS: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
Interface: Wi-Fi                     | IPv4 DNS: 8.8.8.8  ← ONLY ACTIVE ADAPTER
```

`fec0:0:0:ffff::1` is a legacy Windows site-local IPv6 address that c-ares translates to `127.0.0.1` (loopback). These entries exist on four inactive adapters (Bluetooth, Local Area Connection* 1 & 2, Loopback).

**Step 2 — c-ares collects ALL adapter DNS entries, including from inactive adapters:**

Node.js 24's c-ares implementation reads DNS servers from the Windows registry across all adapters. It processes `fec0:0:0:ffff::1` → `127.0.0.1`. Since this entry appears on FOUR adapters before the Wi-Fi adapter, c-ares builds its server list as `['127.0.0.1']` and uses it as the primary DNS.

**Step 3 — Nothing is listening on 127.0.0.1:53:**

```
netstat -ano | grep ":53 "  →  (no results)
```

Every DNS query c-ares attempts connects to TCP `127.0.0.1:53` → immediate `ECONNREFUSED`.

**Step 4 — `mongoose.connect('mongodb+srv://...')` triggers c-ares SRV lookup:**

```
// lib/db/connect.ts:18
const conn = await mongoose.connect(uri, { maxPoolSize: 10, ... });
```

`mongodb+srv://` protocol requires the MongoDB driver to call `dns.resolveSrv('_mongodb._tcp.<host>')` before establishing the TCP connection. This call goes through c-ares → `127.0.0.1:53` → ECONNREFUSED.

**Step 5 — Instrumentation hook throws, Next.js 16 dev server exits:**

```typescript
// instrumentation.ts:1-6
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { connectDB } = await import('./src/lib/db/connect');
    await connectDB();  // throws ECONNREFUSED
  }
}
```

Next.js 16 with Turbopack treats an unhandled instrumentation hook rejection as fatal:
```
✓ Ready in 351ms
Error: An error occurred while loading instrumentation hook:
  querySrv ECONNREFUSED _mongodb._tcp.cluster0.l1fsgrj.mongodb.net
npm error code 1
```

Process exits. Dev server is dead.

#### Why is this development-only?

- **Windows development machine**: c-ares picks up legacy `fec0::` entries from inactive adapters
- **Vercel production (Linux)**: c-ares reads `/etc/resolv.conf` which correctly lists `127.0.0.53` (systemd-resolved) or the VPC DNS — working
- **Confirmation**: This failure is 100% local environment, not Atlas, not code, not configuration

#### Atlas is healthy — confirmed

```
nslookup -type=TXT cluster0.l1fsgrj.mongodb.net
→ "authSource=admin&replicaSet=atlas-ge933a-shard-0"
```

SRV hosts:
- `ac-o1wzf7n-shard-00-00.l1fsgrj.mongodb.net:27017`
- `ac-o1wzf7n-shard-00-01.l1fsgrj.mongodb.net:27017`
- `ac-o1wzf7n-shard-00-02.l1fsgrj.mongodb.net:27017`

#### Proposed fix

**Option A — Direct connection string in `.env.local` (recommended, no code change)**

Replace `MONGODB_URI` in `apps/admin/.env.local` with a direct connection string. Direct host connections use `net.createConnection()` → `dns.lookup()` → Windows `getaddrinfo` (system resolver) → uses Wi-Fi's `8.8.8.8` → resolves correctly. SRV lookup is bypassed entirely.

```env
MONGODB_URI=mongodb://worksbysarvesh_db_user:gr0DKiyX9l1DksAM@ac-o1wzf7n-shard-00-00.l1fsgrj.mongodb.net:27017,ac-o1wzf7n-shard-00-01.l1fsgrj.mongodb.net:27017,ac-o1wzf7n-shard-00-02.l1fsgrj.mongodb.net:27017/genesis?ssl=true&authSource=admin&replicaSet=atlas-ge933a-shard-0&retryWrites=true&w=majority
```

Parameters explained:
| Parameter | Value | Source |
|-----------|-------|--------|
| hosts | `ac-o1wzf7n-shard-00-{00,01,02}.l1fsgrj.mongodb.net:27017` | nslookup SRV |
| database | `genesis` | carried from original URI |
| `ssl=true` | required | Atlas always requires TLS |
| `authSource=admin` | required | from TXT record |
| `replicaSet=atlas-ge933a-shard-0` | required | from TXT record |
| `retryWrites=true&w=majority` | kept | from original URI |

**For production (Vercel):** Keep `mongodb+srv://` format — Vercel's Linux DNS stack works correctly. This change is dev-only.

**Option B — System DNS fix (repairs Node.js c-ares globally)**

Remove `fec0:0:0:ffff::X` IPv6 DNS entries from inactive adapters, or explicitly set Wi-Fi's IPv4 DNS as the primary. After this fix, `dns.getServers()` returns `['8.8.8.8']` and all c-ares queries work.

```powershell
# Verify Wi-Fi IPv4 DNS is 8.8.8.8 (already set)
Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4
# Disable IPv6 on inactive adapters if not needed
# This removes the fec0:: entries from c-ares's view
```

Option B is permanent but requires network adapter changes. Option A is surgical and targeted to local dev.

---

## High Findings

### H1 — FIREBASE_PRIVATE_KEY has trailing comma in `.env.local`

**Severity:** HIGH (malformed, functionally safe — but VERIFY)  
**File:** `apps/admin/.env.local:18`

```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",                    # paste with literal \n for newlines
```

After the closing `"`, there is a `,` before the comment. Dotenv v16+ (used by Next.js 16) ignores all content after the closing quote of a double-quoted value. The comma is dropped.

**Parsed value:** `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`

Next.js dotenv (double-quoted values): expands `\n` escape sequences to actual newline characters (0x0A). So `process.env.FIREBASE_PRIVATE_KEY` contains real newlines.

`admin.ts:10`:
```typescript
privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
```

The regex `/\\n/g` searches for literal backslash+n sequences. Since dotenv has already expanded them to real newlines, this replace is a no-op — but the value is already correct. **Firebase Admin SDK initialization will work.**

**Why HIGH, not LOW:** The trailing `,` is a sign the value was copy-pasted from a JSON context or the `.env.example` template. If dotenv behavior changes or a different env loader is used, this becomes a parse error. The file should be corrected.

**Proposed fix:** Remove the trailing `,` from line 18 of `.env.local`.

---

### H2 — SEED_ADMIN_INITIAL_PASSWORD is wrong variable name

**Severity:** HIGH (blocks seeding with intended credentials)  
**File:** `apps/admin/.env.local:27`

```
# .env.local line 27:
SEED_ADMIN_INITIAL_PASSWORD=                  # REMOVE FROM VERCEL ENV VARS AFTER SEEDING
```

Source code reads `SEED_ADMIN_PASSWORD`:
```typescript
// scripts/seed-admin.ts:13
const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
```

`SEED_ADMIN_INITIAL_PASSWORD` is never read by any source file. When seed script runs, it uses the hardcoded default `Admin@123456` regardless of what's set.

**Proposed fix:** Rename `SEED_ADMIN_INITIAL_PASSWORD` → `SEED_ADMIN_PASSWORD` and set a strong password value.

---

## Medium Findings

### M1 — Dead env vars present in `.env.local`

**Severity:** MEDIUM (no runtime impact, creates operational confusion)  
**File:** `apps/admin/.env.local:6-9`

```
JWT_REFRESH_SECRET=31a0c1491bbd437a4634c62cbf0d40d918028cde...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_REFRESH_ABSOLUTE_EXPIRES_IN=90d
```

Confirmed dead by source audit (docs/24):
- `JWT_REFRESH_SECRET` — refresh tokens are opaque `randomBytes(32).toString('hex')`, not JWTs
- `JWT_ACCESS_EXPIRES_IN` — `AuthService.ts:35` hardcodes `'15m'`
- `JWT_REFRESH_EXPIRES_IN` — `AuthService.ts:92` hardcodes `30 * 24 * 60 * 60 * 1000`
- `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` — `AuthService.ts:91` hardcodes `90 * 24 * 60 * 60 * 1000`

These are set but never read. No runtime effect. **However**, `JWT_REFRESH_SECRET` contains a real-looking secret value in `.env.local` which creates confusion about whether it's needed.

**Proposed fix:** Remove these four lines from `.env.local` and `.env.example`.

---

### M2 — `UPSTASH_REDIS_REST_URL` quoted inconsistently

**Severity:** MEDIUM (functionally correct, inconsistent style)  
**File:** `apps/admin/.env.local:12`

```
UPSTASH_REDIS_REST_URL="https://vast-marmot-104216.upstash.io"
```

Double quotes are dotenv-valid and stripped correctly. Token on line 13 is unquoted. Inconsistency doesn't affect parsing but is worth noting as a template quality issue.

---

## Low Findings

### L1 — `NODE_ENV=development` set explicitly in `.env.local`

**Severity:** LOW (redundant, cosmetic)  
**File:** `apps/admin/.env.local:34`

Next.js dev server automatically sets `NODE_ENV=development`. Explicitly setting it in `.env.local` is redundant and echoes the `.env.example` pattern. No runtime impact.

---

### L2 — `SEED_ADMIN_EMAIL` has no value set

**Severity:** LOW (seed will use default `admin@genesis.com`)  
**File:** `apps/admin/.env.local:26`

```
SEED_ADMIN_EMAIL=admin@genesis.com
```

This is actually correct — value is set. But combined with H2 (wrong password key), the seed will create an admin with email `admin@genesis.com` and the hardcoded default password.

---

## Environment Validation

| Variable | Status | Parsed Correctly | Notes |
|----------|--------|-----------------|-------|
| `MONGODB_URI` | ✅ Defined | ✅ | Value is `mongodb+srv://...` — fails at DNS layer (C1) |
| `JWT_SECRET` | ✅ Defined | ✅ (inline comment stripped) | Value has trailing whitespace+comment — dotenv strips correctly |
| `UPSTASH_REDIS_REST_URL` | ✅ Defined | ✅ (quotes stripped) | Quoted, dotenv strips correctly |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Defined | ✅ | |
| `FIREBASE_PROJECT_ID` | ✅ Defined | ✅ | `genesis-deed1` |
| `FIREBASE_CLIENT_EMAIL` | ✅ Defined | ✅ | |
| `FIREBASE_PRIVATE_KEY` | ✅ Defined | ✅ (trailing comma stripped, `\n` expanded) | See H1 |
| `BREVO_API_KEY` | ✅ Defined | ✅ | |
| `BREVO_SENDER_EMAIL` | ✅ Defined | ✅ | `worksbysarvesh@gmail.com` — NOTE: must be a verified Brevo sender |
| `BREVO_SENDER_NAME` | ✅ Defined | ✅ | `Genesis HR` |
| `CRON_SECRET` | ✅ Defined | ✅ | 64-char hex — correct |
| `NEXT_PUBLIC_APP_URL` | ✅ Defined | ✅ | `https://your-app.vercel.app` — placeholder, OK for local dev |

**Dead vars present (4):** `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` — set, never read  
**Wrong-name var (1):** `SEED_ADMIN_INITIAL_PASSWORD` — should be `SEED_ADMIN_PASSWORD`

---

## MongoDB Validation

| Check | Result |
|-------|--------|
| Atlas cluster running | ✅ (user confirmed) |
| Network Access configured | ✅ (user confirmed) |
| DB user exists | ✅ (user confirmed) |
| SRV DNS record exists | ✅ — confirmed via nslookup |
| SRV hosts | `ac-o1wzf7n-shard-00-{00,01,02}.l1fsgrj.mongodb.net:27017` |
| TXT record | `authSource=admin&replicaSet=atlas-ge933a-shard-0` |
| Node.js c-ares SRV resolution | ❌ ECONNREFUSED — c-ares targets 127.0.0.1 |
| `connect.ts` logic | ✅ correct — idempotent, throws on undefined URI |
| `instrumentation.ts` | ✅ correct — guarded by `NEXT_RUNTIME === 'nodejs'` |
| **Connection status** | ❌ BLOCKED — C1 |

---

## Firebase Validation

| Check | Result |
|-------|--------|
| `FIREBASE_PROJECT_ID` | ✅ `genesis-deed1` |
| `FIREBASE_CLIENT_EMAIL` | ✅ `firebase-adminsdk-fbsvc@genesis-deed1.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` presence | ✅ defined |
| Trailing comma after `"` | ⚠️ present — stripped by dotenv (see H1) |
| Newline handling | ✅ dotenv expands `\n` → real newlines; `.replace(/\\n/g, '\n')` is no-op but harmless |
| `admin.ts` initialization | ✅ lazy (guarded by `getApps().length > 0`) |
| **Firebase status** | ✅ WILL INITIALIZE CORRECTLY once startup blocker resolved |

---

## Redis Validation

| Check | Result |
|-------|--------|
| `UPSTASH_REDIS_REST_URL` | ✅ `https://vast-marmot-104216.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ defined (64-char token) |
| Client initialization | Module-import-time — no async DNS required (REST over HTTPS) |
| **Redis status** | ✅ WILL INITIALIZE CORRECTLY — uses HTTPS, not raw TCP DNS |

Note: Upstash Redis client uses HTTPS REST calls. HTTPS connections use `dns.lookup()` (getaddrinfo, system resolver) not c-ares. Redis will work even with the c-ares issue.

---

## Brevo Validation

| Check | Result |
|-------|--------|
| `BREVO_API_KEY` | ✅ defined (`xkeysib-...`) |
| `BREVO_SENDER_EMAIL` | ⚠️ `worksbysarvesh@gmail.com` — must be verified sender in Brevo account |
| `BREVO_SENDER_NAME` | ✅ `Genesis HR` |
| Initialization | Per-call (no startup init) |
| **Brevo status** | ✅ Will send if sender email is verified in Brevo dashboard |

---

## Build Validation

Not run — startup is blocked at instrumentation hook level. No value in running build while C1 is unresolved.

---

## Startup Validation

```
npm run dev output:
▲ Next.js 16.2.9 (Turbopack)
- Local:         http://localhost:3000
- Environments: .env.local                     ← env file loaded correctly
✓ Ready in 351ms                               ← Turbopack compiled OK
Error: An error occurred while loading         ← instrumentation.ts threw
  instrumentation hook: querySrv ECONNREFUSED  ← c-ares → 127.0.0.1:53 refused
npm error code 1                               ← process exited
```

**`.env.local` IS loaded** — confirmed by `- Environments: .env.local` in output.  
**`MONGODB_URI` IS defined** — the `ECONNREFUSED` comes from `mongoose.connect()`, not from the `if (!uri) throw` guard.  
**Turbopack compiled successfully** — no TypeScript or module errors.

---

## Exact Files Requiring Changes

| File | Change | Priority |
|------|--------|---------|
| `apps/admin/.env.local` | Replace `MONGODB_URI` with direct connection string | C1 — CRITICAL, unblocks startup |
| `apps/admin/.env.local` | Remove trailing `,` from `FIREBASE_PRIVATE_KEY` line | H1 |
| `apps/admin/.env.local` | Rename `SEED_ADMIN_INITIAL_PASSWORD` → `SEED_ADMIN_PASSWORD`, set value | H2 |
| `apps/admin/.env.local` | Remove 4 dead JWT vars | M1 |
| `apps/admin/.env.example` | Same dead vars, wrong seed name — correct template | M1+H2 |

---

## Exact Fixes Not Yet Applied

### Fix C1 — Direct MongoDB connection string (unblocks startup)

**File:** `apps/admin/.env.local`  
**Line 2 — current:**
```
MONGODB_URI=mongodb+srv://worksbysarvesh_db_user:gr0DKiyX9l1DksAM@cluster0.l1fsgrj.mongodb.net/genesis?retryWrites=true&w=majority&appName=Cluster0
```

**Line 2 — proposed:**
```
MONGODB_URI=mongodb://worksbysarvesh_db_user:gr0DKiyX9l1DksAM@ac-o1wzf7n-shard-00-00.l1fsgrj.mongodb.net:27017,ac-o1wzf7n-shard-00-01.l1fsgrj.mongodb.net:27017,ac-o1wzf7n-shard-00-02.l1fsgrj.mongodb.net:27017/genesis?ssl=true&authSource=admin&replicaSet=atlas-ge933a-shard-0&retryWrites=true&w=majority
```

**Why this works:** `mongodb://` with explicit hosts uses `net.createConnection()` → `dns.lookup()` → Windows `getaddrinfo` → reads Wi-Fi DNS (`8.8.8.8`) → resolves `ac-o1wzf7n-shard-00-*.l1fsgrj.mongodb.net` correctly. No c-ares SRV lookup required.

**Scope:** Dev-only (`.env.local`). Production Vercel env var keeps `mongodb+srv://` — Vercel Linux DNS works correctly.

---

## Validation Evidence

```
# Proof: c-ares targets 127.0.0.1
node -e "const dns = require('dns'); console.log(dns.getServers());"
→ [ '127.0.0.1' ]

# Proof: ALL c-ares DNS queries fail
node -e "const dns = require('dns'); dns.resolve4('google.com', (err, r) => console.log(err ? 'ERROR: '+err.code : r[0]));"
→ A google.com: ERROR: ECONNREFUSED

# Proof: nslookup (Windows DNS Client) works — Atlas is healthy
nslookup -type=SRV _mongodb._tcp.cluster0.l1fsgrj.mongodb.net
→ Server: dns.google (8.8.8.8)
→ ac-o1wzf7n-shard-00-00.l1fsgrj.mongodb.net:27017
→ ac-o1wzf7n-shard-00-01.l1fsgrj.mongodb.net:27017
→ ac-o1wzf7n-shard-00-02.l1fsgrj.mongodb.net:27017

# Proof: TXT record has replicaSet and authSource
nslookup -type=TXT cluster0.l1fsgrj.mongodb.net
→ "authSource=admin&replicaSet=atlas-ge933a-shard-0"

# Proof: inactive adapters carry fec0:: (= 127.0.0.1 for c-ares)
Get-DnsClientServerAddress | ...
→ Local Area Connection* 1  IPv6: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
→ Local Area Connection* 2  IPv6: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
→ Bluetooth Network Connection IPv6: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3
→ Loopback Pseudo-Interface 1  IPv6: fec0:0:0:ffff::1, fec0:0:0:ffff::2, fec0:0:0:ffff::3

# Proof: .env.local IS loaded by Next.js
npm run dev
→ - Environments: .env.local

# Proof: startup failure is instrumentation hook, not compile error
npm run dev
→ ✓ Ready in 351ms
→ Error: An error occurred while loading instrumentation hook: querySrv ECONNREFUSED ...
→ npm error code 1
```

---

## Decision

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║              RUNTIME FAILURE INVESTIGATION — COMPLETE                ║
║                                                                      ║
║  Root cause identified. STOP. Waiting for approval.                  ║
║                                                                      ║
║  CRITICAL (1):                                                       ║
║    C1 — c-ares DNS → 127.0.0.1 (no listener) → ECONNREFUSED         ║
║         Blocks: instrumentation hook → Next.js dev server exits      ║
║         Fix: change MONGODB_URI to direct mongodb:// in .env.local  ║
║                                                                      ║
║  HIGH (2):                                                           ║
║    H1 — FIREBASE_PRIVATE_KEY trailing comma (functionally safe)      ║
║    H2 — SEED_ADMIN_INITIAL_PASSWORD wrong name (seeding broken)      ║
║                                                                      ║
║  MEDIUM (2):                                                         ║
║    M1 — 4 dead JWT vars in .env.local                                ║
║    M2 — UPSTASH_REDIS_REST_URL inconsistently quoted                 ║
║                                                                      ║
║  LOW (2): NODE_ENV redundant, SEED_ADMIN_EMAIL default value         ║
║                                                                      ║
║  Atlas: HEALTHY. Code: CORRECT. Startup: BLOCKED by DNS.            ║
║                                                                      ║
║  DO NOT DEPLOY. AWAITING REMEDIATION APPROVAL.                       ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

*Runtime Failure Investigation performed: 2026-06-22*
*No files modified — read-only audit with live runtime diagnostics*
*Do not modify code. Do not deploy. Wait for approval before remediation.*
