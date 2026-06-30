# Phase 15.20 — Mobile Employee Login Runtime Verification

**Date:** 2026-06-29  
**Phase:** 15.20  
**Status:** ROOT CAUSE PROVEN — Two blockers identified

---

## Verified Employee Record

| Field | Value |
|-------|-------|
| `_id` | `6a42b0a39e30161cd4e638f1` |
| `email` | `worksbysarvesh@gmail.com` |
| `firstName` | Sarvesh |
| `lastName` | Sawant |
| `role` | `employee` |
| `isActive` | `true` |
| `requiresPasswordChange` | `false` |
| `registeredDevice` | **`null`** |
| `employeeId` | EMP3527 |
| `department` | Developer |
| `designation` | Software Developer |
| `createdAt` | 2026-06-29T17:51:31.529Z |

---

## Blocker 1 — Malformed Email in Credentials

**Provided email:** `worksbysarvesh.com`  
**Actual email:** `worksbysarvesh@gmail.com`

The `@gmail` segment was cut from the prompt. `worksbysarvesh.com` fails Zod `z.string().email()` at the schema layer before any DB lookup or authentication.

```
POST /api/v1/auth/login
Body: {"email":"worksbysarvesh.com","password":"Sarvesh@031203"}

HTTP 400
{"success":false,"error":{"code":"GEN_001","message":"Validation failed."}}
```

**Mobile behaviour:** `LoginScreen._validateEmail()` also rejects this — `!v.contains('@')` returns `'Enter a valid email'` before the API call is even made. The mobile user would see "Enter a valid email" in red on the form field. No HTTP request is sent.

---

## Blocker 2 — Device Not Registered (AUTH_004)

With the correct email:

```
POST /api/v1/auth/login
Body: {"email":"worksbysarvesh@gmail.com","password":"Sarvesh@031203"}

HTTP 401
{"success":false,"error":{"code":"AUTH_004","message":"AUTH_004"}}
```

```
POST /api/v1/auth/login
Body: {"email":"worksbysarvesh@gmail.com","password":"Sarvesh@031203",
       "deviceFingerprint":"aaaa...64-chars"}

HTTP 401
{"success":false,"error":{"code":"AUTH_004","message":"AUTH_004"}}
```

Both return `AUTH_004` regardless of whether a fingerprint is supplied. `AuthService.login()` checks `user.registeredDevice` before checking the fingerprint hash:

```typescript
// AuthService.ts
if (user.role !== 'admin') {
  if (!user.registeredDevice) throw new AppError('AUTH_004', 401);  // ← throws here
  if (!deviceFingerprint) throw new AppError('AUTH_005', 401);
  // ...fingerprint comparison never reached
}
```

`registeredDevice` is `null` in MongoDB. The check fails unconditionally.

---

## Backend Fully Functional (After Device Registration)

Runtime verification with a test fingerprint registered via admin API:

```bash
PATCH /api/v1/employees/6a42b0a39e30161cd4e638f1/register-device
Authorization: Bearer <admin-token>
Body: {"deviceFingerprint":"b1c2d3...64-chars","deviceName":"Sarvesh Pixel 7","platform":"android"}

HTTP 200
{"success":true,"data":{"message":"Device registered. Employee can now log in."}}
```

Immediate login with that fingerprint:

```bash
POST /api/v1/auth/login
Body: {"email":"worksbysarvesh@gmail.com","password":"Sarvesh@031203",
       "deviceFingerprint":"b1c2d3...64-chars"}

HTTP 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "53cd3e7f59af7d42...",
    "sessionId": "6a42b3c99e30161cd4e63944",
    "employee": {
      "id": "6a42b0a39e30161cd4e638f1",
      "employeeId": "EMP3527",
      "email": "worksbysarvesh@gmail.com",
      "firstName": "Sarvesh",
      "lastName": "Sawant",
      "role": "employee",
      "requiresPasswordChange": false
    }
  }
}
```

**JWT claims verified:**
```json
{"userId":"6a42b0a39e30161cd4e638f1","role":"employee","requiresPasswordChange":false,"iat":1782756297,"exp":1782757197}
```

