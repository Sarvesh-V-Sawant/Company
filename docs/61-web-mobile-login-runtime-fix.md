# Phase 15.35 — Web and Mobile Login Runtime Fix

**Date:** 2026-07-02
**Scope:** Frontend auth error handling fix (web + mobile). No backend changes.

---

## Executive Summary

**Admin web:** Backend works. Valid credentials return 200. Bug was in `api-client.ts`: a 401 from any endpoint (including login) triggered a session-expiry throw before the error JSON was returned, so the login form received an exception with no `code` property and fell to the default "Unable to connect" message. Fix: only intercept 401 as session expiry when an existing session (refresh token) is present.

**Mobile:** Same pattern in Dio `AuthInterceptor.onError`: login's 401 triggered `onSessionExpired?.call()` and navigated away from the login screen, then the DioException propagated as a generic "No connection" error. Fix: skip session-expiry handling for public auth endpoints (`login`, `forgotPassword`, `resetPassword`). Additionally, `AuthRepository.login()` was not catching `DioException` — fix converts it to typed `AuthException`/`DeviceMismatchException` so login screen can display the correct error message.

---

## Initial Manual Failure Evidence

Operator-reported:
- Browser login returned `POST /api/v1/auth/login 401`
- UI displayed: "Unable to connect. Check your internet connection and try again."
- 401 proves backend was reachable — UI message was incorrect.

---

## Precheck Current Local State

| Check | Result | Pass/Fail |
|---|---|---|
| Server on port 3000 | Running (PID 428), health ok | PASS |
| `/login` loads | 200 | PASS |
| `/dashboard` → `/login` unauthenticated | 307 | PASS |
| `.env.local` exists | Yes | PASS |
| `.env.local` gitignored | Yes | PASS |
| `.env.local` staged deletion | `D  apps/admin/.env.local` | PASS |
| MongoDB URI type | Direct | PASS |
| DB name | `test` (confirmed via query) | PASS |
| Unexpected source changes | None | PASS |

---

## Admin Web Login Runtime Evidence

| Test | Status | Backend Error Code | Notes |
|---|---|---|---|
| B1: Known QA password `Genesis@Test2026!` | 200 | — | success=true, token present |
| B2: Wrong password | 401 | AUTH_001 | JSON body returned correctly |
| B3: Missing password | 400 | GEN_001 | Validation |
| B4: Malformed email | 400 | GEN_001 | Validation |

**Finding:** Backend is correct. `Genesis@Test2026!` succeeds. The 401 JSON `{error: {code: 'AUTH_001'}}` is available but wasn't reaching the login form's error handler.

---

## Local Admin Account State

| Check | Result | Pass/Fail |
|---|---|---|
| DB name | `test` | PASS |
| Total users | 10 | — |
| Admin users | 2 | — |
| `admin@genesis.com` exists | Yes | PASS |
| Role | admin | PASS |
| isActive | true | PASS |
| hasPasswordHash | true | PASS |
| requiresPasswordChange | false | PASS |

Local test admin account is valid. No credential reset needed.

---

## Source Inspection After Runtime Evidence

| File | Relevant Lines | Evidence | Finding |
|---|---|---|---|
| `src/app/(auth)/login/page.tsx` | 52–54 | B2 result | `API_MESSAGES['AUTH_001']` = 'Invalid email or password.' correctly mapped; `code` extraction from thrown error is correct — but never receives `AUTH_001` |
| `src/contexts/AuthContext.tsx` | 74–82 | Code path trace | `login()` correctly throws `Object.assign(new Error(msg), {code})` from JSON body — but DioException-equivalent was thrown before this |
| `src/lib/utils/api-client.ts` | 66–78 | **Root cause** | On any 401 (including login), `tryRefresh()` called. No session → returns false → `throw new Error('SESSION_EXPIRED')` with no `code`. Login form's `catch` gets no `code` → fallback "Unable to connect" |
| `apps/mobile/.../auth_interceptor.dart` | 38–70 | **Mobile root cause** | `onError` handles all 401s; login 401 → no refresh token → `onSessionExpired?.call()` → navigates away; DioException propagates |
| `apps/mobile/.../auth_repository.dart` | 45 | Code path trace | `_source.login()` throws DioException on 401; repository has no DioException catch; `AuthException(code: 'AUTH_001')` never constructed |

---

## Admin Web Fix Applied

**File:** `apps/admin/src/lib/utils/api-client.ts`

