# Phase 15.1 — Infrastructure Provisioning Verification

**Date:** 2026-06-22
**Method:** Direct source audit — every `process.env.*` reference traced to source file and line
**Scope:** Backend (Next.js), Mobile (Flutter dart-define), seed scripts

---

## Executive Summary

Source audit reveals **4 dead environment variables** documented in `.env.example` but never read by any source file, and **3 undocumented seed variables** present in `seed-admin.ts` but absent from the setup guide. The confirmed required set is smaller and more precise than previously documented.

---

## 1. MongoDB Verification

### Connection file
`apps/admin/src/lib/db/connect.ts`

```typescript
const conn = await mongoose.connect(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

### Environment variable
| Variable | Required | Source |
|----------|----------|--------|
| `MONGODB_URI` | **YES** | `connect.ts:15` — throws if undefined |

### Database name
**Not hardcoded in source.** Set in the connection string URI itself.
Recommended: `genesis-hrms`

Full URI format:
```
mongodb+srv://USERNAME:PASSWORD@cluster.XXXXX.mongodb.net/genesis-hrms?retryWrites=true&w=majority
```

### Collections (auto-created by Mongoose on first connect)

| Collection | Model file | Purpose |
|-----------|-----------|---------|
| `users` | `User.ts` | Auth accounts (admin + employee) |
| `employees` | `Employee.ts` | Employee profile data |
| `attendancedays` | `AttendanceDay.ts` | Daily attendance aggregate |
| `attendancesessions` | `AttendanceSession.ts` | Individual check-in/out sessions |
| `attendancerecords` | `AttendanceRecord.ts` | Attendance records |
| `devicesessions` | `DeviceSession.ts` | Refresh token store + TTL |
| `passwordresettokens` | `PasswordResetToken.ts` | Reset tokens + TTL |
| `fcmtokens` | `FcmToken.ts` | FCM push tokens + 90-day TTL |
| `usednonces` | `UsedNonce.ts` | Replay prevention + 10-min TTL |
| `leaves` | `Leave.ts` | Leave requests |
| `leavetransactions` | `LeaveTransaction.ts` | Leave balance ledger |
| `leaveyearallocations` | `LeaveYearAllocation.ts` | Annual leave entitlements |
| `regularizations` | `Regularization.ts` | Attendance regularization requests |
| `payrollrecords` | `PayrollRecord.ts` | Computed payroll |
| `notifications` | `Notification.ts` | In-app notifications + 1-year TTL |
| `holidays` | `Holiday.ts` | Company holiday calendar |
| `companysettings` | `CompanySettings.ts` | Geofence, shifts, working days |
| `auditlogs` | `AuditLog.ts` | Auth + admin action audit trail |
| `systemevents` | `SystemEvent.ts` | Cron idempotency records |

**Total: 19 collections.** No manual creation needed — Mongoose creates collections and all indexes on first `connectDB()` call.

### TTL indexes (self-expiring — confirmed in models)
| Collection | Field | TTL |
|-----------|-------|-----|
| `devicesessions` | `expiresAt` | at expiry time |
| `passwordresettokens` | `expiresAt` | at expiry time |
| `fcmtokens` | `lastRefreshedAt` | 90 days |
| `usednonces` | `usedAt` | 10 minutes |
| `notifications` | `createdAt` | 1 year |

---

## 2. JWT Authentication Verification

### Variables — confirmed by source audit

| Variable | Read by source? | File:Line | Purpose |
|----------|----------------|-----------|---------|
| `JWT_SECRET` | **YES** | `AuthService.ts:26`, `requireAuth.ts:15`, `proxy.ts:26`, `hash.ts:8` | Signs access tokens (HS256); verifies tokens in middleware; HMAC key for IP hashing |
| `JWT_SECRET_PREVIOUS` | **YES** | `requireAuth.ts:21`, `proxy.ts:32` | Rotation fallback — accepts tokens signed with previous secret |
| `JWT_ACCESS_EXPIRES_IN` | **NO — DEAD** | `.env.example` only | `signAccessToken()` hardcodes `'15m'` at `AuthService.ts:35`. Env var never read. |
| `JWT_REFRESH_EXPIRES_IN` | **NO — DEAD** | `.env.example` only | `AuthService.ts:92` hardcodes `30 * 24 * 60 * 60 * 1000` (30 days). Env var never read. |
| `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` | **NO — DEAD** | `.env.example` only | `AuthService.ts:91` hardcodes `90 * 24 * 60 * 60 * 1000` (90 days). Env var never read. |
| `JWT_REFRESH_SECRET` | **NO — DEAD** | `.env.example` only | Refresh tokens are opaque `randomBytes(32).toString('hex')`, not JWTs. SHA-256 hashed before storage. No JWT signing of refresh tokens anywhere. |

### Token strategy (hardcoded — confirmed from source)
- **Access token:** JWT HS256, signed with `JWT_SECRET`, TTL hardcoded `'15m'`
- **Refresh token:** `randomBytes(32).toString('hex')` → 64-char opaque hex; stored as `sha256(rawToken)` in `DeviceSession`
- **Rolling expiry:** 30 days from last use (hardcoded `AuthService.ts:92`)
- **Absolute expiry:** 90 days from login (hardcoded `AuthService.ts:91`)

### Required JWT variables (confirmed)
- `JWT_SECRET` — **required**
- `JWT_SECRET_PREVIOUS` — set only during rotation events, blank otherwise

### Dead JWT variables (do not set)
- `JWT_REFRESH_SECRET` — no effect
- `JWT_ACCESS_EXPIRES_IN` — no effect (15m hardcoded)
- `JWT_REFRESH_EXPIRES_IN` — no effect (30d hardcoded)
- `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` — no effect (90d hardcoded)

---

## 3. Upstash Redis Verification

### Client file
`apps/admin/src/lib/redis/client.ts`

```typescript
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