**`/me` endpoint verified (HTTP 200):**
```json
{
  "id": "6a42b0a39e30161cd4e638f1",
  "email": "worksbysarvesh@gmail.com",
  "role": "employee",
  "isActive": true,
  "hasRegisteredDevice": true,
  "requiresPasswordChange": false,
  "department": "Developer",
  "designation": "Software Developer"
}
```

**Test fingerprint was reverted to `null` after verification.** DB state at end of verification: `registeredDevice: null`.

---

## Complete Runtime Flow Trace

```
[Mobile] User enters email="worksbysarvesh@gmail.com" password="Sarvesh@031203"
[Mobile] LoginScreen._validateEmail() → passes (contains @)
[Mobile] LoginScreen._validatePassword() → passes (not empty)
[Mobile] _loading = true
[Mobile] AuthNotifier.login() called
[Mobile] AuthRepository.login() called
[Mobile] getOrCreateDeviceFingerprint()
         → reads/generates SHA-256(deviceId|model|brand|serialNumber)
         → writes to SecureStorage[deviceHash]
[Mobile] AuthRemoteSource.login() called
         → POST /api/v1/auth/login
         → body: {email, password, deviceFingerprint: <real-device-fp>}

[Backend] POST /api/v1/auth/login
[Backend] authLimiter.limit(ip) → OK
[Backend] LoginSchema.parse(body) → OK
[Backend] User.findOne({email}).select('+passwordHash') → found
[Backend] user.isActive → true → OK
[Backend] bcrypt.compare(password, passwordHash) → match → OK
[Backend] user.role !== 'admin' → true (employee)
[Backend] !user.registeredDevice → TRUE (null) → throw AUTH_004

[Mobile] DioException 401 received
[Mobile] LoggingInterceptor.onError fires:
         [DIAG][ERR] type=badResponse status=401 body={code:AUTH_004}
[Mobile] AuthInterceptor.onError: status=401 but path=login → skip refresh
         → handler.next(err)
[Mobile] AuthRemoteSource.login() rethrows DioException
[Mobile] AuthRepository.login():
         result['success'] != true → true
         error.code = 'AUTH_004'
         code == 'AUTH_004' → throw DeviceMismatchException(code: 'AUTH_004')
[Mobile] AuthNotifier.login() catches, rethrows
[Mobile] LoginScreen._submit() catches DeviceMismatchException:
         e.code == 'AUTH_004' → context.go(RouteNames.deviceNotRegistered)
[Mobile] Navigation: /login → /device-not-registered ← USER SEES THIS

[Mobile] DeviceNotRegisteredScreen.initState()
         → SecureStorageService.read(StorageKeys.deviceHash)
         → displays first 16 chars of fingerprint + "Copy Code" button
         → instructions: "Share this code with your administrator"
```

**The mobile app navigates to `/device-not-registered` — this is correct, expected behaviour. Navigation executes. The employee CAN see their device fingerprint on screen. The authentication flow itself is not broken.**

---

## Blocker 3 — Admin Portal Has No Device Registration UI

The `PATCH /api/v1/employees/[id]/register-device` API endpoint exists and works. **The admin portal has no UI to call it.**

`apps/admin/src/app/(portal)/employees/[id]/page.tsx` — 112 lines, renders employee detail rows (name, email, department, status). Zero mentions of `device`, `register`, or `fingerprint`. No button, form, or modal for device registration.

The admin cannot register an employee's device through the portal. They would need to call the API directly (Postman, curl, etc.).

**This is a missing feature, not a bug in existing code.**

---

## Summary

