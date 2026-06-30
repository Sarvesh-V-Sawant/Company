# Phase 15.21 — Device Registration & Approval Workflow Architecture

**Date:** 2026-06-29  
**Phase:** 15.21  
**Status:** DESIGN — awaiting approval before implementation  
**Author:** Architecture review based on Phase 15.20 runtime verification

---

## Context

Phase 15.20 proved the backend authentication is correct. The only missing capability is the administrator workflow for approving employee devices. Currently:

- `PATCH /api/v1/employees/[id]/register-device` works
- `PATCH /api/v1/employees/[id]/reset-device` works
- Admin portal has **no UI** for either operation
- Employees land on `DeviceAwaitingRegistrationScreen` with no way to submit a formal request — only copy a fingerprint and manually contact admin out-of-band

---

## Current State Summary

### What exists

| Component | Status |
|-----------|--------|
| `User.registeredDevice` (embedded, single device) | ✓ Exists |
| `EmployeeService.registerDevice()` | ✓ Exists |
| `EmployeeService.resetDevice()` | ✓ Exists |
| `PATCH /employees/[id]/register-device` route | ✓ Exists |
| `PATCH /employees/[id]/reset-device` route | ✓ Exists |
| `AuditLog DEVICE_REGISTERED` action | ✓ Exists |
| `DeviceNotRegisteredScreen` (shows fingerprint) | ✓ Exists |
| `DeviceAwaitingRegistrationScreen` (passive, no API) | ✓ Exists (passive) |
| Admin portal device management UI | ✗ Missing |
| Employee-initiated device request endpoint | ✗ Missing |
| Device request status polling endpoint | ✗ Missing |
| Admin notification on device request | ✗ Missing |

### Critical gap

`DeviceAwaitingRegistrationScreen` tells the employee "Your admin needs to enter your device code in the admin portal." There is no such page in the admin portal. The admin cannot act without curl/Postman.

---

## Design Goals

1. Employee initiates request in-app — no out-of-band communication required
2. Admin approves/rejects from the admin portal — no API tool required
3. Employee gets immediate feedback on retry
4. Complete audit trail for every device action
5. Secure against request spoofing — identity verified before request is accepted
6. Handles: first device, replacement device, lost/stolen device
7. Forward-compatible with future MDM integration

---

## UX Flows

### Flow A — First-Time Device Registration

```
Employee opens app
  └─ Splash: tryRefreshSession() → fails (no tokens)
     └─ Navigate to /login

Employee enters email + password → tap Sign In
  └─ POST /api/v1/auth/login
     └─ AUTH_004: device not registered
        └─ Navigate to /device-not-registered

DeviceNotRegisteredScreen (UPDATED)
  Shows:
    - Device Name (from DeviceInfoPlugin)
    - Manufacturer
    - Model
    - Android version
    - Fingerprint (first 16 chars + Copy button)
  Buttons:
    - "Request Approval" (primary)
    - "Retry" (outline)

  Employee taps "Request Approval"
    └─ POST /api/v1/auth/device-request
         body: {email, password, deviceFingerprint, deviceName, manufacturer,
                model, androidVersion, platform}
       └─ Success: DeviceRequest created (status: pending)
          └─ Navigate to /device-awaiting-registration
       └─ Already pending: DeviceRequest updated (idempotent)
          └─ Navigate to /device-awaiting-registration
       └─ Rate limited: show inline error "Too many requests. Try again in 24h."
       └─ Wrong credentials: show inline error "Invalid email or password."

DeviceAwaitingRegistrationScreen (UPDATED)
  Shows:
    - "Waiting for admin approval"
    - Request submitted: <timestamp>
    - Device: <model>
    - Fingerprint: <16-char prefix>
  Buttons:
    - "Check Status" → GET /api/v1/auth/device-request/status
    - "Sign In" (outline) → /login

  "Check Status" returns:
    pending  → stays on screen, shows "Still waiting…"
    approved → "Your device has been approved! Tap Sign In to continue."
               Button: "Sign In" → /login
    rejected → "Request rejected: [admin reason]"
               Button: "Request Again" → /device-not-registered
               Button: "Contact Admin"
```

### Flow B — Device Replacement (Employee Lost Phone)

