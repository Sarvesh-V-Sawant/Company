# Phase 15.22 — Device Registration Workflow Implementation

## Overview

Full device registration and approval workflow spanning backend API, admin portal, and mobile app. Employees submit device registration requests from their phone; admins approve or reject from the portal; approved employees can sign in.

---

## Architecture

### Data Flow

```
Employee (Mobile)
  → Login → AUTH_004 (device not registered)
  → DeviceNotRegisteredScreen: collect device info + password
  → POST /api/v1/auth/device-request
  → DeviceAwaitingRegistrationScreen: polling every 30s

Admin (Portal)
  → /devices/requests page (or Employee Detail → Device tab)
  → Approve / Reject with note/reason
  → PATCH /api/v1/devices/requests/:id/approve (or /reject)

Employee (Mobile)
  → Polling detects status=approved
  → Redirected to /login → signs in successfully
```

### Fingerprint Double-Hash

- Mobile: `deviceFingerprint = SHA-256(deviceId|model|brand|serialNumber)`
- Backend stores: `fingerprintHash = sha256(deviceFingerprint)`
- Login comparison: `sha256(incoming) === stored`
- Status check: mobile sends raw `deviceFingerprint`, backend hashes before query
- Approval: copies `req.fingerprintHash` directly to `user.registeredDevice` — no re-hashing

---

## Files Created / Modified

### Backend — Models

**`apps/admin/src/models/DeviceRequest.ts`** (existed, verified complete)
- Full metadata: deviceName, manufacturer, deviceModel, androidVersion, appVersion, buildNumber, timezone, language, screenResolution, batteryLevel (optional), requestIp, platform
- Status: `pending | approved | rejected`
- Type: `first_device | replacement`
- TTL index on `expiresAt` (7-day expiry for pending requests)
- 5 indexes: TTL, userId+status, fingerprintHash+status, status+requestedAt, email+fingerprintHash
- Idempotent: re-submission increments `requestCount`, does not duplicate

**`apps/admin/src/models/User.ts`** (modified)
- Added `IDeviceHistoryEntry` interface: fingerprintHash, deviceName, platform, registeredAt, revokedAt, revokedBy, revokedReason
- Added `DeviceHistoryEntrySchema` (no `_id`)
- Added `deviceHistory: IDeviceHistoryEntry[]` field to `IUser` and `UserSchema`

**`apps/admin/src/models/index.ts`** (modified)
- Added exports: `DeviceRequest`, `IDeviceRequest`, `IDeviceHistoryEntry`

### Backend — Services

**`apps/admin/src/services/DeviceService.ts`** (created)
- `submitRequest()`: bcrypt verify password, sha256 fingerprint, idempotent create/update, audit, fire-and-forget admin email
- `getRequestStatus()`: always returns 200 (not_found|pending|approved|rejected), prevents enumeration
- `approveRequest()`: mongoose transaction — push old device to history + revoke sessions (replacement), set new `registeredDevice`, dual audit (DEVICE_REQUEST_APPROVED + DEVICE_REGISTERED)
- `rejectRequest()`: mark rejected, write DEVICE_REQUEST_REJECTED audit
- `listRequests()`: paginated, filterable by status/userId/search
- `listRegisteredDevices()`: paginated list of employees with active device
- `getDeviceHistory()`: returns registeredDevice + deviceHistory for an employee
- `countPendingRequests()`: for sidebar badge
- `_notifyAdmins()`: fire-and-forget email to all active admins with portal link

**`apps/admin/src/services/EmployeeService.ts`** (modified)
- `registerDevice()`: now calls `findById` first, pushes old device to `deviceHistory` if replacement, then `updateOne` with new device
- `resetDevice()`: pushes current device to `deviceHistory` with `revokedReason: 'admin_reset'`, audit action changed `DEVICE_RESET` → `DEVICE_REVOKED`

### Backend — Validators

**`apps/admin/src/validators/device.ts`** (created)
- `SubmitDeviceRequestSchema`: full device metadata + password
- `GetDeviceRequestStatusSchema`: email + deviceFingerprint
- `ListDeviceRequestsSchema`: status, page, limit, search, userId
- `ApproveDeviceRequestSchema`: optional approvalNote
- `RejectDeviceRequestSchema`: required rejectionReason (min 10 chars)
- `ListRegisteredDevicesSchema`: page, limit, search

### Backend — Rate Limiting