Both variables are read at module import time — if either is undefined, the Redis client throws immediately, crashing all API routes that import from this module.

### Required variables
| Variable | Required | Source |
|----------|----------|--------|
| `UPSTASH_REDIS_REST_URL` | **YES** | `redis/client.ts:4` |
| `UPSTASH_REDIS_REST_TOKEN` | **YES** | `redis/client.ts:5` |

### Features depending on Redis
- **Auth rate limiter** — limits login attempts per IP
- **API rate limiter** — general per-IP request throttling
- **Strict rate limiter** — tighter limits on sensitive endpoints (password reset etc.)

All three rate limiters use `@upstash/ratelimit` with sliding window algorithm. Upstash REST API is stateless/serverless-safe — no persistent TCP connection required.

---

## 4. Firebase / FCM Verification

### Backend Admin SDK
`apps/admin/src/lib/firebase/admin.ts`

```typescript
return initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
```

All three variables read in single `cert()` call. App is lazily initialized (cached via `getApps()` guard). If any is undefined, `initializeApp()` throws at first push notification attempt.

### Required backend variables
| Variable | Required | Source |
|----------|----------|--------|
| `FIREBASE_PROJECT_ID` | **YES** | `firebase/admin.ts:8` |
| `FIREBASE_CLIENT_EMAIL` | **YES** | `firebase/admin.ts:9` |
| `FIREBASE_PRIVATE_KEY` | **YES** | `firebase/admin.ts:10` — `.replace(/\\n/g, '\n')` applied |

### FIREBASE_PRIVATE_KEY newline handling
Code applies `.replace(/\\n/g, '\n')` — converts escaped `\\n` to real newlines.

**In Vercel Dashboard:** paste the raw private key value directly (with real newlines). Vercel stores environment variables verbatim. The `.replace()` in code handles the `.env` file escaped form, but Vercel's stored value should use real newlines.