```
Employee installs app on new phone
  └─ New SHA-256 fingerprint generated (different device hardware)
  └─ POST /api/v1/auth/login → AUTH_005 (fingerprint mismatch)
     └─ Navigate to /device-mismatch

DeviceMismatchScreen (UPDATED)
  Shows:
    - "This device is not the registered device for your account."
    - "If you have a new device, request a device replacement."
  Buttons:
    - "Request Device Replacement" (primary)
    - "Back to Sign In" (outline)

  Employee taps "Request Device Replacement"
    └─ POST /api/v1/auth/device-request
         (same endpoint — replaces pending or approved device)
       └─ Navigate to /device-awaiting-registration

Admin sees request in portal:
  Shows: "REPLACEMENT REQUEST — Employee already has a registered device.
          Approving this will revoke the existing device and all its sessions."
  Admin approves
    └─ EmployeeService.registerDevice() (replaces registeredDevice)
    └─ All active DeviceSessions for old device revoked
    └─ DeviceRequest status = approved
    └─ AuditLog: DEVICE_REPLACED

Employee retries → login succeeds
```

### Flow C — Stolen Device (Admin-Initiated Revocation)

```
Admin Portal → Employees → [employee] → Device section
  Shows: "Registered Device: Pixel 7 (android) — registered 2026-06-29"
  Button: "Revoke Device"
    └─ Confirm dialog: "Revoke this device? All sessions will be terminated."
    └─ PATCH /api/v1/employees/[id]/reset-device
    └─ registeredDevice = null
    └─ All DeviceSessions isRevoked = true
    └─ AuditLog: DEVICE_REVOKED

Employee on old device → any API call → 401 (session revoked)
  └─ AuthInterceptor: refresh fails → sessionExpired → /session-expired
  └─ Employee must re-login → AUTH_004 (no device) → request flow
```

### Flow D — Admin Portal Device Management

```
Admin navigates to /devices

Tabs:
  [Pending (N)] [Registered] [History]

Pending tab:
  Table: Employee | Email | Device | Platform | Requested | Type | Actions
  Row actions:
    - "Approve" button → approve dialog
    - "Reject" button → rejection reason dialog

  Approve dialog:
    "Approve device for Sarvesh Sawant?"
    "Device: Pixel 7 (Android 14)"
    "Fingerprint: b1c2d3e4..."
    [Cancel] [Approve]

  Reject dialog:
    "Reject device request for Sarvesh Sawant?"
    Reason: [text input — sent to employee]
    [Cancel] [Reject]

Registered tab:
  Table: Employee | Email | Device | Platform | Registered | Last Login | Actions
  Row actions:
    - "Revoke" button → confirm dialog
    - "View Sessions" → active DeviceSessions count + last used

History tab:
  Table: Employee | Action | Device | Admin | Date | Reason
  Actions: REGISTERED, REPLACED, REVOKED, REQUEST_APPROVED, REQUEST_REJECTED
  Filterable by employee, action, date range
```

---

## Database Changes

### New Model: `DeviceRequest`

```typescript
// src/models/DeviceRequest.ts

interface IDeviceRequest extends Document {
  userId: mongoose.Types.ObjectId;         // employee user _id
  email: string;                            // denormalized for query efficiency
  fingerprintHash: string;                  // SHA-256(deviceFingerprint) — never store raw
  deviceName: string;                       // "Pixel 7"
  manufacturer: string;                     // "Google"
  model: string;                            // "Pixel 7"
  androidVersion: string;                   // "14"
  platform: 'android' | 'ios';
  status: 'pending' | 'approved' | 'rejected';
  type: 'first_device' | 'replacement';    // replacement if user.registeredDevice != null at request time
  requestedAt: Date;
  expiresAt: Date;                          // pending requests auto-expire after 7 days (TTL index)
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;     // admin userId
  rejectionReason?: string;                // shown to employee on status check
  requestIp: string;
  requestCount: number;                     // times this device has submitted requests (dedup tracking)
  createdAt: Date;
  updatedAt: Date;
}

// Indexes:
// { userId: 1, status: 1 }           — find pending requests per employee
// { fingerprintHash: 1, status: 1 }  — idempotency check
// { status: 1, requestedAt: -1 }     — admin pending list
// { expiresAt: 1 } expireAfterSeconds: 0  — TTL cleanup of expired pending requests
// { email: 1, status: 1 }            — status polling by email
```