**`apps/admin/src/middleware/rateLimiter.ts`** (modified)
- Added `deviceRequestLimiter`: sliding window 3 requests per 24h
- Used with dual-key strategy: `email:{email}` AND `ip:{ip}`

### Backend — API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/device-request` | None | Submit device registration request |
| GET | `/api/v1/auth/device-request/status` | None | Poll request status |
| GET | `/api/v1/devices/requests` | Admin | List device requests (paginated, filterable) |
| PATCH | `/api/v1/devices/requests/:id/approve` | Admin | Approve request |
| PATCH | `/api/v1/devices/requests/:id/reject` | Admin | Reject request |
| GET | `/api/v1/devices/requests/count` | Admin | Count pending requests (sidebar badge) |
| GET | `/api/v1/devices` | Admin | List employees with registered devices |
| GET | `/api/v1/devices/history` | Admin | Get device history for an employee |

POST `/api/v1/auth/device-request`:
- Applies `authLimiter` (10/min on IP) first
- Then `deviceRequestLimiter` on both email key and IP key
- Returns 201 for new/updated request, 200 for `already_approved`

### Admin Portal

**`apps/admin/src/types/api.ts`** (modified)
- Added `DeviceRequestItem`, `RegisteredDeviceItem`, `DeviceHistoryItem` interfaces

**`apps/admin/src/hooks/useDeviceRequests.ts`** (created)
- `useDeviceRequests(params)`: SWR hook, `refreshInterval: 30_000`
- `usePendingDeviceRequestCount()`: SWR hook for sidebar badge

**`apps/admin/src/hooks/useSidebarCounts.ts`** (modified)
- Added `pendingDevices` counter polling `/api/v1/devices/requests/count` every 30s

**`apps/admin/src/components/layout/Sidebar.tsx`** (modified)
- Added `Smartphone` icon import
- Added "Device Requests" nav item with `pendingDevices` badge key
- Updated `BadgeKey` type to include `pendingDevices`

**`apps/admin/src/app/(portal)/devices/requests/page.tsx`** (created)
- Tab navigation: pending / approved / rejected
- Search input (email, device name, manufacturer)
- Table: employee, device info, type badge (replacement shows amber AlertTriangle), fingerprint prefix, requested date, status
- Approve dialog: optional note, replacement warning
- Reject dialog: required reason (min 10 chars)
- Pagination
- SWR auto-refresh every 30s

**`apps/admin/src/app/(portal)/employees/[id]/page.tsx`** (modified)
- Added `DeviceSection` component below employee details
- Shows registered device (fingerprint, platform, registration date) or "no device"
- Shows pending requests inline with Approve/Reject buttons
- Shows device history table (all past devices with revocation reason)
- Revoke Device button → calls `/api/v1/employees/:id/reset-device`

### Mobile App

**`apps/mobile/pubspec.yaml`** (modified)
- Added `package_info_plus: ^8.1.0`

**`apps/mobile/lib/core/constants/api_endpoints.dart`** (modified)
- Added `deviceRequest = '/api/v1/auth/device-request'`
- Added `deviceRequestStatus = '/api/v1/auth/device-request/status'`

**`apps/mobile/lib/features/auth/data/sources/auth_remote_source.dart`** (modified)
- Added `submitDeviceRequest(body)`: POST to `/api/v1/auth/device-request`
- Added `checkDeviceRequestStatus(email, deviceFingerprint)`: GET with query params

**`apps/mobile/lib/features/auth/data/repositories/auth_repository.dart`** (modified)
- Added `submitDeviceRequest(body)`: delegates to source
- Added `checkDeviceRequestStatus(email, deviceFingerprint)`: returns status string

**`apps/mobile/lib/features/device_registration/providers/device_request_provider.dart`** (created)
- `DeviceRequestState`: status enum (idle/submitting/pending/approved/rejected/error)
- `DeviceRequestNotifier`:
  - `submitRequest()`: submit API, transition to pending or approved
  - `startPollingExisting()`: for resuming from AwaitingScreen without re-submitting
  - `_startPolling()`: `Timer.periodic(Duration(seconds: 30))` polling
  - `pollOnce()`: manual check-now button
  - Auto-cancel timer on dispose
- `deviceRequestProvider`: `StateNotifierProvider.autoDispose`

**`apps/mobile/lib/features/device_registration/presentation/screens/device_not_registered_screen.dart`** (modified)
- Accepts `email` parameter from GoRouter extra
- Password field for re-authentication
- "Request Approval" button: collects full device info (device_info_plus + package_info_plus), submits request
- Collects: deviceName, manufacturer, deviceModel, androidVersion, appVersion, buildNumber, timezone, language, screenResolution, platform
- Screen size captured before async gaps (fixes `use_build_context_synchronously`)
- On success → navigates to AwaitingScreen; already_approved → back to login