**In `.env.local`:** paste with `\\n` escaping (standard `.env` format):
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"
```

### Mobile Firebase (already provisioned)
| File | Status |
|------|--------|
| `android/app/google-services.json` | ✅ EXISTS |
| `ios/Runner/GoogleService-Info.plist` | ✅ EXISTS |
| `lib/firebase_options.dart` | ✅ EXISTS (flutterfire configure completed) |

Mobile init: `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` — explicit options from generated file.

### FCM flows triggered by backend
- Leave approved/rejected/revoked → push to employee
- Regularization approved/rejected → push to employee
- Payroll finalized → push to employee
- Account activated/deactivated → push to employee
- Leave/regularization submitted → push to all active admins
- Attendance reminder cron → push to unchecked-in employees

---

## 5. Brevo Email Verification

### Email client file
`apps/admin/src/lib/email/brevo.ts`

```typescript
headers: { 'api-key': process.env.BREVO_API_KEY! },
sender: {
  email: process.env.BREVO_SENDER_EMAIL!,
  name: process.env.BREVO_SENDER_NAME!,
},
```

All three read per email send call. Missing values cause HTTP 401 from Brevo API (BREVO_API_KEY) or 400 (invalid sender). Errors are thrown — email failure DOES propagate to caller in `sendEmail()`. NotificationService wraps calls in `.catch()` so push/email failures don't crash the API response.

### Required variables
| Variable | Required | Source |
|----------|----------|--------|
| `BREVO_API_KEY` | **YES** | `email/brevo.ts:11` |
| `BREVO_SENDER_EMAIL` | **YES** | `email/brevo.ts:16` — must be verified Brevo sender |
| `BREVO_SENDER_NAME` | **YES** | `email/brevo.ts:17` |

### Email flows
| Trigger | Template |
|---------|---------|
| Password reset request | `password-reset.html` |
| Leave approved | `leave-approved.html` |
| Leave rejected | `leave-rejected.html` |
| Regularization approved | (notification template) |
| Regularization rejected | (notification template) |
| Payroll finalized | `payroll-reminder.html` |
| Account activated | `welcome.html` |

---

## 6. Cron Security Verification

`apps/admin/src/lib/utils/cron-guard.ts`

```typescript
const secret = process.env.CRON_SECRET;
if (!secret) return false;
return auth === `Bearer ${secret}`;
```

If `CRON_SECRET` is unset, `validateCronSecret()` always returns `false` → all cron endpoints return error → crons silently fail.

| Variable | Required | Notes |
|----------|----------|-------|
| `CRON_SECRET` | **YES** | Must match value Vercel sends as `Authorization: Bearer <value>` |

---

## 7. Application Variables Verification

| Variable | Read by source? | File | Required |
|----------|----------------|------|----------|
| `NEXT_PUBLIC_APP_URL` | **YES** | `AuthService.ts:207` — password reset link base URL | Production YES; local dev use `http://localhost:3000` |
| `NODE_ENV` | **YES** | `auth/login/route.ts:48`, `auth/logout/route.ts:49`, `auth/refresh/route.ts:35` — cookie `secure` flag | Auto-set by Vercel; do not set manually |
| `MAINTENANCE_MODE` | **YES** | `proxy.ts:93` — rewrites to maintenance page | Leave unset; set `"true"` only during maintenance |

---

## 8. Seed Script Variables Verification

`apps/admin/scripts/seed-admin.ts` — confirmed variable names:

```typescript
const email      = process.env.SEED_ADMIN_EMAIL        ?? 'admin@genesis.com';
const password   = process.env.SEED_ADMIN_PASSWORD     ?? 'Admin@123456';
const employeeId = process.env.SEED_ADMIN_EMPLOYEE_ID  ?? 'EMP001';
const firstName  = process.env.SEED_ADMIN_FIRST_NAME   ?? 'Super';
const lastName   = process.env.SEED_ADMIN_LAST_NAME    ?? 'Admin';
```

| Variable | Default | Notes |
|----------|---------|-------|
| `SEED_ADMIN_EMAIL` | `admin@genesis.com` | Set to real admin email |
| `SEED_ADMIN_PASSWORD` | `Admin@123456` | Set strong password; remove from Vercel after seeding |
| `SEED_ADMIN_EMPLOYEE_ID` | `EMP001` | Employee ID for admin account |
| `SEED_ADMIN_FIRST_NAME` | `Super` | Admin first name |
| `SEED_ADMIN_LAST_NAME` | `Admin` | Admin last name |

All have safe defaults — only `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are critical to set before seeding.

> **Previous guide correction:** `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` are wrong names. Seed script never reads those. Use `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