### Modified Model: `User` — device history

Add `deviceHistory` array to track revocation audit without relying solely on AuditLog:

```typescript
// Addition to IUser / UserSchema

deviceHistory: Array<{
  fingerprintHash: string;
  deviceName: string;
  platform: 'android' | 'ios';
  registeredAt: Date;
  revokedAt?: Date;
  revokedBy?: mongoose.Types.ObjectId;  // admin userId
  revokedReason: 'manual_revocation' | 'replacement' | 'admin_reset';
}>;
```

`registeredDevice` remains unchanged (single active device). `deviceHistory` is append-only.

### Modified Model: `AuditLog` — new actions

No schema change needed (action is a freeform string). New action values:

| Action | Trigger |
|--------|---------|
| `DEVICE_REQUEST_SUBMITTED` | Employee submits device request |
| `DEVICE_REQUEST_APPROVED` | Admin approves |
| `DEVICE_REQUEST_REJECTED` | Admin rejects |
| `DEVICE_REVOKED` | Admin revokes device (stolen/lost) |
| `DEVICE_REPLACED` | Admin approves replacement request |

`DEVICE_REGISTERED` (existing) — kept for backward compatibility, emitted alongside `DEVICE_REQUEST_APPROVED`.

---

## API Changes

### New Endpoints

#### `POST /api/v1/auth/device-request`

Employee-initiated. No session token (employee is not logged in). Identity verified by password.

```
Request:
{
  email: string;                // z.string().email()
  password: string;             // z.string().min(1)
  deviceFingerprint: string;    // z.string().regex(/^[0-9a-f]{64}$/i)
  deviceName: string;           // z.string().max(100) — "Pixel 7"
  manufacturer: string;         // z.string().max(100) — "Google"
  model: string;                // z.string().max(100) — "Pixel 7"
  androidVersion: string;       // z.string().max(20) — "14"
  platform: 'android' | 'ios';
}

Rate limits:
  - authLimiter (shared 10/min per IP)
  - deviceRequestLimiter: slidingWindow(3, '24h') per email  ← new
  - deviceRequestLimiter: slidingWindow(5, '24h') per IP     ← new

Success (201):
{
  "success": true,
  "data": {
    "requestId": "...",
    "status": "pending",
    "message": "Device approval request submitted. Your admin will review it shortly."
  }
}

Already pending — idempotent (200):
{
  "success": true,
  "data": {
    "requestId": "...",
    "status": "pending",
    "message": "A pending request already exists for this device."
  }
}

Errors (always same message to prevent enumeration):
  GEN_001 400 — validation failed
  AUTH_001 401 — wrong email/password (same as login error — no information about whether email exists)
  AUTH_007 401 — account inactive
  GEN_003 429 — rate limited
```

**Security design:**
- Backend calls `bcrypt.compare(password, user.passwordHash)` before creating any DeviceRequest
- Returns `AUTH_001` for both wrong email AND wrong password (prevents user enumeration)
- `fingerprintHash = SHA-256(deviceFingerprint)` — raw fingerprint never stored
- Idempotency: if `DeviceRequest.findOne({ userId, fingerprintHash, status: 'pending' })` exists, return 200 with existing requestId (no duplicate created)
- If `status: 'approved'` already exists for this hash: return 200 saying "already approved, please retry login"
- Rate limit key: `drq:email:{email}` and `drq:ip:{ip}`, 3/24h and 5/24h respectively

---

#### `GET /api/v1/auth/device-request/status`

Employee polls this on the awaiting screen. No auth token.

```
Query params:
  email: string
  fingerprintHash: string   // SHA-256(deviceFingerprint) — computed client-side

Rate limit: authLimiter (10/min per IP)

Response 200 — always 200 regardless of whether record exists (prevents enumeration):
{
  "success": true,
  "data": {
    "status": "pending" | "approved" | "rejected" | "not_found",
    "rejectionReason": string | null   // only when rejected
  }
}
```

**Security design:**
- `fingerprintHash` is the query key — only the device that knows its own fingerprint can poll its status
- No email-only lookup (prevents probing which emails have pending requests)
- Always 200 — `not_found` is indistinguishable from "no request submitted"

