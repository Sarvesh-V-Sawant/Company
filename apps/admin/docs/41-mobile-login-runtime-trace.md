# Phase 15.18 — Mobile Login Runtime Instrumentation

**Date:** 2026-06-29  
**Phase:** 15.18  
**Status:** INSTRUMENTED — awaiting runtime test output

---

## Files Instrumented

| File | What was added |
|------|---------------|
| `lib/main.dart` | `runZonedGuarded` wrapper; `FlutterError.onError`; `PlatformDispatcher.instance.onError`; boot-time print of `API_BASE_URL` and `ENVIRONMENT` compile-time constants |
| `lib/core/network/api_client.dart` | Print `baseUrl` and timeouts at `createDioClient()` call site |
| `lib/core/network/interceptors/logging_interceptor.dart` | Full `onResponse` + `onError` handlers; removed `assert()` wrapper; prints base URL, path, header key list (no values), masked payload, status, response body, exception type, message, error object, stack trace |
| `lib/features/auth/data/sources/auth_remote_source.dart` | Print entry (email prefix, fingerprint prefix, resolved full URL); response status; caught exception with stack |
| `lib/features/auth/data/repositories/auth_repository.dart` | Print at each stage: entry, fingerprint obtained, before/after `_source.login()`, error code on failure, success fields, before/after `SecureStorageService.saveTokens()`, user id |
| `lib/features/auth/presentation/providers/auth_provider.dart` | Print entry, state transition, `_repo.login()` return, caught exception with stack |
| `lib/features/auth/presentation/screens/login_screen.dart` | Print button press, validation result, loading state set, call/return of `authProvider.login()`, each catch branch with type and stack, navigation target, finally block |

---

## Log Prefixes

All diagnostic lines use distinct prefixes for easy `grep` filtering:

| Prefix | Layer |
|--------|-------|
| `[DIAG][BOOT]` | `main()` startup — compile-time env vars |
| `[DIAG][ZONE]` | `runZonedGuarded` uncaught errors |
| `[DIAG][FLUTTER_ERROR]` | `FlutterError.onError` framework errors |
| `[DIAG][PLATFORM_ERROR]` | `PlatformDispatcher.instance.onError` |
| `[DIAG][DIO]` | `createDioClient()` — base URL + timeouts |
| `[DIAG][REQ]` | Dio request interceptor — full request details |
| `[DIAG][RES]` | Dio response interceptor — status + body |
| `[DIAG][ERR]` | Dio error interceptor — type + message + body + stack |
| `[DIAG][SRC]` | `AuthRemoteSource.login()` |
| `[DIAG][REPO]` | `AuthRepository.login()` |
| `[DIAG][NOTIF]` | `AuthNotifier.login()` |
| `[DIAG][UI]` | `LoginScreen._submit()` |
| `[DIAG][NAV]` | Navigation events |

---

## Expected Log Sequence (Happy Path)

```
[DIAG][BOOT] API_BASE_URL env = <not-set>          ← compile-time value
[DIAG][BOOT] ENVIRONMENT    = <not-set>
[DIAG][DIO]  createDioClient() baseUrl = http://localhost:3000
[DIAG][DIO]  connectTimeout = 15000ms  receiveTimeout = 15000ms
...
[DIAG][UI]   Sign In button pressed
[DIAG][UI]   Validation passed. Setting _loading=true
[DIAG][UI]   Calling authProvider.notifier.login()
[DIAG][NOTIF] login() called  state.isLoading=false
[DIAG][NOTIF] state → isLoading=true, calling _repo.login()
[DIAG][REPO]  login() entry
[DIAG][REPO]  fingerprint obtained: abcd1234... (64 chars)
[DIAG][REPO]  calling _source.login()
[DIAG][SRC]   login() called  email=user@***  fp=abcd1234...
[DIAG][SRC]   baseUrl resolves to: http://localhost:3000
[DIAG][SRC]   full URL: http://localhost:3000/api/v1/auth/login
[DIAG][REQ]  ▶ POST http://localhost:3000/api/v1/auth/login
[DIAG][REQ]    baseUrl   = http://localhost:3000
[DIAG][REQ]    path      = /api/v1/auth/login
[DIAG][REQ]    headers   = [Content-Type]
[DIAG][REQ]    payload   = {email: user@example.com, password: ***MASKED***, deviceFingerprint: abcd...}
[DIAG][REQ]    connect   = 15000ms  receive = 15000ms
...
[DIAG][RES]  ◀ HTTP 200 /api/v1/auth/login
[DIAG][RES]    body = {success: true, data: {...}}
...
[DIAG][SRC]   login() response status=200
[DIAG][REPO]  _source.login() returned. success=true  keys=[success, data]
[DIAG][REPO]  login success. requiresPasswordChange=false  sessionId=abc12345...
[DIAG][REPO]  writing tokens to SecureStorage
[DIAG][REPO]  tokens saved
[DIAG][REPO]  LoginResult built. user.id=...
[DIAG][NOTIF] _repo.login() success. requiresPasswordChange=false
[DIAG][NOTIF] state → user set, isAuthenticated=true
[DIAG][UI]    authProvider.login() returned. requiresPasswordChange=false
[DIAG][NAV]   navigating to /home
[DIAG][UI]    finally block. mounted=true
```