| Question | Answer |
|----------|--------|
| 1. Does backend authenticate this employee? | **YES** — with correct email and registered fingerprint |
| 2. HTTP status returned | **401** with `AUTH_004` (device not registered) |
| 3. Response body | `{"success":false,"error":{"code":"AUTH_004","message":"AUTH_004"}}` |
| 4. Backend generates tokens? | **YES** — proven at HTTP 200 when device registered |
| 5. Mobile receives response? | **YES** — Dio receives 401 |
| 6. Tokens written to secure storage? | **NO** — login never succeeds, no tokens to store |
| 7. AuthNotifier emits Authenticated? | **NO** — exception is rethrown before state update |
| 8. Navigation executes? | **YES** — navigates to `/device-not-registered` |
| 9. Where execution stops | `AuthService.ts:128` — `if (!user.registeredDevice) throw new AppError('AUTH_004', 401)` |
| 10. Role-based routing blocks employee? | **NO** — role=employee is correct for mobile |
| 11. Correct role for mobile login? | **YES** — `employee` role |
| 12. `requiresPasswordChange`, `isActive`? | Both fine — `false` and `true` respectively |
| 13. API_BASE_URL matches backend? | **YES** — `http://localhost:3000` (localhost on emulator works; physical device needs host IP) |

---

## Root Causes

### Root Cause A — Malformed email in credentials
**File:** User-provided credential  
**Detail:** `worksbysarvesh.com` → `worksbysarvesh@gmail.com` (`@gmail` was cut from prompt)  
**Impact:** GEN_001 400 on any login attempt. Mobile shows "Enter a valid email" inline.

### Root Cause B — Device not registered
**File:** `apps/admin/src/services/AuthService.ts:128`  
```typescript
if (!user.registeredDevice) throw new AppError('AUTH_004', 401);
```
**Detail:** `registeredDevice: null` in User document. No device has ever been registered for this employee's account.  
**Impact:** All login attempts return AUTH_004 regardless of password or fingerprint. Mobile shows `DeviceNotRegisteredScreen`.

### Root Cause C — No admin portal UI for device registration
**File:** `apps/admin/src/app/(portal)/employees/[id]/page.tsx`  
**Detail:** Employee detail page has Edit and Deactivate/Activate only. No "Register Device" section. `PATCH /api/v1/employees/[id]/register-device` exists in backend but is unreachable from portal.  
**Impact:** Admin cannot complete the device registration workflow without direct API access.

---

## Operational Fix (No Code Change Required for A and B)

**Step 1 — Employee:** Open app → try to log in → `DeviceNotRegisteredScreen` appears → tap "Copy Code" → sends 64-char fingerprint to admin.

**Step 2 — Admin:** Call API with admin credentials:
```bash
PATCH /api/v1/employees/6a42b0a39e30161cd4e638f1/register-device
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "deviceFingerprint": "<64-char-hex-from-employee>",
  "deviceName": "Sarvesh Pixel 7",
  "platform": "android"
}
```

**Step 3 — Employee:** Tap "Try Again" on `DeviceNotRegisteredScreen` → login succeeds → home screen.

---

## Code Fix Required (Root Cause C)

Admin portal employee detail page needs a "Register Device" section with:
- Input field for 64-char device fingerprint
- Device name field
- Platform selector (android / ios)
- Submit button → `PATCH /api/v1/employees/[id]/register-device`
- Show current registration status (`hasRegisteredDevice: false/true`)

**Regression risk:** Zero — new UI section only, no existing code changed.

---

## Verified Not Blockers

| Factor | Status |
|--------|--------|
| Password correct | ✓ `bcrypt.compare()` passes when tested end-to-end |
| Account active | ✓ `isActive: true` |
| Password change required | ✓ `requiresPasswordChange: false` |
| Role correct for mobile | ✓ `employee` |
| JWT generation | ✓ HS256, 15-min expiry |
| Refresh token generation | ✓ 32-byte random hex |
| `/me` endpoint | ✓ HTTP 200, full profile |
| NEXT_PUBLIC_APP_URL | ✓ `http://localhost:3000` (not placeholder) |
| Backend responsive | ✓ Admin login works, all other endpoints functional |
| Mobile navigation | ✓ GoRouter routes `/device-not-registered` correctly |
| Secure storage write | ✓ Would succeed if login returned 200 |
| `AuthNotifier` state | ✓ Would emit `isAuthenticated=true` on success |
