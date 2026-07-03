# Phase 15.31 — AUTH-BUG-001 Fix: Login 500 When User-Agent Absent

**Date:** 2026-07-02
**Scope:** Minimal single-line bug fix. No schema changes. No route changes. No test data impact.
**Defect:** AUTH-BUG-001 — identified in Phase 15.30 runtime smoke test.

---

## Defect Summary

| Property | Value |
|---|---|
| Symptom | `POST /api/v1/auth/login` returns HTTP 500 with empty body when `User-Agent` header is absent |
| Server error | `DeviceSession validation failed: deviceInfo: Path 'deviceInfo' is required.` |
| Root cause | `deviceInfo: userAgent.slice(0, 500)` — when `userAgent` is `''` (empty string from `?? ''` in route), `.slice()` returns `''`, which Mongoose rejects as a `required: true` violation |
| Blast radius | Any HTTP client that omits `User-Agent`. Automated tools, `curl` without `-A`, `fetch` without explicit UA header. Mobile apps always set UA — risk in practice was low but defect was proven in Phase 15.30. |

---

## Root Cause Chain

```
login route (route.ts:40):
  request.headers.get('user-agent') ?? ''
              ↓ empty string when header absent
AuthService.login (AuthService.ts:146):
  deviceInfo: userAgent.slice(0, 500)
              ↓ ''.slice(0, 500) === ''
DeviceSession.create:
  required: true → validation failure → throws
              ↓
login route catch block:
  throw err (not an AppError → not caught → 500)
```

---

## Fix

**File:** `apps/admin/src/services/AuthService.ts`

```typescript
// Line 146 — before (BUG)
deviceInfo: userAgent.slice(0, 500),

// Line 146 — after (FIX)
deviceInfo: (userAgent || 'unknown').slice(0, 500),
```

**Why here, not at the route:** `AuthService.login()` is a public service method. It must be robust to any valid caller passing an empty string for `userAgent`. The route correctly maps "no header" to `''` — the service is the right place to apply the fallback.

**Why `'unknown'` not `''`:** Satisfies `required: true`, semantically accurate when no UA is provided, and searchable in audit/session records.

**No other changes made.**

---

## Pre-Fix Evidence (Phase 15.30)

Server log captured during Phase 15.30 smoke test:

```
DeviceSession validation failed: deviceInfo: Path 'deviceInfo' is required.
POST /api/v1/auth/login 500 in 1739ms
```

---

## Post-Fix Verification Results (Phase E — 7-case suite)

Tested against local dev server (Next.js 16.2.9 + Turbopack, Atlas `test` DB):

| Case | Condition | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 1 | Login, no `User-Agent` header | 200 (was 500) | 200 in 6162ms | **PASS — AUTH-BUG-001 fixed** |
| 2 | Login, `User-Agent: GenesisVerify/15.31` | 200 (regression check) | 200 in 1766ms | PASS |
| 3 | Wrong password, no UA | 401 AUTH_001 | 401 in 522ms | PASS |
| 4 | Invalid `deviceFingerprint` format | 400 GEN_001 | 400 in 106ms | PASS |
| 5 | `GET /api/v1/auth/me` valid token | 200 | 200 in 358ms | PASS |
| 6 | `POST /api/v1/auth/refresh` valid token | 200 | 200 in 891ms | PASS |
| 7 | `POST /api/v1/auth/logout` | 200 | 200 in 744ms | PASS |

**Result: 7/7 PASS**

Case 1 note: first login takes ~6s due to Atlas DeviceSession TTL index cold-start (documented in Phase 15.30, DEFECT-003, accepted). Subsequent requests normal.
Case 5 confirmation: `role=admin email=admin@genesis.com` — token payload intact.
Case 6 confirmation: new `accessToken` returned (len=221) — refresh flow intact.
Case 7 confirmation: session terminated cleanly.

---

## Diff

```diff
--- a/apps/admin/src/services/AuthService.ts
+++ b/apps/admin/src/services/AuthService.ts
@@ -143,7 +143,7 @@ export class AuthService {
     const session = await DeviceSession.create({
       employeeId: user._id,
       refreshTokenHash,
       deviceFingerprint: deviceFingerprint ?? null,
-      deviceInfo: userAgent.slice(0, 500),
+      deviceInfo: (userAgent || 'unknown').slice(0, 500),
       platform: detectPlatform(userAgent),
       expiresAt,
       absoluteExpiresAt,
```

---

## Files Changed

| File | Change |
|---|---|
| `apps/admin/src/services/AuthService.ts` | Line 146: `userAgent.slice(0, 500)` → `(userAgent || 'unknown').slice(0, 500)` |

No other files modified. No schema migration. No database changes. No environment variable changes.

---

## Existing Tests

No test files found in `apps/admin/**/*.test.ts` or `apps/admin/**/*.spec.ts`. AUTH-BUG-001 was verified exclusively via runtime verification against local dev server.

---

## Remaining Open Defects

| ID | Description | Priority | Status |
|---|---|---|---|
| DEFECT-001 | `/health` reads `readyState` without `connectDB()` — Vercel cold-start failure | P0 | Unresolved |
| DEFECT-002 | `proxy.ts` not registered as Next.js middleware — JWT gate not running on Vercel | P0 | Unresolved |
| SEC-001 | Refresh token not rotated on use | P1 | Unresolved |
| SEC-002 | No access token blacklist on logout (15-min window) | P2 | Accepted design tradeoff |
| P0 secrets | All production secrets unrotated | P0 | Unresolved |
| Git history | Secret blobs at `5bf3a15`, `9b941a9` | P0 | Unresolved |

---

## Final Decision

**AUTH-BUG-001: FIXED and verified — 7/7 cases pass.**

**Production readiness: NOT READY** — remaining blockers: DEFECT-001, DEFECT-002, unrotated P0 secrets, unremediated git history. These are independent of AUTH-BUG-001 and require separate phases.

**Decision: A — Fix verified, safe to commit with other pending hygiene changes when commit phase begins.**