---

## Expected Log Sequence (localhost on Physical Device)

If `baseUrl = http://localhost:3000` and running on physical Android device:

```
[DIAG][BOOT] API_BASE_URL env = <not-set>
[DIAG][DIO]  createDioClient() baseUrl = http://localhost:3000    ← ROOT CAUSE VISIBLE HERE
...
[DIAG][REQ]  ▶ POST http://localhost:3000/api/v1/auth/login        ← device's own loopback
...
-- 15 second pause (connectTimeout) --
[DIAG][ERR]  ✖ DioExceptionType.connectionTimeout on /api/v1/auth/login
[DIAG][ERR]    message  = ...
[DIAG][ERR]    status   = null
[DIAG][ERR]    body     = null
...
[DIAG][SRC]   login() threw: DioException ...
[DIAG][NOTIF] login() caught: DioException ...
[DIAG][UI]    catch(_) generic exception: DioException ...
[DIAG][UI]    finally block. mounted=true
```

---

## Root Cause (Pre-Verified)

`ApiEndpoints.baseUrl` is defined as:

```dart
static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');
```

**`String.fromEnvironment('API_BASE_URL')` is a compile-time constant.** It reads from `--dart-define=API_BASE_URL=...` passed at `flutter build` or `flutter run` time, NOT from any `.env` file or runtime environment. If the flag is absent, the default `http://localhost:3000` is baked in at compile time.

On a physical Android device, `localhost` (or `127.0.0.1`) resolves to **the device's own loopback**, not the development machine. Port 3000 is not listening on the device, so all HTTP calls fail with connection refused or timeout.

The `LoggingInterceptor` previously only logged `onRequest` inside an `assert()` block — response and error paths were silent. `catch (_)` in `LoginScreen._submit()` swallowed all exceptions and showed "No connection" in the UI without any logcat evidence.

---

## How to Read Logs

Run with physical device connected:

```bash
# Flutter run — no dart-define means localhost:3000 baked in
flutter run

# Correct: pass host machine IP reachable from device (same WiFi)
flutter run --dart-define=API_BASE_URL=http://192.168.1.X:3000

# Filter diagnostic output only
adb logcat | grep DIAG
```

---

## Request Timeline (Instrumented)

```
T+0ms    [UI]   Sign In pressed
T+1ms    [UI]   _loading = true
T+2ms    [NOTIF] state isLoading = true
T+3ms    [REPO]  fingerprint read/generated
T+5ms    [SRC]   Dio POST dispatched
T+5ms    [REQ]   onRequest interceptor fires
T+5ms    [AUTH]  auth interceptor: login path skipped (no token needed)
T+?      ← response arrives OR timeout after 15000ms
         [RES]  or [ERR] fires
T+?      [SRC]   returns / throws
T+?      [REPO]  returns / throws
T+?      [NOTIF] returns / rethrows
T+?      [UI]    catch block or result handling
T+?      [NAV]   or error message set
T+?      [UI]    finally: _loading = false
```

---

## Exception Timeline

If `DioException` is thrown:

```
[DIAG][ERR]   type    = DioExceptionType.connectionTimeout | connectionError | badResponse | unknown
[DIAG][ERR]   message = ...
[DIAG][ERR]   status  = null (timeout) | 400/401/etc (server error)
[DIAG][ERR]   body    = null (timeout) | {error: {code: ..., message: ...}} (server error)
[DIAG][ERR]   error   = SocketException(...) or null
[DIAG][ERR]   stack   = full Dart stack
[DIAG][SRC]   threw: DioException
[DIAG][SRC]   stack: (repeated)
[DIAG][NOTIF] caught: DioException
[DIAG][UI]    catch(_) generic exception: DioException
```

---

## Navigation Timeline

Success path:
```
[DIAG][NAV] navigating to /home         (requiresPasswordChange=false)
[DIAG][NAV] navigating to /change-password  (requiresPasswordChange=true)
```

Device error path:
```
[DIAG][UI] DeviceMismatchException: code=AUTH_004
[DIAG][NAV] navigating to /device-not-registered

[DIAG][UI] DeviceMismatchException: code=AUTH_005
[DIAG][NAV] navigating to /device-mismatch
```

---

## Root Cause (If Confirmed by Runtime Logs)

| Evidence | Conclusion |
|----------|-----------|
| `[DIAG][BOOT] API_BASE_URL env = <not-set>` | Build flag not passed → localhost baked in |
| `[DIAG][DIO] baseUrl = http://localhost:3000` | Physical device points to its own loopback |
| `[DIAG][ERR] type = connectionTimeout` | No server at localhost:3000 on device |
| Fix | `flutter run --dart-define=API_BASE_URL=http://<host-ip>:3000` |

---

## Remaining Issues (from Prior Phase)

- Mobile copy "Link expires in 1 hour" vs 15-min actual backend (`forgot_password_screen.dart`)

---

**Awaiting runtime test.** Run the app on physical device and paste logcat output.