---

## 9. Mobile Build-Time Variable Verification

`apps/mobile/lib/core/constants/api_endpoints.dart:2`

```dart
static const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);
```

| Variable | Type | Required |
|----------|------|----------|
| `API_BASE_URL` | Flutter `--dart-define` (not env var) | YES for production build |

Pass at build time:
```bash
flutter build appbundle --release --dart-define=API_BASE_URL=https://your-domain.vercel.app
```

Compiled into binary — not changeable at runtime.

---

## 10. Dead / Unused Variables

The following are in `.env.example` but **never read by any source file**:

| Variable | Status | Evidence |
|----------|--------|---------|
| `JWT_REFRESH_SECRET` | **DEAD** | Refresh tokens are opaque hex strings, not JWTs. No `JWT_REFRESH_SECRET` reference in source. |
| `JWT_ACCESS_EXPIRES_IN` | **DEAD** | `signAccessToken()` hardcodes `'15m'` (`AuthService.ts:35`). Env var never read. |
| `JWT_REFRESH_EXPIRES_IN` | **DEAD** | Session rolling expiry hardcoded as `30 * 24 * 60 * 60 * 1000` (`AuthService.ts:92`). |
| `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` | **DEAD** | Absolute expiry hardcoded as `90 * 24 * 60 * 60 * 1000` (`AuthService.ts:91`). |
| `ADMIN_EMAIL` | **WRONG NAME** | Seed script reads `SEED_ADMIN_EMAIL`. |
| `ADMIN_INITIAL_PASSWORD` | **WRONG NAME** | Seed script reads `SEED_ADMIN_PASSWORD`. |

**Recommendation:** Update `.env.example` to remove dead vars and correct seed var names (separate task, not blocking deployment).

---

## Confirmed Required Variables (Production)

Complete authoritative list — derived from source, not documentation:

| Variable | Provider | Source file |
|----------|----------|------------|
| `MONGODB_URI` | MongoDB Atlas | `lib/db/connect.ts:15` |
| `JWT_SECRET` | Generate locally | `services/AuthService.ts:26`, `middleware/requireAuth.ts:15`, `proxy.ts:26`, `lib/utils/hash.ts:8` |
| `UPSTASH_REDIS_REST_URL` | Upstash | `lib/redis/client.ts:4` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash | `lib/redis/client.ts:5` |
| `FIREBASE_PROJECT_ID` | Firebase Console | `lib/firebase/admin.ts:8` |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console | `lib/firebase/admin.ts:9` |
| `FIREBASE_PRIVATE_KEY` | Firebase Console | `lib/firebase/admin.ts:10` |
| `BREVO_API_KEY` | Brevo Console | `lib/email/brevo.ts:11` |
| `BREVO_SENDER_EMAIL` | Brevo (verified sender) | `lib/email/brevo.ts:16` |
| `BREVO_SENDER_NAME` | Set manually | `lib/email/brevo.ts:17` |
| `CRON_SECRET` | Generate locally | `lib/utils/cron-guard.ts:5` |
| `NEXT_PUBLIC_APP_URL` | Your domain | `services/AuthService.ts:207` |

**Seed-only (set then remove):**
| Variable | Default |
|----------|---------|
| `SEED_ADMIN_EMAIL` | `admin@genesis.com` |
| `SEED_ADMIN_PASSWORD` | `Admin@123456` |
| `SEED_ADMIN_EMPLOYEE_ID` | `EMP001` |
| `SEED_ADMIN_FIRST_NAME` | `Super` |
| `SEED_ADMIN_LAST_NAME` | `Admin` |

**Optional / rotation:**
| Variable | When |
|----------|------|
| `JWT_SECRET_PREVIOUS` | JWT rotation events only — blank initially |
| `MAINTENANCE_MODE` | Set `"true"` during planned maintenance only |

**DO NOT SET:**
- `JWT_REFRESH_SECRET` — dead
- `JWT_ACCESS_EXPIRES_IN` — dead (15m hardcoded)
- `JWT_REFRESH_EXPIRES_IN` — dead (30d hardcoded)
- `JWT_REFRESH_ABSOLUTE_EXPIRES_IN` — dead (90d hardcoded)
- `NODE_ENV` — Vercel sets automatically
- `VERCEL_URL`, `VERCEL_ENV` — Vercel sets automatically