**`apps/mobile/lib/features/device_registration/presentation/screens/device_awaiting_registration_screen.dart`** (modified)
- Accepts `email` parameter from GoRouter extra
- Starts polling via `deviceRequestProvider` on init
- Auto-navigates to login on approved, to deviceMismatch on rejected
- "Check Now" button for manual poll
- Spinner UI showing polling is active

**`apps/mobile/lib/features/device_registration/presentation/screens/device_mismatch_screen.dart`** (modified)
- Accepts `email` parameter from GoRouter extra
- "Request Replacement" / "Register This Device" CTA → navigates to DeviceNotRegisteredScreen with email

**`apps/mobile/lib/features/auth/presentation/screens/login_screen.dart`** (modified)
- On AUTH_004/AUTH_005, passes `{'email': email}` as GoRouter extra when navigating to device screens

**`apps/mobile/lib/core/router/app_router.dart`** (modified)
- Device routes extract `email` from `state.extra` and pass to screen constructors

---

## Quality Gates

| Gate | Result |
|------|--------|
| `npm run lint` | ✅ 0 issues |
| `npm run build` | ✅ Compiled successfully (Turbopack) |
| `npm run test` | ✅ 286/286 passed |
| `flutter analyze` | ✅ No issues found |
| `flutter test` | ✅ 97/97 passed |
| `flutter build apk --debug` | ✅ Built app-debug.apk |

---

## End-to-End Runtime Verification

To verify the complete flow:

### 1. Employee Login (device not registered)
```
POST /api/v1/auth/login
→ 400 AUTH_004 (DEVICE_NOT_REGISTERED)
→ Mobile: DeviceNotRegisteredScreen shown with email pre-filled
```

### 2. Employee Submits Request
```
POST /api/v1/auth/device-request
Body: { email, password, deviceFingerprint, deviceName, manufacturer, deviceModel,
        androidVersion, appVersion, buildNumber, timezone, language, screenResolution, platform }
→ 201 { status: 'pending', requestId: '...' }

MongoDB: db.devicerequests.findOne({ email: 'employee@co.com' })
→ { status: 'pending', type: 'first_device', fingerprintHash: '...', ... }
```

### 3. Admin Reviews
```
Admin portal: /devices/requests (pending tab)
→ Sees employee's request with device info
→ Clicks Approve
PATCH /api/v1/devices/requests/:id/approve
→ 200 { message: 'Device request approved...' }

MongoDB: db.users.findOne({ email: 'employee@co.com' })
→ { registeredDevice: { fingerprintHash: '...', registeredAt: ISODate, ... } }
MongoDB: db.devicerequests.findOne({ _id: ObjectId('...') })
→ { status: 'approved', reviewedAt: ISODate, reviewedBy: ObjectId('admin...') }
```

### 4. Employee Polling Detects Approval
```
GET /api/v1/auth/device-request/status?email=employee@co.com&deviceFingerprint=<raw>
→ 200 { data: { status: 'approved' } }
→ Mobile: auto-navigate to /login
```

### 5. Employee Signs In
```
POST /api/v1/auth/login
→ 200 { accessToken, refreshToken, sessionId, employee: {...} }
→ Mobile: home screen
```

---

## Key Design Decisions

- **No FCM before first login**: Polling (`Timer.periodic(30s)`) used instead
- **Password re-prompt (Option B)**: `DeviceNotRegisteredScreen` re-prompts — no credentials through router state
- **Approval does not re-hash**: `approveRequest()` sets `user.registeredDevice.fingerprintHash = req.fingerprintHash` directly (already hashed)
- **Idempotent submission**: second request for same `(userId, fingerprintHash)` with status=pending increments `requestCount`, does not duplicate
- **Rate limiting dual-key**: `email:{email}` AND `ip:{ip}` — both checked, first hit wins
- **Replacement flow**: approving a replacement pushes old device to `deviceHistory`, revokes all `DeviceSession` records, then sets new device — all in a single mongoose transaction
- **Always-200 status endpoint**: prevents device fingerprint enumeration

---

## Next Phase

**Phase 15.23 — Workforce Tracking** may begin after runtime verification confirms:
- Employee can log in after device approval
- MongoDB state matches expected schema at each step
- No regressions in existing auth/attendance flows