---

#### `GET /api/v1/devices/requests` (admin only)

```
Query params:
  status?: 'pending' | 'approved' | 'rejected'  // default: 'pending'
  page?: number
  limit?: number (max 50)
  employeeId?: string    // filter by employee
  search?: string        // employee name / email / device name

Response 200:
{
  "success": true,
  "data": {
    "requests": [{
      "id": "...",
      "employee": { "id": "...", "name": "...", "email": "...", "employeeId": "..." },
      "deviceName": "Pixel 7",
      "manufacturer": "Google",
      "model": "Pixel 7",
      "androidVersion": "14",
      "platform": "android",
      "fingerprintHash": "b1c2d3...",   // admin sees hash, not raw fingerprint
      "status": "pending",
      "type": "first_device" | "replacement",
      "requestedAt": "2026-06-29T...",
      "expiresAt": "2026-07-06T..."
    }],
    "total": 12,
    "page": 1,
    "totalPages": 1
  }
}
```

---

#### `PATCH /api/v1/devices/requests/[requestId]/approve` (admin only)

```
Request: {} (empty body — no extra fields needed)

Action:
  1. Load DeviceRequest by requestId (must be 'pending')
  2. Load employee User
  3. If type='replacement': move current registeredDevice → deviceHistory
                            revoke all active DeviceSessions (revokedReason: 'device-change')
  4. Call EmployeeService.registerDevice() → sets User.registeredDevice
  5. Update DeviceRequest: status='approved', reviewedAt, reviewedBy
  6. Write AuditLog: DEVICE_REQUEST_APPROVED, DEVICE_REGISTERED (or DEVICE_REPLACED)
  7. Send FCM push to employee if FCM token exists (non-blocking)

Response 200:
{
  "success": true,
  "data": { "message": "Device approved. Employee can now log in." }
}

Errors:
  GEN_002 404 — request not found
  GEN_004 409 — request already reviewed (idempotency)
```

---

#### `PATCH /api/v1/devices/requests/[requestId]/reject` (admin only)

```
Request: { "reason": string }   // z.string().max(500) — shown to employee

Action:
  1. Load DeviceRequest (must be 'pending')
  2. Update: status='rejected', reviewedAt, reviewedBy, rejectionReason
  3. AuditLog: DEVICE_REQUEST_REJECTED

Response 200:
{
  "success": true,
  "data": { "message": "Device request rejected." }
}
```

---

#### `GET /api/v1/devices` (admin only)

```
Lists all employees with registered devices. Includes last login, session count.

Query params:
  search?: string
  platform?: 'android' | 'ios'
  page?: number

Response 200:
{
  "success": true,
  "data": {
    "devices": [{
      "employee": { "id", "name", "email", "employeeId" },
      "device": {
        "deviceName": "Pixel 7",
        "platform": "android",
        "registeredAt": "...",
        "fingerprintHash": "b1c2..."
      },
      "lastLoginAt": "...",
      "activeSessions": 1
    }],
    "total": 8
  }
}
```

---

#### `GET /api/v1/devices/history` (admin only)

```
Queries AuditLog for DEVICE_* actions.

Query params:
  employeeId?: string
  action?: string
  from?: ISO date
  to?: ISO date
  page?: number

Response: paginated AuditLog entries for device actions
```

---

### Modified Endpoints

#### `PATCH /api/v1/employees/[id]/register-device` (existing — keep, restrict)

Keep for backward compatibility and direct admin use. No behaviour change. Admin portal Devices page will call the new approval endpoints instead.

#### `PATCH /api/v1/employees/[id]/reset-device` (existing — add to portal UI)

No API change. Admin portal employee detail page will expose a "Revoke Device" button that calls this route. Currently unreachable from portal UI.

---

### New Rate Limiters

```typescript
// src/middleware/rateLimiter.ts — additions only

export const deviceRequestLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  prefix: 'rl:device-req',
});
```

Used in `POST /api/v1/auth/device-request` on both `email:{email}` and `ip:{ip}` keys.

---

## Admin Portal Design

### New Page: `/devices`

