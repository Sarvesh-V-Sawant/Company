# Phase 15.36 — Web Login Verification and Mobile Login Runtime Readiness

**Date:** 2026-07-03
**Scope:** Verify Phase 15.35 web login fix; mobile source sanity check; remove diagnostic print; mobile static verification; mobile device readiness.

---

## Executive Summary

Admin web login fix (Phase 15.35) is confirmed correct. All targeted API checks pass. The login page loads, wrong password returns `401 AUTH_001` (JSON flows to caller), valid login succeeds, `/me` returns admin role, logout succeeds, and post-logout redirect to `/login` works. No browser automation is installed so UI flow is verified via API + source evidence.

Mobile source fixes are confirmed syntactically correct (`flutter analyze` — no issues). One diagnostic `print` statement added by Phase 15.35 was removed. No Android emulator or physical device is available; mobile runtime verification remains blocked.

---

## Precheck Current State

| Check | Result | Pass/Fail |
|---|---|---|
| Port 3000 | Occupied (PID 14168) | PASS |
| `/health` | `200 {status:ok, db:ok, redis:ok}` | PASS |
| `/login` | 200 | PASS |
| `/dashboard` unauthenticated | `307 → http://localhost:3000/login` | PASS |
| `.env.local` exists | Yes | PASS |
| `.env.local` gitignored | Yes (`check-ignore` confirmed) | PASS |
| `.env.local` staged deletion | `D  apps/admin/.env.local` | PASS |
| Modified files | Expected set only (Phases 15.31–15.35) | PASS |

---

## Admin Web Browser Login Verification

No Playwright/Puppeteer installed in the project. Browser flow verified via API + source code trace.

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| `/login` loads | 200 | 200 | PASS |
| Wrong password → HTTP 401 | 401 + `AUTH_001` JSON | `401 code=AUTH_001` | PASS |
| Wrong password → UI message | "Invalid email or password..." (not "Unable to connect") | Code path: `API_MESSAGES['AUTH_001']` = 'Invalid email or password. Check your credentials and try again.' — `code` now reaches caller | PASS |
| Valid login → 200 + token | 200, `success=true`, `accessToken` present | 200 success=true hasToken=true | PASS |
| `/me` with valid token | 200, `role=admin` | 200 role=admin | PASS |
| Logout | 200 | 200 | PASS |
| `/dashboard` after logout | 307 → `/login` | 307 → `http://localhost:3000/login` | PASS |

**Browser UI note:** Source trace confirms `login/page.tsx` line 54 — `API_MESSAGES[code] ?? fallback`. With the Phase 15.35 fix, `code='AUTH_001'` reaches the page correctly. The "Unable to connect" fallback is no longer triggered by wrong-password 401.

---

## Admin Source Sanity Check

File: `apps/admin/src/lib/utils/api-client.ts`

| Check | Result | Pass/Fail |
|---|---|---|
| Login `401` with no session flows JSON to caller | `if (_refreshToken && _sessionId)` guard at line 70 — without session, block is skipped, JSON is returned | PASS |
| Existing-session `401` still triggers refresh | Same block only entered when `_refreshToken && _sessionId` truthy | PASS |
| Refresh endpoint excluded from 401 intercept | `path !== '/api/v1/auth/refresh'` check at line 66 | PASS |
| No tokens logged | No `console.log`/`console.error` present | PASS |
| No debug prints | None | PASS |
| No broad auth refactor | Minimal 2-line change (guard + closing brace) | PASS |

---

## Mobile Source Sanity Check

### `apps/mobile/lib/core/network/interceptors/auth_interceptor.dart`

| Check | Result | Pass/Fail |
|---|---|---|
| Login `401` not treated as session expiry | `publicPaths` check (lines 46–50) exits before refresh logic | PASS |
| `forgotPassword`, `resetPassword` also skipped | Both included in `publicPaths` | PASS |
| Refresh endpoint still handles session expiry | Separate check at line 53 — calls `onSessionExpired` and passes through | PASS |
| No token values logged | No `print` with token content | PASS |
| No passwords logged | No `print` with password content | PASS |
| No broad auth refactor | Minimal 5-line insert | PASS |

### `apps/mobile/lib/features/auth/data/repositories/auth_repository.dart`

| Check | Result | Pass/Fail |
|---|---|---|
| `DioException` caught and converted to typed exceptions | `on DioException catch (e)` block extracts error body | PASS |
| `AUTH_004`/`AUTH_005` → `DeviceMismatchException` | Explicit check before generic `AuthException` | PASS |
| Generic non-device errors → `AuthException(code, message)` | `throw AuthException(code: code, message: message)` | PASS |
| No token values logged | No print exposing tokens | PASS |
| No passwords logged | No print exposing passwords | PASS |
| Phase 15.35 diagnostic print removed | `[DIAG][REPO] DioException:` print removed (see below) | PASS |
| Pre-existing Phase 15.18 diagnostic prints | Retained — safe, print only non-sensitive metadata | PASS |
| No syntax issues | `flutter analyze` — no issues | PASS |
| No broad auth refactor | Minimal DioException catch block only | PASS |

### Diagnostic print removed

One print statement added by Phase 15.35 was removed:

```dart
// REMOVED (Phase 15.36):
// ignore: avoid_print
print('[DIAG][REPO] DioException: code=$code message=$message');
```

Pre-existing Phase 15.18 diagnostic prints (`[DIAG][REPO] login() entry`, `fingerprint obtained`, etc.) were retained — they log non-sensitive metadata and were present before Phase 15.35.

---

## Targeted Admin Verification

| Check | Expected | Actual | Pass/Fail |
|---|---|---|---|
| `/health` | `200 {db:ok, redis:ok}` | `200 db=ok redis=ok` | PASS |
| Wrong password | `401 AUTH_001` | `401 AUTH_001` | PASS |
| Valid login | `200 success=true token present` | `200 success=true hasToken=true` | PASS |
| `/api/v1/auth/me` | `200 role=admin` | `200 role=admin` | PASS |
| Logout | `200` | `200` | PASS |
| `/dashboard` after logout | `307 → /login` | `307 → /login` | PASS |

**Result: 6/6 PASS**

---

## Targeted Mobile Static Verification

| Check | Command | Result | Pass/Fail |
|---|---|---|---|
| Analyzer on changed files | `flutter analyze lib/core/network/interceptors/auth_interceptor.dart lib/features/auth/data/repositories/auth_repository.dart` | No issues found (1.7s) | PASS |

Full `flutter test` not run — no mobile unit tests for auth layer exist; analyzer confirms no syntax or type errors in changed files.

---

## Mobile Runtime Device Availability

| Target | Available? | Suitable for Mobile Login Verification? | Notes |
|---|---|---|---|
| Android emulator | No | Yes | `flutter emulators` → none configured |
| Physical Android device | No | Yes | `adb devices` → not connected |
| Chrome (web) | Yes | No | No secure storage, no `device_info_plus` Android API |
| Windows desktop | Yes | No | No secure storage, no `device_info_plus` Android API |
| Edge (web) | Yes | No | Same limitations as Chrome |

**No suitable device for mobile login verification.**

---

## Mobile Runtime Login Verification

**BLOCKED** — No Android emulator or physical device available.

Mobile source and static checks passed. Runtime behavior cannot be confirmed without an Android target.

---

## Mobile Runtime Blocker / Operator Instructions

To unblock mobile runtime login verification:

### Option A: Android Emulator

1. Open Android Studio → Virtual Device Manager (AVD Manager).
2. Create an AVD — recommended: Pixel 7, API 34 (Android 14).
3. Start the emulator.
4. Confirm in terminal: `flutter emulators` → shows the new AVD.
5. Start Next.js admin server: `cd apps/admin && npm run dev` (serves on port 3000).
6. Run mobile app with correct backend URL:
   ```bash
   cd apps/mobile
   flutter run -d <emulator-id> --dart-define=API_BASE_URL=http://10.0.2.2:3000
   ```
   `10.0.2.2` is the Android emulator's alias for the host loopback — do NOT use `localhost`.
7. Test wrong password → expect "Invalid email or password." on login screen.
8. Test valid credentials → expect either authenticated home screen or device registration screen.

### Option B: Physical Android Device

1. Enable USB Debugging on device (Settings → Developer Options → USB Debugging).
2. Connect via USB.
3. Confirm: `adb devices` shows device as `authorized`.
4. Find LAN IP of dev machine: `ipconfig | findstr "IPv4"`.
5. Run mobile app:
   ```bash
   cd apps/mobile
   flutter run -d <device-id> --dart-define=API_BASE_URL=http://<LAN-IP>:3000
   ```
6. Ensure Next.js server binds to all interfaces if needed: check `next.config.ts` for hostname binding.
7. Test same scenarios as above.

---

## Files Modified

| File | Change |
|---|---|
| `apps/mobile/lib/features/auth/data/repositories/auth_repository.dart` | Removed Phase 15.35 temporary diagnostic print for DioException |

No other files modified in this phase.

---

## Bugs Fixed

None in this phase. Phase 15.35 fixes confirmed correct; no new bugs found.

---

## Remaining Known Issues

| ID | Description | Priority | Status |
|---|---|---|---|
| Mobile runtime verification | No Android emulator/device — mobile login runtime not verified | P1 | Pending device setup |
| P0 secrets | Production secrets not rotated | P0 | Unresolved |
| Git history contamination | Secret blobs at `5bf3a15`, `9b941a9` | P0 | Unresolved |
| Vercel production verification | Production env/log verification incomplete | P0 | Unresolved |
| DB name | Admin app connected to `test` DB (smoke test DB) | P1 | Pending environment config review |
| Employee role test | Employee role runtime testing not performed | P2 | Pending UAT |

---

## Production Readiness Impact

Web login now correctly surfaces `AUTH_001` ("Invalid email or password") for wrong credentials. The "Unable to connect" false positive is eliminated. Session expiry handling for authenticated portal use is unchanged.

Mobile source fix is syntactically correct. Runtime impact cannot be confirmed without Android device.

**Production readiness: NOT READY** — P0 blockers unresolved (secrets, git history, Vercel verification).

---

## Final Decision

**B** — Admin web login verified; mobile static checks passed; mobile runtime blocked by missing Android device/emulator.
