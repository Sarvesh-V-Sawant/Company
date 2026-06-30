# Phase 15.17 — Employee Onboarding & Authentication Flow Verification

**Date:** 2026-06-28  
**Method:** Runtime verification → source code inspection → defect identification  
**Status:** INCOMPLETE — 1 P0 blocker, 2 P1 defects, 2 P2 defects

---

## 1. Runtime Evidence

All tests run against `http://localhost:3000` using Node.js native `fetch`.

| Test | Method | URL | Status | Result |
|------|--------|-----|--------|--------|
| Admin login | POST | `/api/v1/auth/login` | 200 | ✓ Token obtained |
| Create employee (employee role) | POST | `/api/v1/employees` | 201 | ✓ `temporaryPassword` in response |
| Duplicate employee | POST | `/api/v1/employees` | 409 | ✓ GEN_006 |
| Get employee by id | GET | `/api/v1/employees/{id}` | 200 | ✓ `requiresPasswordChange: true` |
| Employee login — no device | POST | `/api/v1/auth/login` | 401 | ✓ AUTH_004 expected |
| Login with employeeId (not email) | POST | `/api/v1/auth/login` | 400 | ✓ GEN_001 — not email format |
| Register device (admin) | PATCH | `/api/v1/employees/{id}/register-device` | 200 | ✓ Device registered |
| Employee login — with device | POST | `/api/v1/auth/login` | 200 | ✓ JWT issued |
| Admin-role login — no device | POST | `/api/v1/auth/login` | 200 | ✓ Device bypass confirmed |
| Change password | PATCH | `/api/v1/auth/me/change-password` | 200 | ✓ `requiresPasswordChange: false` |
| Old refresh token after change | POST | `/api/v1/auth/refresh` | 401 | ✓ AUTH_003 — session revoked |
| Forgot password (correct URL) | POST | `/api/v1/auth/password-reset/request` | 200 | ✓ Always 200 |
| Forgot password (non-existent email) | POST | `/api/v1/auth/password-reset/request` | 200 | ✓ Same response — enumeration prevented |
| Token refresh (new session) | POST | `/api/v1/auth/refresh` | 200 | ✓ New access token |
| GET /me | GET | `/api/v1/auth/me` | 200 | ✓ Full profile |

---

## 2. Employee Creation Flow

**Source:** `EmployeeService.create()` — `apps/admin/src/services/EmployeeService.ts:162`

### Steps (proven at runtime)

```
POST /api/v1/employees
  │
  ├─ 1. Validate: CreateEmployeeSchema (Zod)
  ├─ 2. Fetch CompanySettings → leaveYearStartMonth
  ├─ 3. Compute pro-rated leaveBalances from dateOfJoining
  ├─ 4. Generate 12-char temp password (randomBytes, no confusable chars)
  ├─ 5. bcrypt.hash(tempPassword, cost=12)
  ├─ 6. User.create({
  │       employeeId, firstName, lastName, email, passwordHash,
  │       role, phone, department, designation,
  │       monthlySalary, dateOfJoining,
  │       isActive: true,
  │       requiresPasswordChange: true,  ← always true
  │       registeredDevice: null,        ← always null on creation
  │       leaveBalances,
  │       createdBy: <adminId>
  │     })
  ├─ 7. Employee.create({
  │       _id: user._id,                 ← same ObjectId as User
  │       userId: user._id,
  │       employeeCode, firstName, lastName,
  │       department, designation,
  │       joiningDate, monthlySalary,
  │       status: 'active'
  │     })
  ├─ 8. AuditLog.create({ action: 'EMPLOYEE_CREATED' })
  └─ 9. Return: { id, employeeId, email, temporaryPassword }
```

### Rollback on failure

If `Employee.create` throws (e.g. duplicate `employeeCode`):
```
await User.deleteOne({ _id: user._id });
```

Manual rollback — NOT a MongoDB transaction. If `deleteOne` itself fails, User record orphans. Acceptable risk for development; should use `mongoose.startSession().withTransaction()` in production.

### API response (runtime confirmed)

```json
{
  "success": true,
  "data": {
    "id": "6a4130deabc350dc4e607e61",
    "employeeId": "TEST001",
    "email": "onboard.verify@testhrms.local",
    "temporaryPassword": "CF3MQq6dg9mS"
  }
}
```

---

## 3. User Creation Flow

**Two separate collections — confirmed at runtime:**