Route: `src/app/(portal)/devices/page.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  Device Management                                           │
│                                                              │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────────┐   │
│  │ Pending (2)  │ │  Registered   │ │     History      │   │
│  └──────────────┘ └───────────────┘ └──────────────────┘   │
│                                                              │
│  PENDING DEVICE REQUESTS                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Employee      Device        Type         Requested  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Sarvesh S.    Pixel 7       First device  2h ago    │   │
│  │  EMP3527 ·     Android 14   [Approve] [Reject]       │   │
│  │  worksby...    b1c2d3e4...                            │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  Amit K.       Samsung S24   Replacement  5h ago     │   │
│  │  EMP1042 ·     Android 14   [Approve] [Reject]       │   │
│  │  amit@...      a9f8e7d6...                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Pending tab behaviour:**
- Badge count in sidebar nav: "Devices (2)"
- Badge auto-clears when count = 0
- Polling: `SWR` with 30s revalidation (no WebSocket required)
- Approve dialog shows full device info + fingerprint hash prefix
- Reject dialog requires reason text (min 10 chars, shown to employee)
- Replacement requests show warning: "⚠ This will revoke the employee's existing device and terminate all active sessions."

**Registered tab:**
- All employees with `registeredDevice != null`
- Columns: Employee, Device Name, Platform, Registered, Last Login, Sessions, Actions
- Actions: "Revoke Device" → confirm dialog → `PATCH /employees/[id]/reset-device`
- "View Sessions" → modal showing active DeviceSessions (count, platform, last used, IP hash)

**History tab:**
- Paginated AuditLog entries for DEVICE_* actions
- Columns: Date, Employee, Action, Device, Admin, Reason
- Filter by: employee name, action type, date range

### Modified Page: `/employees/[id]`

Add a "Device" section to the employee detail page:

```
┌──────────────────────────────────────────────────────────┐
│  Device                                                   │
├──────────────────────────────────────────────────────────┤
│  Status:    ● Registered                                  │
│  Device:    Pixel 7 (Android)                             │
│  Registered: 29 Jun 2026                                  │
│  Last Login: 2 hours ago                                  │
│                                                           │
│  [Revoke Device]                                          │
└──────────────────────────────────────────────────────────┘

OR (if no device):