---

## Infrastructure Provisioning Checklist

### MongoDB Atlas
- [ ] M10+ cluster created
- [ ] Database user created (`readWrite` on `genesis-hrms` database)
- [ ] Network access configured (`0.0.0.0/0` or Vercel IP ranges)
- [ ] Continuous backup enabled
- [ ] Connection string copied and tested
- [ ] `MONGODB_URI` value ready

### JWT + Cron Secrets
- [ ] `JWT_SECRET` generated: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] `CRON_SECRET` generated: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Both values confirmed different
- [ ] Both values stored securely (password manager)

### Upstash Redis
- [ ] Upstash account created
- [ ] Regional Redis database created (region matches Vercel)
- [ ] Eviction policy: **disabled** (rate limiter data must not evict)
- [ ] `UPSTASH_REDIS_REST_URL` copied from Upstash dashboard
- [ ] `UPSTASH_REDIS_REST_TOKEN` copied from Upstash dashboard

### Firebase Backend (Admin SDK)
- [ ] Firebase project exists (same project used by mobile)
- [ ] Service account private key generated (Firebase Console → Project Settings → Service Accounts)
- [ ] `FIREBASE_PROJECT_ID` extracted from JSON (`project_id`)
- [ ] `FIREBASE_CLIENT_EMAIL` extracted from JSON (`client_email`)
- [ ] `FIREBASE_PRIVATE_KEY` extracted from JSON (`private_key`)
- [ ] FCM enabled in Firebase Console → Cloud Messaging

### Firebase Mobile (already complete)
- [x] `google-services.json` present at `android/app/`
- [x] `GoogleService-Info.plist` present at `ios/Runner/`
- [x] `firebase_options.dart` generated
- [x] `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` in `main.dart`

### Brevo Email
- [ ] Brevo account created
- [ ] API key created (name: `genesis-hrms-prod`)
- [ ] Sender domain added (`genesis.com`)
- [ ] SPF record added to DNS: `v=spf1 include:spf.brevo.com mx ~all`
- [ ] DKIM record added to DNS (from Brevo dashboard)
- [ ] DNS propagation verified (Brevo shows domain authenticated)
- [ ] Test email sent and received
- [ ] `BREVO_API_KEY` ready
- [ ] `BREVO_SENDER_EMAIL` = verified sender address

### Vercel
- [ ] Vercel project created and linked to repository
- [ ] Production domain configured
- [ ] All 12 required env vars set in Vercel (Production environment)
- [ ] Seed vars set temporarily (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`)
- [ ] Dead vars confirmed NOT set

---

## Ready-to-Configure Status

| Provider | Status |
|----------|--------|
| MongoDB Atlas | PENDING |
| JWT Secrets | PENDING |
| Upstash Redis | PENDING |
| Firebase Admin SDK | PENDING (project exists; service account key not yet extracted) |
| Firebase Mobile | ✅ COMPLETE |
| Brevo Email | PENDING |
| Vercel Project | PENDING |

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║              INFRASTRUCTURE PROVISIONING VERIFICATION                ║
║                                                                      ║
║  Source audit complete — all env vars traced to exact file:line      ║
║  4 dead variables confirmed — do not set in Vercel                   ║
║  3 undocumented seed vars added to correct guide                     ║
║  12 required production variables confirmed                          ║
║                                                                      ║
║  Code: DEPLOYMENT READY                                              ║
║    Backend  286/286 tests · lint 0 · build ✅                        ║
║    Mobile   97/97 tests · analyze 0 · Firebase wired ✅              ║
║                                                                      ║
║  Infrastructure: READY TO CONFIGURE                                  ║
║    Follow provisioning checklist above in order                      ║
║    Then proceed with deployment                                      ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

*Infrastructure Provisioning Verification performed: 2026-06-22*
*No files modified — read-only source audit*
*Do not modify code. Do not deploy. Do not create infrastructure. Wait for approval.*