| Collection | Purpose | `_id` |
|------------|---------|-------|
| `users` | Auth record — login, JWT, device, password | Same ObjectId |
| `employees` | Payroll profile — salary, payslips, attendance FKs | Same ObjectId |

`User._id === Employee._id === Employee.userId` — consistent FK across all APIs.

### User document (post-creation)

```json
{
  "_id": ObjectId("6a4130deabc350dc4e607e61"),
  "employeeId": "TEST001",
  "firstName": "Onboard",
  "lastName": "Verify",
  "email": "onboard.verify@testhrms.local",
  "passwordHash": "<bcrypt, cost 12>",
  "role": "employee",
  "phone": "+919876500001",
  "department": "QA",
  "designation": "Test Analyst",
  "monthlySalary": 40000,
  "dateOfJoining": ISODate("2024-01-15T00:00:00Z"),
  "isActive": true,
  "requiresPasswordChange": true,
  "registeredDevice": null,
  "leaveBalances": {
    "paidLeave": { "currentYear": 12, "carriedForward": 0 },
    "sickLeave": { "currentYear": 8, "carriedForward": 0 },
    "casualLeave": { "currentYear": 6, "carriedForward": 0 }
  },
  "createdBy": ObjectId("<admin_id>"),
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

### Employee document (payroll profile)

```json
{
  "_id": ObjectId("6a4130deabc350dc4e607e61"),
  "userId": ObjectId("6a4130deabc350dc4e607e61"),
  "employeeCode": "TEST001",
  "firstName": "Onboard",
  "lastName": "Verify",
  "department": "QA",
  "designation": "Test Analyst",
  "joiningDate": ISODate("2024-01-15T00:00:00Z"),
  "monthlySalary": 40000,
  "status": "active",
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

---

## 4. Database Verification

### Duplicate prevention

**Email unique index:** `UserSchema` — `email: { unique: true }`  
**EmployeeId unique index:** `UserSchema` — `employeeId: { unique: true }`  
**EmployeeCode unique index:** `EmployeeSchema` — `employeeCode: { unique: true }`

**Runtime confirmed:** Duplicate attempt → HTTP 409, `{ code: "GEN_006", message: "email or employeeId already exists." }`

---

## 5. Authentication Flow

### Login identifier: EMAIL ONLY

**Source:** `AuthService.login()` — `AuthService.ts:69`
```typescript
const user = await User.findOne({ email });
```

**Source:** `LoginSchema` — `validators/auth.ts:3`
```typescript
email: z.string().email().max(255),
```

**Runtime confirmed:**  
- Login with `email: "TEST001"` (employeeId, not email format) → HTTP 400 GEN_001 (Zod validation failure)  
- Login with `email: "onboard.verify@testhrms.local"` → proceeds to auth

**No username field. No mobile number login. No employeeId login. Email is the only identifier.**

### Device fingerprint — two-tier auth

**Admin-role (web portal):** No device check.  
```typescript
if (user.role !== 'admin') {
  if (!user.registeredDevice) throw new AppError('AUTH_004', 401);
  if (!deviceFingerprint) throw new AppError('AUTH_005', 401);
  if (fingerprintHash !== user.registeredDevice.fingerprintHash) throw new AppError('AUTH_005', 401);
}
```

**Employee-role (mobile app):** MUST have registered device + matching fingerprint.  
Without device: `AUTH_004` — confirmed runtime.  
With device + correct fingerprint: 200 — confirmed runtime.

### JWT payload (runtime decoded)

```json
{
  "userId": "6a4130deabc350dc4e607e61",
  "role": "employee",
  "requiresPasswordChange": true,
  "iat": 1782657250,
  "exp": 1782658150
}
```

Access token TTL: **15 minutes** (`exp - iat = 900s`).

---

## 6. First Login Flow

### Employee-role login

```
New employee account created
  │
  ├─ Admin MUST register device first:
  │    PATCH /api/v1/employees/{id}/register-device
  │    { deviceFingerprint: "<64-char hex>", deviceName: "...", platform: "android"|"ios" }
  │
  └─ Employee logs in:
       POST /api/v1/auth/login
       { email, password: temporaryPassword, deviceFingerprint: "<same 64-char hex>" }
       → 200
       → { accessToken, refreshToken, sessionId, employee: { requiresPasswordChange: true } }
```

**`requiresPasswordChange: true` in JWT and response.** The mobile app is expected to enforce password change. No server-side enforcement exists.

### Admin-role login

```
POST /api/v1/auth/login
{ email, password: temporaryPassword }      ← no deviceFingerprint needed
→ 200
→ { accessToken, ..., employee: { requiresPasswordChange: true } }
```

Login page (`login/page.tsx:50`) detects `requiresPasswordChange: true` → redirects to `/change-password`.  
**However, the change-password page calls the wrong API endpoint → P0 blocker. See §13.**

---

## 7. Password Flow

### Temporary password

- **Generation:** `randomBytes(12)` mapped to `TEMP_CHARS` alphabet (no 0/O/1/l/I confusables)
- **Length:** 12 characters (confirmed: `"CF3MQq6dg9mS"`)
- **Storage:** `bcrypt.hash(tempPassword, 12)` in `User.passwordHash`
- **Delivery:** Returned ONCE in API response `data.temporaryPassword`
- **Email:** NOT sent — admin must communicate manually
- **One-shot:** Temp password not invalidated on first login — only cleared when admin or employee explicitly changes it

### Change password

**API:** `PATCH /api/v1/auth/me/change-password`  
**Requires:** current password (prevents unauthorized change even with token)  
**Effect on runtime (confirmed):**
1. `passwordHash` updated in `users` collection
2. `requiresPasswordChange: false` — confirmed: new JWT no longer carries flag
3. ALL active sessions revoked — confirmed: old refresh token → 401 AUTH_003
4. New access token returned immediately (no re-login needed)
5. Old access token remains valid until expiry (15 min) — JWT not blacklisted. Acceptable window.

### Password reset

**API:** `POST /api/v1/auth/password-reset/request`  
**Always returns 200** (enumeration prevention — confirmed with non-existent email)

Flow:
```
1. Create PasswordResetToken: { userId, email, tokenHash (SHA256), expiresAt (15 min) }
2. sendEmail() via Brevo REST API:
     To: user's email
     Subject: "Reset your password"
     Body: HTML link → ${NEXT_PUBLIC_APP_URL}/reset-password?token=<64hex>&email=<email>
3. Token consumed by: POST /api/v1/auth/password-reset/confirm
4. Confirm: validates token hash, sets new password, clears requiresPasswordChange, revokes all sessions
```

**Brevo email is configured and called** — but only for password-reset, not for employee creation.

---

## 8. Email Flow

### What IS sent

| Trigger | Recipient | Method | Content |
|---------|-----------|--------|---------|
| Password reset request | Employee/Admin | Brevo REST API | HTML link, expires 15 min |
| Account activated | Employee | Brevo via NotificationService | "Your account has been activated." |
| Account deactivated | Employee | Brevo via NotificationService | "Your account has been deactivated." |

### What is NOT sent

| Expected Event | Sent? | Evidence |
|----------------|-------|---------|
| Employee creation — welcome email | ✗ NO | `EmployeeService.create()` — no `sendEmail()` call |
| Employee creation — temp password delivery | ✗ NO | `temporaryPassword` returned in API response only |
| First login | ✗ NO | Not implemented |
| Device registration | ✗ NO | Not implemented |

### Email service

**Provider:** Brevo (formerly Sendinblue) REST API  
**Source:** `apps/admin/src/lib/email/brevo.ts`  
**Authentication:** `BREVO_API_KEY` environment variable  
**Sender:** `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME`  
**Error handling:** Thrown if Brevo returns non-OK. In `NotificationService`, email errors are swallowed (non-blocking). In `AuthService.requestPasswordReset`, email errors are swallowed (always return 200).

---

## 9. Mobile Login Verification

### Same auth backend — confirmed

Admin portal and mobile app share:
- Same `POST /api/v1/auth/login` endpoint
- Same `users` collection
- Same JWT signing key and format
- Same `requiresPasswordChange` flag

### Differentiation by role

| Client | Role | Device required | Use case |
|--------|------|----------------|----------|
| Admin portal (web) | `admin` | No | HR management |
| Mobile app (Android/iOS) | `employee` | Yes — fingerprint must match | Attendance, leave |

**One auth source.** There is no separate auth database for mobile.

### Device binding

Employee-role login requires:
1. `User.registeredDevice` set (admin must call register-device first)
2. `deviceFingerprint` in login payload (64-char hex, SHA256 of device identifiers)
3. `SHA256(deviceFingerprint) === User.registeredDevice.fingerprintHash`

The mobile Flutter app presumably sends its fingerprint automatically. Admin must call the register-device API with the fingerprint value obtained from the device/app before the employee can log in.

---

## 10. Security Review

| Property | Status | Notes |
|----------|--------|-------|
| bcrypt cost 12 | ✓ Good | Standard production cost |
| JWT HS256, 15-min TTL | ✓ Good | Short-lived, minimal PII in claims |
| Refresh token: SHA256 hashed in DB | ✓ Good | Raw token never stored |
| Timing-safe token comparison | ✓ Good | `timingSafeEqualHex()` for reset token |
| Rate limiting on auth (Upstash Redis) | ✓ Good | `authLimiter`, `passwordResetLimiter` |
| Enumeration prevention on password reset | ✓ Good | Always 200, same response |
| Device fingerprint binding for mobile | ✓ Good | Credential sharing blocked |
| Session revocation on password change | ✓ Good | All sessions revoked |
| requiresPasswordChange in JWT | ✓ Good | Client can enforce |
| requiresPasswordChange server enforcement | ✗ Missing | Client honor system only |
| Old access token blacklisting | ✗ By design | JWT; 15-min window acceptable |
| temp password delivery security | ✗ Concern | Admin must share via external channel |
| Email on creation | ✗ Missing | No employee notification |
| Rollback not transactional | ✗ Risk | User.create succeeds → Employee.create fails → User.deleteOne fails → orphan |

---

## 11. Architecture Review

### What is designed correctly

1. **Dual-collection model** (`User` + `Employee`) — correct separation. `User` is the auth record; `Employee` is the payroll profile. Same `_id` for consistent FK.
2. **Email-based auth** — industry standard for web/mobile HRMS.
3. **Device fingerprint binding** — strong mobile security. Prevents credential sharing between devices.
4. **`requiresPasswordChange` flag** — correct pattern for first-login enforcement.
5. **Refresh token rotation architecture** — 15-min access + 30-day refresh + 90-day absolute max — correct.
6. **Brevo email integration** — production-ready transactional email provider.
7. **Audit logging** on creation, activation, deactivation, device registration — correct.
8. **Password reset via email** — correct pattern (link with short-lived token, SHA256 stored).

### Architecture gaps

1. **No credential delivery to employee.** Temp password exists only in the API response JSON. Admin sees it once. No email, no SMS, no invitation link. In production, an HR admin would likely share via WhatsApp/email in plaintext — defeating the security of bcrypt hashing.

2. **No invitation/welcome email flow.** Production HRMS platforms send an invitation email with either:
   - The temporary password, or
   - A one-time setup link (invite token, time-limited)
   - A "set your own password" link (avoids temp password entirely)
   
3. **forgot-password UI is a non-functional stub.** The page renders a form but never calls the API. The backend API is fully implemented and unused.

4. **reset-password UI is a non-functional stub.** Explicitly says "not supported in this version."

5. **change-password page calls wrong API endpoint** (P0 — see §13). This means any user with `requiresPasswordChange: true` is completely blocked from proceeding.

6. **No self-service device registration.** Employee cannot initiate their own device binding. Admin must obtain device fingerprint out-of-band and call the API manually. No documented handshake process.

---

## 12. Production Readiness

| Component | Status |
|-----------|--------|
| Employee creation API | ✓ Ready |
| User + Employee dual-collection | ✓ Ready |
| Duplicate prevention | ✓ Ready |
| Rollback logic (manual, non-transactional) | ⚠ Acceptable for dev |
| Login API (email + password) | ✓ Ready |
| Device binding for mobile | ✓ Ready |
| JWT + refresh token flow | ✓ Ready |
| Session management | ✓ Ready |
| Change password API | ✓ Ready |
| Password reset API (Brevo) | ✓ Ready |
| Rate limiting | ✓ Ready |
| Audit logging | ✓ Ready |
| **Change password UI** | ✗ Broken (wrong endpoint) |
| **Forgot password UI** | ✗ Stub — no API call |
| **Reset password UI** | ✗ Stub — says "not supported" |
| **Employee credential delivery** | ✗ No email on creation |
| **AuthContext.AdminUser type** | ✗ `_id` should be `id` |

---

## 13. Missing Components / Defects

### DEF-ONBOARD-001 — P0 BLOCKER: Change password UI calls wrong endpoint

**File:** `apps/admin/src/app/(auth)/change-password/page.tsx:37`

```typescript
// WRONG — 501 "Not implemented"
await apiFetch('/api/v1/auth/me', { method: 'PATCH', ... });

// CORRECT
await apiFetch('/api/v1/auth/me/change-password', { method: 'PATCH', ... });
```

**Impact:** Any user with `requiresPasswordChange: true` (i.e. every newly created admin) logs in → redirected to `/change-password` → submits form → always fails with error. Cannot clear the flag. Cannot access the portal. The admin portal is completely inaccessible to any newly created admin user until the endpoint bug is fixed.

**Workaround:** Call the API directly:
```bash
curl -X PATCH http://localhost:3000/api/v1/auth/me/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"CF3MQq6dg9mS","newPassword":"NewPwd@123456"}'
```

---

### DEF-ONBOARD-002 — P1 HIGH: Forgot password UI is a non-functional stub

**File:** `apps/admin/src/app/(auth)/forgot-password/page.tsx:36`

```tsx
// Form submits without calling any API:
<form onSubmit={e => { e.preventDefault(); setSubmitted(true); }} ...>
```

**Backend:** `POST /api/v1/auth/password-reset/request` — fully implemented, sends Brevo email.  
**UI:** Fakes success. User sees "Check your email" but no email is sent.

---

### DEF-ONBOARD-003 — P1 HIGH: Reset password UI is a non-functional stub

**File:** `apps/admin/src/app/(auth)/reset-password/page.tsx`

Renders: "Password reset links are not supported in this version."  
Does not read `token` from URL params.  
Does not call `POST /api/v1/auth/password-reset/confirm`.  
**Backend:** Fully implemented and unused.

---

### DEF-ONBOARD-004 — P1 HIGH: No email on employee creation

**File:** `apps/admin/src/services/EmployeeService.ts:162–248`

`temporaryPassword` generated, returned in API response, never emailed.  
Employee has no way to receive their credentials other than the admin telling them.

---

### DEF-ONBOARD-005 — P2 MEDIUM: AuthContext.AdminUser type uses `_id` not `id`

**File:** `apps/admin/src/contexts/AuthContext.tsx:13`

```typescript
interface AdminUser { _id: string; ... }
```

Login API returns `employee.id` (not `employee._id`). So `user._id` is always `undefined` throughout the portal session. Any portal component reading `user._id` silently fails.

---

### DEF-ONBOARD-006 — P2 MEDIUM: `requiresPasswordChange` not server-enforced

JWT carries `requiresPasswordChange: true` but no server middleware blocks API calls when this flag is set. A client bypassing the redirect can operate fully with the temp password. Acceptable for trusted admin clients; should have server enforcement in production.

---

## 14. Recommended Improvements (priority order, NOT implementing)

### MUST fix before any employee can onboard

1. **Fix change-password URL** (DEF-ONBOARD-001) — 1-line fix, P0.

2. **Fix forgot-password page** (DEF-ONBOARD-002) — call `POST /api/v1/auth/password-reset/request`.

3. **Fix reset-password page** (DEF-ONBOARD-003) — read `token` + `email` from URL, call `POST /api/v1/auth/password-reset/confirm`.

4. **Fix AuthContext.AdminUser type** (DEF-ONBOARD-005) — `_id` → `id`.

### SHOULD implement for production-grade onboarding

5. **Email temp password on creation.** Call `sendEmail()` at end of `EmployeeService.create()` with the plain temp password. Uses the existing Brevo service — no new infrastructure. Simple, immediate improvement.

6. **Or: Invitation link flow.** Instead of emailing temp password, generate a time-limited invite token, email a link like `{APP_URL}/accept-invite?token=<token>`, user sets their own password. More secure (temp password never in plaintext email body, user-chosen password). Requires: `InviteToken` model, `/accept-invite` page, invite-confirm API.

7. **Implement forgot-password → reset flow for employees** (items 2+3 above). The API is ready; only UI stubs need to be replaced.

8. **Device registration UX.** Document or automate how admin obtains employee's device fingerprint. The mobile app should display or log the fingerprint on first launch so admin can copy-paste into the register-device API call.

9. **Rollback with MongoDB transaction.** Replace manual `User.deleteOne()` rollback with `mongoose.startSession().withTransaction()` for atomic User+Employee creation.

10. **Server-side `requiresPasswordChange` enforcement.** Add middleware in `requireAuth` that throws `AUTH_010` if `requiresPasswordChange === true` for any request except `PATCH /api/v1/auth/me/change-password`.

---

## Decision

**Onboarding is INCOMPLETE.**

Backend authentication architecture is production-quality.  
Frontend onboarding flow has 1 P0 blocker (change-password URL) and 2 P1 defects (forgot/reset password stubs) that must be fixed before any employee can complete onboarding.

**Phase 15.17 remediation required.** Awaiting approval before implementing.