┌──────────────────────────────────────────────────────────┐
│  Device                                                   │
├──────────────────────────────────────────────────────────┤
│  Status:    ○ Not registered                             │
│                                                           │
│  Pending request:  Pixel 7 · submitted 2h ago            │
│  Fingerprint:      b1c2d3e4... [Approve] [Reject]        │
└──────────────────────────────────────────────────────────┘
```

### Modified: AdminLayout sidebar nav

Add "Devices" entry between "Employees" and "Attendance":

```typescript
// src/components/layout/AdminLayout.tsx (or equivalent nav config)
{ label: 'Devices', href: '/devices', icon: PhoneAndroidIcon, badgeKey: 'pendingDevices' }
```

Badge count fetched from `GET /api/v1/devices/requests?status=pending&limit=1` (total field only).

---

## Mobile Design Updates

### Modified: `DeviceNotRegisteredScreen`

**Currently:** Shows truncated fingerprint, "I've Notified My Admin", "Try Again"  
**Updated:** Shows full device info, "Request Approval" (calls API), "Retry"

```
┌────────────────────────────────────┐
│                                    │
│         📱                         │
│                                    │
│    Device Not Registered           │
│                                    │
│  Your device needs approval        │
│  before you can use this app.      │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Device Information           │  │
│  ├──────────────────────────────┤  │
│  │ Name       Pixel 7           │  │
│  │ Maker      Google            │  │
│  │ Model      Pixel 7           │  │
│  │ Android    14                │  │
│  │ Code       b1c2d3e4… [Copy] │  │
│  └──────────────────────────────┘  │
│                                    │
│  [Request Approval]  ← PRIMARY     │
│  [Retry]             ← OUTLINE     │
│                                    │
└────────────────────────────────────┘
```

"Request Approval" flow:
- Requires `_emailCtrl` and `_passwordCtrl` — passed from `LoginScreen` via router extras or re-prompted
- Calls `POST /api/v1/auth/device-request`
- On success → `/device-awaiting-registration`
- On `AUTH_001` → "Wrong email or password. Please go back and check your credentials." + "Sign In" button
- On `GEN_003` (rate limit) → "Too many requests. Wait 24 hours before trying again."

**Implementation note:** `DeviceNotRegisteredScreen` currently has no access to the email/password used to attempt login. Two options:
- Option A: Pass credentials as GoRouter `extra` from `LoginScreen` (no sensitive data persisted)
- Option B: Re-prompt for password on `DeviceNotRegisteredScreen` ("Please confirm your password to submit the request")

**Recommendation: Option B.** Avoids passing password through router state. Keeps screens independent. UX: small password field below device info card with label "Confirm your password to submit request."

### Modified: `DeviceAwaitingRegistrationScreen`

**Currently:** Static screen, shows fingerprint, "Try Again" / "Back to Sign In"  
**Updated:** Active polling, shows request status, dynamic CTA

```
┌────────────────────────────────────┐
│                                    │
│         ⏳                         │
│                                    │
│   Waiting for Approval             │
│                                    │
│  Your request is being reviewed    │
│  by your administrator.            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Device:   Pixel 7            │  │
│  │ Submitted: 29 Jun, 5:22 PM  │  │
│  │ Status:   ⏳ Pending         │  │
│  └──────────────────────────────┘  │
│                                    │
│  [Check Status]                    │
│  [Sign In]            ← OUTLINE    │
│                                    │
│  Last checked: 2 min ago           │
└────────────────────────────────────┘
```

Status transitions:
- `pending` → stays, updates "Last checked" timestamp
- `approved` → green checkmark, "Your device has been approved! Tap Sign In."
- `rejected` → red X, "Request rejected: [reason]", "Request Again" + "Contact HR"

Check Status flow:
- `GET /api/v1/auth/device-request/status?email=X&fingerprintHash=Y`
- `fingerprintHash` computed client-side: `sha256(deviceFingerprint)` using `crypto` package

### Modified: `DeviceMismatchScreen`

**Currently:** Shows error + "Try Again"  
**Updated:** Add "Request Device Replacement" CTA

```
┌────────────────────────────────────┐
│                                    │
│         ⚠️                         │
│                                    │
│   Device Mismatch                  │
│                                    │
│  This device doesn't match the     │
│  registered device on your account.│
│                                    │
│  If this is a new or replacement   │
│  phone, request approval below.    │
│                                    │
│  [Request Replacement]  ← PRIMARY  │
│  [Sign In]              ← OUTLINE  │
│                                    │
└────────────────────────────────────┘
```

"Request Replacement" → same `POST /api/v1/auth/device-request` endpoint with type auto-detected server-side.

---

## Security Review

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Impersonation — attacker submits device request for victim | Password required in `POST /device-request`. `bcrypt.compare()` must pass. |
| User enumeration via device-request | `AUTH_001` returned for both bad email and bad password |
| Brute-force via device-request endpoint | `authLimiter` (10/min per IP) + `deviceRequestLimiter` (3/24h per email, 5/24h per IP) |
| Status polling to enumerate emails | Status endpoint requires `fingerprintHash` — only the physical device knows it |
| Token replay after device revocation | All `DeviceSessions.isRevoked = true` on revoke/replace → refresh fails → session expired |
| Admin approves wrong device | Admin sees full device info (name, model, OS, fingerprint prefix). Replacement requests show explicit warning. |
| Raw fingerprint exposure | Fingerprint is SHA-256'd before storage at every point. Raw value in transit only, never persisted. |
| Pending request spam | `requestCount` tracked. Idempotent: second request for same fingerprintHash updates existing. Max 3 requests/24h per email. |
| Expired pending requests | TTL index on `DeviceRequest.expiresAt` (7 days). Auto-deleted by MongoDB. |
| Admin JWT expiry during review | Portal re-prompts login normally. Approval is a fresh API call with current JWT. |
| Multiple simultaneous approval clicks | `PATCH .../approve` uses `{ status: 'pending' }` filter in update. Second call gets GEN_004 409 (already reviewed). |

### What Does NOT Change

- `AuthService.login()` logic unchanged
- `AUTH_004` / `AUTH_005` error codes unchanged
- `bcrypt` password hashing unchanged
- `DeviceSession` model unchanged
- `fingerprintHash` storage (SHA-256) unchanged
- Existing `register-device` and `reset-device` routes unchanged

---

## Admin Notifications

### Option 1 — Email notification (recommended for V1)

On `POST /api/v1/auth/device-request` success, send email to admin(s):

```
Subject: [Genesis HR] Device approval requested — Sarvesh Sawant
Body:
  Employee: Sarvesh Sawant (EMP3527)
  Device: Pixel 7 (Android 14)
  Requested: 29 Jun 2026, 5:22 PM
  Type: First device registration

  [Review Request] → https://portal/devices