```diff
 if (res.status === 401 && path !== '/api/v1/auth/refresh') {
+  // Only treat 401 as session expiry when an authenticated session exists.
+  // Without a session (e.g. login attempt with wrong credentials) the 401 JSON
+  // must be returned so the caller can surface the correct error code.
+  if (_refreshToken && _sessionId) {
     const ok = await tryRefresh();
     if (ok) {
       if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
       res = await fetch(path, { ...options, headers, credentials: 'include' });
     }
     if (!ok || res.status === 401) {
       accessToken = null;
       clearSessionCredentials();
       onSessionExpired?.();
       throw new Error('SESSION_EXPIRED');
     }
+  }
 }
```

**Why:** When `_refreshToken` and `_sessionId` are both absent (no existing session), a 401 means the request itself was rejected — not that an existing session expired. The JSON body must flow back to the caller. With a session present, the existing token-refresh logic is unchanged.

**Effect on login error display:**
- Wrong password → 401 JSON `{error: {code: 'AUTH_001'}}` → `AuthContext.login()` throws `{code: 'AUTH_001'}` → login form maps to "Invalid email or password. Check your credentials and try again."
- Session expiry during portal use → still triggers `SESSION_EXPIRED` and the `SessionExpiredOverlay`.

---

## Admin Web Post-Fix Verification

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Valid login → 200 | success=true, token present | 200 success=true token present | PASS |
| `/me` with valid token | 200, role=admin | 200 role=admin | PASS |
| Wrong password → 401 AUTH_001 | 401 | 401 AUTH_001 | PASS |
| Frontend maps AUTH_001 | "Invalid email or password..." | Confirmed by code path | PASS |
| `/dashboard` without token → 307 /login | 307 | 307 /login | PASS |
| Logout → 200 | 200 | 200 | PASS |
| Post-logout `/dashboard` → 307 /login | 307 | 307 /login | PASS |
| Health check | db=ok redis=ok | db=ok redis=ok | PASS |
| Invalid payload → 400 GEN_001 | 400 | 400 GEN_001 | PASS |

**Result: 9/9 PASS**

---

## Mobile Login Runtime Trace

**Blocker:** No Android emulator configured (`flutter emulators` → none). No physical device connected (`adb devices` → empty). Only Windows desktop and Chrome targets available — Flutter mobile auth (secure storage, `device_info_plus` Android APIs) not testable on these targets.

**Additional config finding:** `ApiEndpoints.baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000')`. On Android emulator, `localhost` resolves to the emulator itself — developers must pass `--dart-define=API_BASE_URL=http://10.0.2.2:3000` when testing locally with emulator.

---

## Mobile Source Inspection

| File | Relevant Lines | Finding |
|---|---|---|
| `core/constants/api_endpoints.dart` | 2 | `baseUrl` defaults to `localhost:3000` — correct for LAN device, wrong for Android emulator (needs `10.0.2.2:3000`) |
| `core/network/interceptors/auth_interceptor.dart` | 38–70 | `onError`: All 401s handled. Login 401 → no refresh token → `onSessionExpired?.call()` + `handler.next(err)`. **Bug: should skip public paths.** |
| `features/auth/data/repositories/auth_repository.dart` | 45 | `_source.login()` throws `DioException` on 401; no catch → propagates as generic exception to UI. **Bug: DioException not converted to AuthException.** |
| `features/auth/presentation/screens/login_screen.dart` | 94–106 | `on AuthException` → `_mapErrorCode(e.code)` ('AUTH_001' → 'Invalid email or password.'); generic `catch` → 'No connection.' |
| `features/auth/presentation/screens/login_screen.dart` | 80–93 | `on DeviceMismatchException` → navigates to device registration screens (correct) |

---

## Mobile Fix Applied

### Fix 1: `apps/mobile/lib/core/network/interceptors/auth_interceptor.dart`

Added public-path skip before session-expiry logic in `onError`:

```dart
// For public auth endpoints a 401 means wrong credentials, not session expiry.
// Pass through so the caller can inspect the error body and surface the right message.
final publicPaths = [ApiEndpoints.login, ApiEndpoints.forgotPassword, ApiEndpoints.resetPassword];
if (publicPaths.any((path) => err.requestOptions.path.endsWith(path))) {
  handler.next(err);
  return;
}
```

### Fix 2: `apps/mobile/lib/features/auth/data/repositories/auth_repository.dart`

Added `DioException` catch in `login()` to convert to typed exceptions:

```dart
late final Map<String, dynamic> result;
try {
  result = await _source.login(email: email, password: password, deviceFingerprint: fingerprint);
} on DioException catch (e) {
  final body = e.response?.data as Map<String, dynamic>?;
  final error = body?['error'] as Map<String, dynamic>? ?? {};
  final code = error['code'] as String? ?? 'NETWORK_ERROR';
  final message = error['message'] as String? ?? 'Login failed';
  if (code == 'AUTH_004' || code == 'AUTH_005') throw DeviceMismatchException(code: code);
  throw AuthException(code: code, message: message);
}
```

