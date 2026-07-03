# Phase 15.31 — AUTH-BUG-001 Fix: Login 500 When User-Agent Absent

**Date:** 2026-07-01
**Scope:** Minimal single-line bug fix. No schema changes. No route changes. No test data impact.
**Defect:** AUTH-BUG-001 — identified in Phase 15.30 runtime smoke test.

---

## Defect Summary

| Property | Value |
|---|---|
| Symptom | `POST /api/v1/auth/login` returns HTTP 500 with empty body when `User-Agent` header is absent |
| Server error | `DeviceSession validation failed: deviceInfo: Path 'deviceInfo' is required.` |
| Root cause | `deviceInfo: userAgent.slice(0, 500)` — when `userAgent` is `''` (empty string), `.slice()` returns `''`, which Mongoose rejects as `required: true` violation |
| Blast radius | Any HTTP client that omits `User-Agent`. Automated tools, `curl` without `-A`, `fetch` without explicit UA header. Mobile apps always set UA — risk in practice was low but defect was proven. |

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
// Line 146 — before
deviceInfo: userAgent.slice(0, 500),

// Line 146 — after
deviceInfo: (userAgent || 'unknown').slice(0, 500),
```

**Why here, not at the route:** `AuthService.login()` is a public service method. It must be robust to any valid caller passing an empty string for `userAgent`. The route correctly maps "no header" to `''` — the service is the right place to apply the fallback.

**Why `'unknown'` not `''`:** `'unknown'` is a non-empty string that satisfies `required: true` and is semantically accurate when no UA is provided. It is also searchable in audit/session records.

**No other changes made.**

---

## Verification Results

Three cases tested against local dev server (Next.js 16.2.9, Atlas `test` DB):

| Case | Condition | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| 1 | No `User-Agent` header | 200 (was 500) | 200 in 2871ms | **PASS — AUTH-BUG-001 fixed** |
| 2 | `User-Agent: GenesisVerify/15.31` | 200 (regression check) | 200 in 1315ms | PASS |
| 3 | Wrong password, no UA | 401 (auth logic intact) | 401 in 486ms | PASS |

Case 1 confirmation: `accessToken` returned (len=221), `sessionId` present, logout returned 200.
Case 2 confirmation: no regression in normal path.
Case 3 confirmation: auth rejection logic (`bcrypt.compare` → `AUTH_001`) unaffected by fix.

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

## Remaining Open Defects

| ID | Description | Status |
|---|---|---|
| DEFECT-001 | `/health` reads `readyState` without `connectDB()` — Vercel cold-start failure | Unresolved |
| DEFECT-002 | `proxy.ts` not registered as Next.js middleware — JWT gate not running on Vercel | Unresolved |
| SEC-001 | Refresh token not rotated on use | Unresolved |
| SEC-002 | No access token blacklist on logout | Unresolved (design tradeoff) |
| P0 secrets | All production secrets unrotated | Unresolved |
| Git history | Secret blobs at `5bf3a15`, `9b941a9` | Unresolved |

---

## Final Decision

**AUTH-BUG-001: FIXED and verified.**

**Production readiness: NOT READY** — remaining blockers: DEFECT-001, DEFECT-002, unrotated P0 secrets, unremediated git history.