```

Implementation: `sendEmail()` (existing Brevo integration). Fetch admin emails from `User.find({ role: 'admin', isActive: true })`. Non-blocking (fire-and-forget).

### Option 2 — Portal badge (recommended for V1, alongside email)

Admin portal sidebar shows "Devices (N)" badge. Badge count from SWR poll every 30s. No WebSocket needed.

### Option 3 — Employee FCM push on approval (V1, best-effort)

After admin approves, check `FcmToken.findOne({ employeeId })`. If exists, send push:
```
Title: "Device Approved"
Body:  "Your device has been approved. Tap to sign in."
```

Employee likely doesn't have an FCM token (they haven't logged in). Push will fail silently — acceptable, they will see status on next "Check Status" tap.

### Option 4 — MDM webhook (V2, future)

When a DeviceRequest is approved or rejected, fire a webhook to an external MDM system (e.g., Microsoft Intune, Jamf). Out of scope for V1.

---

## Multiple Device Support (Future)

Current design: one active device per employee (`User.registeredDevice` = single embedded object). This document preserves that constraint.

If multiple devices are required in future:
- Move `registeredDevice` → `registeredDevices: IRegisteredDevice[]` (array, max N per policy)
- `AuthService.login()` checks `registeredDevices.some(d => d.fingerprintHash === sha256(fp))`
- Device Management page shows per-device rows for each employee
- **This is a schema migration** — not backward-compatible with current `registeredDevice: null` check

No changes are needed now to enable this later. `deviceHistory` array (proposed above) is already array-typed and prepares the schema for this migration.

---

## Rollout Plan

### Phase A — Prerequisites (no user impact)
1. Add `DeviceRequest` model + indexes
2. Add `deviceHistory` field to `User` (default `[]`, non-breaking)
3. Add `deviceRequestLimiter` to `rateLimiter.ts`
4. No migration required — MongoDB adds fields lazily

### Phase B — Backend API
5. `POST /api/v1/auth/device-request`
6. `GET /api/v1/auth/device-request/status`
7. `GET /api/v1/devices/requests`
8. `PATCH /api/v1/devices/requests/[id]/approve`
9. `PATCH /api/v1/devices/requests/[id]/reject`
10. `GET /api/v1/devices` (registered devices list)
11. `GET /api/v1/devices/history`
12. Modify `EmployeeService.registerDevice()` to write `deviceHistory` entry
13. Modify `EmployeeService.resetDevice()` to write `deviceHistory` entry
14. Email notification from `POST /device-request`

### Phase C — Admin Portal
15. `/devices` page (Pending + Registered + History tabs)
16. Device section on `/employees/[id]` (status + revoke button)
17. Sidebar badge for pending count

### Phase D — Mobile
18. Update `DeviceNotRegisteredScreen` (device info + "Request Approval" + password confirm)
19. Update `DeviceAwaitingRegistrationScreen` (status polling + dynamic CTA)
20. Update `DeviceMismatchScreen` (replacement request CTA)
21. Add `requestDeviceApproval()` + `checkDeviceRequestStatus()` to `AuthRepository`
22. Add `forgotPassword()`-style endpoints to `AuthRemoteSource`

### Phase E — Quality Gates
23. Unit tests for new service methods
24. Integration tests for new endpoints
25. `flutter analyze` — zero issues
26. `tsc --noEmit` — zero errors
27. `eslint --max-warnings 0`
28. `next build` exit 0
29. `flutter build apk --debug` exit 0

**Deploy order:** Phase A → Phase B → Phase C → Phase D. Each phase is independently deployable. Mobile update (Phase D) can trail by one release cycle — existing `DeviceAwaitingRegistrationScreen` (manual flow) continues to work during the interim.

---

## Files Requiring Modification

### New Files — Backend

| File | Purpose |
|------|---------|
| `src/models/DeviceRequest.ts` | New DeviceRequest schema |
| `src/app/api/v1/auth/device-request/route.ts` | POST — employee submits request |
| `src/app/api/v1/auth/device-request/status/route.ts` | GET — employee polls status |
| `src/app/api/v1/devices/requests/route.ts` | GET — admin lists requests |
| `src/app/api/v1/devices/requests/[id]/approve/route.ts` | PATCH — admin approves |
| `src/app/api/v1/devices/requests/[id]/reject/route.ts` | PATCH — admin rejects |
| `src/app/api/v1/devices/route.ts` | GET — admin lists registered devices |
| `src/app/api/v1/devices/history/route.ts` | GET — admin device history |
| `src/validators/device.ts` | Zod schemas for new endpoints |

### Modified Files — Backend

| File | Change |
|------|--------|
| `src/models/User.ts` | Add `deviceHistory` array field |
| `src/models/index.ts` | Export `DeviceRequest` |
| `src/services/EmployeeService.ts` | `registerDevice()` + `resetDevice()` write to `deviceHistory`; add `DeviceService` methods or extend EmployeeService |
| `src/middleware/rateLimiter.ts` | Add `deviceRequestLimiter` |

### New Files — Admin Portal

| File | Purpose |
|------|---------|
| `src/app/(portal)/devices/page.tsx` | Device Management page (3 tabs) |
| `src/hooks/useDeviceRequests.ts` | SWR hook for pending requests |
| `src/hooks/useRegisteredDevices.ts` | SWR hook for registered devices |

### Modified Files — Admin Portal

| File | Change |
|------|--------|
| `src/app/(portal)/employees/[id]/page.tsx` | Add Device section (status + revoke + pending inline approval) |
| `src/components/layout/AdminLayout.tsx` | Add Devices nav item + badge |

### Modified Files — Mobile

| File | Change |
|------|--------|
| `lib/features/device_registration/presentation/screens/device_not_registered_screen.dart` | Add device info display, password confirm field, "Request Approval" button + API call |
| `lib/features/device_registration/presentation/screens/device_awaiting_registration_screen.dart` | Add status polling, dynamic CTA per status, "Check Status" button |
| `lib/features/device_registration/presentation/screens/device_mismatch_screen.dart` | Add "Request Replacement" CTA |
| `lib/features/auth/data/repositories/auth_repository.dart` | Add `requestDeviceApproval()`, `checkDeviceRequestStatus()` |
| `lib/features/auth/data/sources/auth_remote_source.dart` | Add `requestDeviceApproval()`, `checkDeviceRequestStatus()` |
| `lib/core/constants/api_endpoints.dart` | Add `deviceRequest`, `deviceRequestStatus` constants |

### No Changes Required

| File | Reason |
|------|--------|
| `src/services/AuthService.ts` | Login logic unchanged |
| `src/app/api/v1/auth/login/route.ts` | Unchanged |
| `src/app/api/v1/employees/[id]/register-device/route.ts` | Keep for direct admin use |
| `src/app/api/v1/employees/[id]/reset-device/route.ts` | Keep, now wired to portal UI |
| `src/models/DeviceSession.ts` | Unchanged |
| `src/models/AuditLog.ts` | No schema change (freeform action string) |

---

## Open Questions

1. **Password on DeviceNotRegisteredScreen:** Option A (pass via router extras) vs Option B (re-prompt). Recommendation: Option B for security hygiene. Confirm before implementation.

2. **Request expiry:** 7 days proposed for pending requests. Adjust if admin review SLA differs.

3. **Admin notification target:** Email all active admins vs. a designated "device approval admin"? V1 proposal: all active admins.

4. **Multiple pending requests for same employee:** Proposal: allow one pending request per `(userId, fingerprintHash)` pair — multiple devices can have simultaneous pending requests. If same fingerprint re-submits, update `requestCount` only. Confirm this is acceptable.

5. **Rejection resubmission:** After rejection, employee can request again (counter applies). No cooldown beyond rate limit. Confirm this is acceptable.

6. **`flutter build` APK target:** Phase D mobile changes require a new APK deploy to the physical device to test. The `API_BASE_URL` must be set correctly via `--dart-define` for the device to reach the backend.

---

**Awaiting approval to begin implementation.**