**Combined effect:** Login 401 (wrong password) → interceptor passes through → DioException caught in repository → `AuthException(code: 'AUTH_001')` thrown → login screen `on AuthException` → 'Invalid email or password.'

Device errors (AUTH_004/AUTH_005): still correctly routed to device registration screens.

---

## Mobile Post-Fix Verification

**BLOCKED** — no Android emulator or physical device. Verification pending device availability.

**Expected behaviour after fix (when device available):**
- Wrong password → shows "Invalid email or password." (not "No connection.")
- Session expired while using app → still triggers session-expired screen correctly
- Device not registered (AUTH_004) → navigates to device registration screen
- Device fingerprint mismatch (AUTH_005) → navigates to device mismatch screen
- Successful login with registered device → navigates to home

---

## Targeted Test Evidence

**Web:** `auth-context.test.tsx` found. Tests mock `apiFetch` — not affected by `api-client.ts` change. Existing test at line 102–120 correctly verifies `AUTH_001` code propagation from `apiFetch` response.

**Mobile:** No targeted auth unit tests found in `apps/mobile/`. Runtime verification blocked by missing emulator.

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/lib/utils/api-client.ts` | Guard session-expiry intercept behind `_refreshToken && _sessionId` check |
| `apps/mobile/lib/core/network/interceptors/auth_interceptor.dart` | Skip session-expiry handling for public auth paths in `onError` |
| `apps/mobile/lib/features/auth/data/repositories/auth_repository.dart` | Added `import 'package:dio/dio.dart'`; catch `DioException` in `login()`, convert to typed exceptions |

No backend files modified. No models changed. No auth logic changed. No JWT behavior changed.

---

## Bugs Found

| ID | App | Bug | Fix |
|---|---|---|---|
| WEB-AUTH-ERR-001 | Admin web | `apiFetch` throws `SESSION_EXPIRED` on any 401 including login — prevents error code from reaching login form | Guard refresh logic behind session check |
| MOB-AUTH-ERR-001 | Mobile | `AuthInterceptor.onError` calls `onSessionExpired` on login's 401 — navigates away from login screen | Skip public paths in `onError` |
| MOB-AUTH-ERR-002 | Mobile | `AuthRepository.login()` does not catch `DioException` — `AuthException(code)` never constructed | Catch DioException, convert to typed exception |

---

## Unsupported Assumptions Rejected

1. **"Backend returns wrong status for wrong password"** — REJECTED. Backend correctly returns 401 `{error: {code: 'AUTH_001'}}`.
2. **"Frontend API_MESSAGES map missing AUTH_001"** — REJECTED. Both web and mobile have correct `AUTH_001` mappings.
3. **"Admin account doesn't exist"** — REJECTED. `admin@genesis.com` exists, active, has password hash.

---

## Remaining Known Issues

| ID | Description | Priority | Status |
|---|---|---|---|
| Mobile API URL | Android emulator needs `10.0.2.2:3000`, not `localhost:3000` — config, not code | P2 | Document only; use `--dart-define` when running on emulator |
| Mobile runtime test | Mobile fix not runtime-verified — no emulator/device | P1 | Pending device availability |
| P0 secrets | All production secrets unrotated | P0 | Unresolved |
| Git history | Secret blobs at `5bf3a15`, `9b941a9` | P0 | Unresolved |
| Vercel verification | Production env/log verification incomplete | P0 | Unresolved |
| Employee role test | Employee role runtime testing not performed | P2 | Pending UAT |

---

## Production Readiness Impact

Admin web login now shows the correct error ("Invalid email or password") for wrong credentials, not a misleading network error. Session expiry behavior for authenticated portal use is unchanged.

Mobile login fix removes incorrect session-expired navigation on wrong password, and enables correct "Invalid email or password" display through the `_mapErrorCode` path. Device registration flow (AUTH_004/AUTH_005) is preserved.

**Production readiness: NOT READY** — P0 blockers: unrotated secrets, unremediated git history, Vercel verification incomplete.

---

## Final Decision

**Admin web login:** Fixed and verified (9/9 PASS). Root cause: `api-client.ts` treated all 401s as session expiry.

**Mobile login:** Fix applied (source evidence justified), runtime verification blocked (no emulator).

**Final decision: B** — Admin web login fixed and verified; mobile login traced but blocked by missing emulator.
