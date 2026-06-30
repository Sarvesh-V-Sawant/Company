# 07 — Implementation Roadmap
**Workforce Management Platform**
Baseline: All design specifications approved (docs/01 through docs/06)
Date: 2026-06-14
Status: **v1.1 — Pending final approval — do not scaffold yet**
Remediation: `docs/07.2-roadmap-remediation.md` (4 HIGH findings resolved)

---

## 0. Baseline Reference

| Document | Version | Status |
|---|---|---|
| `01-system-architecture.md` | v1.1 | Approved |
| `02-database-design.md` | v1.2 | Approved |
| `03-testing-strategy.md` | v1.1 | Approved |
| `04-api-specification.md` | v1.1 + gap patches | Approved |
| `05-admin-ui-ux.md` | v1.1 | Approved |
| `06-mobile-ui-ux.md` | v1.1 | Approved |
| `06.2-api-gap-analysis.md` | v1.0 | Pending API spec merge |

**Stack:**
- Admin: Next.js 16.2.9 App Router · React 19.2.4 · TypeScript 5 · shadcn/ui · Tailwind CSS 4
- Mobile: Flutter 3.x · Riverpod 2.x · GoRouter · Dio
- DB: MongoDB Atlas M10+ · Mongoose 8.x
- Auth: `jose` JWT · `bcryptjs` · Upstash Redis (rate limit)
- Push: Firebase Admin SDK (FCM)
- Email: Brevo REST API
- Deploy: Vercel · `vercel.ts` cron

---

## 1. Phase Overview

| Phase | Name | Complexity | Parallel With |
|---|---|---|---|
| 1 | Foundation | Medium | — |
| 2 | Authentication | High | — |
| 2.5 | Settings Bootstrap | Low | — |
| 3 | Employee Management | Medium | — |
| 4 | Attendance Engine | Very High | — |
| 5 | Leave Management | High | — |
| 6 | Regularization | Medium | 5 (partial) |
| 7 | Payroll Assistance | Very High | — |
| 8 | Notifications & Audit | Medium | 7 (partial) |
| 9 | Reports | Medium | 8 |
| 10 | Admin Portal | High | 11 |
| 11 | Mobile App | High | 10 |
| 12 | Testing & Hardening | High | — |

---

## 2. Phase Definitions

---

### Phase 1 — Foundation

**Goal:** Establish project skeleton, tooling, environment, database connectivity, shared utilities, and CI/CD pipeline before any business logic is written.

**Deliverables:**
- Monorepo structure: `apps/admin` (Next.js), `apps/mobile` (Flutter), `packages/` shared types
- `vercel.ts` project config with all 6 cron stubs (each returns 200 immediately; UTC expressions correct per Section 5.2 Cron Schedule Matrix)
- Environment variable structure (`.env.local`, Vercel env vars)
- MongoDB Atlas cluster provisioned (M10); database + user created
- Upstash Redis instance provisioned
- Firebase project created; Admin SDK credentials stored in env
- Brevo account configured; sender domain verified
- Mongoose connection module with retry logic
- Base error response format `{ success, error: { code, message, details } }`
- HTTP client wrapper (admin: `fetch` with interceptor; mobile: `Dio` with `DioInterceptor`)
- Shared TypeScript types for API contracts (`packages/types`)
- ESLint + Prettier (admin); `flutter analyze` + `dart format` (mobile)
- GitHub Actions CI: lint → type-check → test (stub) on every PR
- Vercel project linked; preview deployments on PR

**Dependencies:** None — this is the start.

**Risks:**
- Atlas M10 provisioning delay (managed; plan for 24h)
- Firebase project naming conflicts if org has existing projects
- Brevo sender domain DNS propagation (24–72h; start immediately)

**Validation Criteria:**
- `GET /api/v1/health` returns `{ status: "ok", db: "connected", redis: "connected" }`
- Vercel preview URL live for admin app shell (no routes yet)
- Flutter app builds on Android with no errors
- CI pipeline green on empty repo

**Estimated Complexity:** Medium (2–3 days solo / 1 day small team)

---

### Phase 2 — Authentication

**Goal:** Implement complete auth system: login, logout, JWT lifecycle, refresh tokens, forced password change, rate limiting, device fingerprint validation, and all auth API endpoints.

**Deliverables:**

*Backend (API):*
- `POST /api/v1/auth/login` with bcrypt verify, JWT issue (access + refresh), device fingerprint check
- `AUTH_011 NO_DEVICE_REGISTERED` error code (from gap analysis G-001)
- `POST /api/v1/auth/refresh` with 30d inactivity / 90d absolute token rotation
- `POST /api/v1/auth/logout` with refresh token revocation
- `POST /api/v1/auth/forgot-password` (anti-enumeration: always 200)
- `POST /api/v1/auth/reset-password` (SHA-256 hashed token in DB, 1h TTL)
- `PATCH /api/v1/auth/me/password` with forced change flow (`requiresPasswordChange` JWT claim)
- `GET /api/v1/auth/me` — current user profile
- `PATCH /api/v1/auth/me/fcm-token` (gap G-002) — FCM token store/clear
- Upstash Redis rate limiter middleware (`authLimiter`: 5 req/15min per IP)
- JWT middleware (`requireAuth`, `requireRole('admin')`, `requireRole('employee')`)
- Restricted mode middleware: only 3 endpoints accessible when `requiresPasswordChange: true`
- CSRF token generation + validation middleware
- `X-Device-Fingerprint` header validation (64-char hex)
- Password reset email via Brevo REST API
- `AuditLog` Mongoose model + `AuditMiddleware` stub — model defined here; middleware wired to all admin mutation routes from Phase 3 onward; full implementation (routes, queries) in Phase 8
- `scripts/seed-admin.ts` — reads `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` from env; creates `users` + `employees` records; idempotent; sets `requiresPasswordChange: true` (full spec in Section 5.3)
- `scripts/seed-settings.ts` stub — created here, implemented in Phase 2.5
- `npm run seed:admin` and `npm run seed:settings` scripts in `package.json`

*Admin (Next.js):*
- `AuthShell` layout for pre-auth screens
- Login page `/login` with rate-limit countdown, AUTH_00x error mapping
- Forgot Password page `/forgot-password` (anti-enumeration UX)
- Reset Password page `/reset-password` (live requirement indicators)
- Force Change Password page `/change-password` (`RestrictedShell`)
- `SessionExpiredOverlay` component (non-dismissible, `position:fixed`, `z-index:9999`)
- Next.js middleware guard: Maintenance → requiresPasswordChange → Unauthenticated → Role → CSRF
- `AuthContext` + API client with interceptor (auto-refresh, session expiry detection)
- SWR config with global `onError` handler

*Mobile (Flutter):*
- `AuthNotifier` (`AsyncNotifier`) with login, logout, refresh, device state handling
- Login screen with `AUTH_011`/`ATT_003` routing
- Forgot Password screen
- Reset Password screen (deep link via `app_links`)
- Force Change Password screen (GoRouter `redirect` guard)
- `DioInterceptor` (auto-refresh, 401/403 routing, device error routing)
- `flutter_secure_storage` setup: token + fingerprint storage
- `hadRegisteredDevice` SharedPreferences flag write on first login
- Device Not Registered screen (`/device-not-registered`) — Section 0.7
- Device Awaiting Registration screen (`/device-awaiting-registration`) — Section 0.8
- FCM Notification Permission Rationale screen — Section 7.4 (`FcmTokenService`)
- `FcmTokenService`: `registerToken()`, `refreshToken()`, `clearToken()`

**Dependencies:** Phase 1 complete.

**Must Build Before:** All other phases (auth is the gateway).

**Risks:**
- JWT `jose` library breaking changes from Next.js 16 bundler (test early)
- Brevo transactional email deliverability — test with real email addresses before treating as done
- `flutter_secure_storage` Android Keystore initialization fails on emulator (use physical device for auth testing)
- SHA-256 reset token: confirm Node.js `crypto` module available in Vercel Fluid Compute (it is, but verify)

**Validation Criteria:**
- All 10 auth endpoints return correct responses per `04-api-specification.md`
- Rate limiter blocks on 6th request within 15min; unblocks after window
- `requiresPasswordChange: true` token can only access 3 endpoints
- `AUTH_011` returned when `registeredDeviceHash === null`; `ATT_003` when hash mismatch
- Brevo sends password reset email (verified in test inbox, not spam)
- Admin: Login → Forgot → Reset flow works end-to-end in browser
- Admin: Session expired overlay appears on 401; clears on re-login
- Mobile: Login → Force Change → Home navigation works
- Mobile: Device Not Registered screen appears on `AUTH_011`
- All auth unit tests pass (per `03-testing-strategy.md` auth test matrix)
- `npm run seed:admin` creates admin user in dev; forced password change flow verified in browser end-to-end

**Estimated Complexity:** High (5–7 days solo / 2–3 days small team)

---

### Phase 2.5 — Settings Bootstrap

**Goal:** Bootstrap the `companySettings` document, implement all settings read endpoints, and seed defaults before any business domain (attendance, leave, regularization) is built. Write endpoints remain in Phase 10 (Admin Portal UI). This phase exists because Phase 4 and Phase 5 engines cannot operate without settings data.

**Why all business domains depend on this phase:**

| Domain | Dependency | Specific Setting Field |
|---|---|---|
| Attendance check-in | Geo-fence validation | `geoFenceEnabled`, `geoFenceCenter`, `geoFenceRadiusMeters`, `gpsAccuracyThresholdMeters` |
| Attendance day status | Weekend detection | `workingDays` |
| Attendance day status | Half-day threshold | `requiredDailyMinutes` |
| Attendance session | Shift boundary for auto-close | `shiftStartTime`, `shiftEndTime` |
| Leave apply | Valid leave type list | `leaveTypes[].code`, `leaveTypes[].isActive` |
| Leave apply | Holiday calendar (no leave on holiday) | `holidays[]` |
| Leave balance | Annual quota per type | `leaveTypes[].annualQuota` |
| Leave rollover | Carry-forward cap | `leaveTypes[].maxCarryForwardDays` |
| Leave year allocation | Year boundary | `leaveYearStartMonth` |
| Leave carry-forward expiry | Expiry month | `leaveTypes[].carryForwardExpiryMonth` |
| Regularization | Allowed date window | `maxRegularizationDaysBack` |
| Mobile leave form | Date picker disabling holidays | `holidays[]` |
| Mobile settings cache | All mobile forms read from Hive | Full settings document |

**Deliverables:**

*Mongoose Model (`CompanySettings`) — single-document collection:*
```typescript
{
  companyName: String,
  companyTimezone: String,           // default: 'Asia/Kolkata'
  shiftStartTime: String,            // 'HH:MM' 24h, default: '09:00'
  shiftEndTime: String,              // 'HH:MM' 24h, default: '18:00'
  requiredDailyMinutes: Number,      // default: 480 (8h)
  breakMinutes: Number,              // default: 60
  workingDays: [String],             // ['MON','TUE','WED','THU','FRI']
  geoFenceEnabled: Boolean,          // default: false
  geoFenceCenter: { lat: Number, lng: Number },
  geoFenceRadiusMeters: Number,      // default: 100
  gpsAccuracyThresholdMeters: Number,// default: 50
  leaveTypes: [{
    code: String,                    // 'PL' | 'CL' | 'SL' | 'LWP'
    name: String,
    isPaid: Boolean,
    annualQuota: Number,
    maxCarryForwardDays: Number,
    carryForwardExpiryMonth: Number, // 1-12; 0 = no expiry
    isActive: Boolean,
  }],
  leaveYearStartMonth: Number,       // 1-12, default: 1
  maxRegularizationDaysBack: Number, // default: 7
  holidays: [{
    date: String,                    // 'YYYY-MM-DD'
    name: String,
    type: String,                    // 'national' | 'restricted'
    isActive: Boolean,
  }],
  updatedAt: Date,
  updatedBy: ObjectId,
}
```

*Backend (`SettingsRepository`, `SettingsService`):*
```
Repository: SettingsRepository (findSettings, updateSettings, addHoliday, removeHoliday, updateLeaveType)
Service:    SettingsService (getSettings, getHolidays, getLeaveTypes, getGeoFenceConfig, getShiftConfig, getWorkingDays, seedDefaults)
Seed:       scripts/seed-settings.ts — idempotent; no-op if companySettings document exists
```

*Read Endpoints (Phase 2.5 — auth required, both admin + employee role):*
```
GET /api/v1/settings/company        → full settings document
GET /api/v1/settings/holidays       → holidays array (?year=YYYY filter)
GET /api/v1/settings/leave-types    → active leave types
GET /api/v1/settings/geofence       → geo-fence config
GET /api/v1/settings/shift          → shift config
GET /api/v1/settings/working-days   → working days array
```

*Write Endpoints (Phase 10 — admin only; NOT built in this phase):*
```
PATCH /api/v1/settings/company
POST  /api/v1/settings/holidays
DELETE /api/v1/settings/holidays/:id
PATCH /api/v1/settings/leave-types/:code
PATCH /api/v1/settings/geofence
PATCH /api/v1/settings/shift
PATCH /api/v1/settings/working-days
```

**Dependencies:** Phase 2 complete (auth middleware required for all settings endpoints).

**Must Build Before:** Phase 3, 4, 5, 6 (all business domains depend on settings data).

**Risks:**
- Settings document not seeded before Phase 4 build: geo-fence service will throw on `findOne({})` returning null — add null guard in `SettingsService.getSettings()` with helpful error message
- Changing `leaveYearStartMonth` after Phase 5 is built: existing allocations unaffected; new employees use new year start; migration note in admin UI (Phase 10)

**Validation Criteria (TC-02.5):**
- `GET /settings/company` returns seeded defaults (not null)
- `GET /settings/leave-types` returns 4 default types (PL, CL, SL, LWP)
- `GET /settings/holidays` returns empty array (admin populates in Phase 10)
- `GET /settings/geofence` returns `{ enabled: false, center: null, radiusMeters: 100 }`
- `npm run seed:settings` is idempotent (run twice = same document, no duplicates)
- Employee role JWT can read all settings endpoints; cannot call PATCH endpoints (405)

**Estimated Complexity:** Low (1–2 days solo / <1 day small team)

---

### Phase 3 — Employee Management

**Goal:** Implement employee CRUD, device registration, temp password generation, activation/deactivation, and role management.

**Deliverables:**

*Backend (API):*
- `POST /api/v1/employees` — create with temp password (bcrypt), trigger Brevo welcome email
- `GET /api/v1/employees` — list with filters (status, search, pagination)
- `GET /api/v1/employees/:id` — single employee detail
- `PATCH /api/v1/employees/:id` — update profile fields
- `PATCH /api/v1/employees/:id/status` — activate / deactivate
- `POST /api/v1/employees/:id/device` — register device fingerprint
- `DELETE /api/v1/employees/:id/device` — reset device
- `POST /api/v1/employees/:id/reset-password` — admin-initiated temp password reset
- Mongoose `Employee` model (per `02-database-design.md`)
- Employee repository with indexed queries
- Temp password generator (8-char alphanumeric, cryptographically random)
- Welcome email + temp password email via Brevo

*Admin (Next.js):*
- Employee List page with DataTable (TanStack Table v8): search, filter by status, pagination
- Create Employee drawer (Sheet) with form (React Hook Form + Zod) — temp password in non-dismissible modal (R-UI-005 condition)
- Edit Employee drawer
- Activate/Deactivate confirmation dialog
- Register Device modal (fingerprint input + confirm)
- Reset Device confirmation dialog
- Admin-initiated Reset Password confirmation dialog
- Employee detail view (read-only)
- `<UnsavedChangesDialog>` shared component (R-UI-009 condition — build this first)

**Dependencies:** Phase 2 complete (auth middleware), Phase 2.5 complete (settings data available; employee validation may reference company settings).

**Must Build Before:** Attendance (requires employees), Leave (requires employees), Payroll (requires employees).

**Risks:**
- Brevo transactional email for temp password — ensure temp password not logged server-side
- Device fingerprint registration: admin must have employee's physical device fingerprint — UX requires out-of-band communication; spec that flow clearly in admin drawer

**Validation Criteria:**
- Create employee → Brevo email received with temp password
- Employee logs in with temp password → forced change required
- Device register → employee can log in from registered device
- Device reset → employee gets `AUTH_011` on next login
- Deactivated employee login returns `AUTH_003` (per API spec)
- All employee unit tests pass (per testing strategy)
- Admin: full CRUD flow works in browser; all drawers/modals render correctly

**Estimated Complexity:** Medium (3–4 days solo / 1–2 days small team)

---

### Phase 4 — Attendance Engine

**Goal:** Implement full attendance system: check-in/out, multi-session support, GPS/geo-fence validation, state machine, idempotency, server reconciliation, cron reminders, and admin attendance views.

**Deliverables:**

*Backend (API):*
- `POST /api/v1/attendance/checkin` — with GPS coords, geo-fence validation, nonce (idempotency), device fingerprint
- `POST /api/v1/attendance/checkout` — closes active session; `ATT_004` if not checked in
- `GET /api/v1/attendance/today` — employee-scoped response with all fields from gap G-003
- `GET /api/v1/attendance` — history with date range filters, pagination
- `GET /api/v1/attendance/:employeeId` — admin: single employee history
- `GET /api/v1/attendance/daily` — admin: all employees for a date
- `GET /api/v1/attendance/weekly` — admin: all employees for a week
- `GET /api/v1/attendance/monthly` — admin: all employees for a month
- `PATCH /api/v1/attendance/:id/correct` — admin attendance correction
- `X-Idempotency-Key` Redis middleware for POST endpoints (gap G-004)
- `BR-ATT-NEW`: multi-session per day (gap G-005 clarification implemented)
- Geo-fence distance calculation (Haversine formula)
- Vercel cron: `POST /api/cron/attendance-reminder` — daily at 09:00 IST (FCM + push)
- `systemEvents` collection write for cron idempotency guard
- `AttendanceRecord` + `AttendanceSession` Mongoose models
- Day status computation: `present | half-day | absent | leave | holiday | weekend`

*Admin (Next.js):*
- Attendance Daily View: all employees, date picker, status columns
- Attendance Weekly View: grid with `@tanstack/react-virtual` (R-UI-006 — virtualization required)
- Attendance Monthly View: summary cards per employee
- Employee Attendance View: single employee drill-down
- Attendance Correction drawer (admin override)

*Mobile (Flutter):*
- `AttendanceNotifier` (`AsyncNotifier`) with `reconcileWithServer()`
- Home screen attendance widget: all 5 states (IDLE, CHECKED_IN, CHECKED_OUT_PARTIAL, CHECKED_OUT_COMPLETE, RECONCILING)
- `AttendanceActionButton` widget — state-driven
- Live timer widget (`StreamBuilder` or `Ticker`)
- GPS accuracy widget + geo-fence violation screen
- GPS disabled screen + Permission denied screen
- Offline check-in queue (`pending_submissions` Hive box)
- `PendingSubmissionBanner` widget
- `AppLifecycleObserver` at root — triggers `reconcileWithServer()` on resume
- Attendance Weekly View screen
- Attendance Daily Detail screen
- Attendance History screen (infinite scroll, R-MOB-011 MEDIUM resolved here)
- `IdempotentFormMixin` — UUID v4 per submission, persisted in Hive
- Early checkout warning dialog (remaining > 2h)
- Re-check-in confirmation dialog (CHECKED_OUT_PARTIAL → second session)

**Dependencies:** Phase 3 complete (employees must exist). Phase 2 complete (device fingerprint in JWT). Phase 2.5 complete — geo-fence config, working days, `requiredDailyMinutes`, and `shiftEndTime` are all required by the attendance engine at implementation time.

**Must Build Before:** Payroll (attendance data drives compute), Regularization (references attendance records).

**Risks:**
- Geo-fence accuracy on Android varies by device GPS hardware — add configurable `accuracyThresholdMeters` in `companySettings`
- Multi-session same-day: ensure `AttendanceRecord` uniqueness index is date + employeeId, not date + employeeId + session
- Cron: Vercel `vercel.ts` cron fires at UTC; must offset to IST (UTC+5:30) — test timezone handling explicitly
- Idempotency Redis key TTL: 24h per spec; ensure key namespaced by `userId:key` not just `key`
- State reconciliation on slow network: RECONCILING shimmer must cancel cleanly if fetch fails

**Validation Criteria:**
- Check-in → check-out → re-check-in → check-out creates 2 sessions in same day
- Same nonce on retry returns original response (idempotency)
- Outside geo-fence → 403 with `ATT_001` (or similar)
- App killed during check-in → reopen → CHECKED_IN state restored from server
- `totalMinutesToday` correct after 2 sessions
- `dayStatus` = `present` when `totalMinutesToday >= requiredDailyMinutes - 30`
- `dayStatus` = `half-day` at threshold
- Cron fires and sends FCM to checked-out employees (test with manual trigger)
- All attendance unit + integration tests pass

**Estimated Complexity:** Very High (8–10 days solo / 3–4 days small team)

---

### Phase 5 — Leave Management

**Goal:** Implement leave application, approval/rejection, balance tracking, leave year allocations, payroll conflict detection, and revocation workflow.

**Deliverables:**

*Backend (API):*
- `GET /api/v1/leaves/balance` — employee's current balances (all types)
- `POST /api/v1/leaves` — apply leave (with `X-Idempotency-Key`)
- `GET /api/v1/leaves` — employee history; admin: all employees with filters
- `GET /api/v1/leaves/:id` — single leave detail
- `PATCH /api/v1/leaves/:id/cancel` — employee cancel pending leave
- `PATCH /api/v1/leaves/:id/approve` — admin approve
- `PATCH /api/v1/leaves/:id/reject` — admin reject with reason
- `PATCH /api/v1/leaves/:id/revoke` — admin revoke approved leave (pre-check payroll status)
- Leave balance deduction logic (`LeaveTransaction` write on approval)
- Leave year allocation seeding (`leaveYearAllocations` collection; cron for new year)
- Half-day leave support (AM/PM split)
- LWP (Leave Without Pay) — no balance deduction, flag on payroll
- Payroll conflict pre-check: `meta.staleEmployeeIds` logic triggered on revocation
- Brevo email on approve/reject/revoke
- FCM push on approve/reject (via `FcmTokenService` server-side)
- `PATCH /api/v1/leaves/:id/revoke` admin override acknowledgment
- Vercel cron: `POST /api/cron/leave-year-rollover` — Jan 1 (or configured month) carry-forward

*Admin (Next.js):*
- Leave Pending Approvals page (DataTable with bulk approve)
- Leave History page (all employees, filters)
- Leave Balances page (per employee, type breakdown)
- Revoke Leave modal — Variant A (no conflict) + Variant B (payroll finalized, amber warning)
- `PayrollStaleBanner` (amber, `meta.staleEmployeeIds`)

*Mobile (Flutter):*
- Leave Balance screen (per type + carry-forward + used + remaining)
- Apply Leave form (full-day, multi-day, half-day AM/PM, type selection)
- Leave History screen
- Leave Detail screen (with cancel CTA for pending)
- Cancel Leave confirmation dialog
- R-MOB-006: Change password current-password field added to Profile/Auth (condition — resolve here)
- R-MOB-007: Holiday cache refresh on Apply Leave form open (condition — resolve here)
- R-MOB-012: Leave year boundary cache invalidation (condition — resolve here)

**Dependencies:** Phase 3 (employees), Phase 4 (attendance — for dayStatus check on leave days), Phase 2 (FCM token endpoint), Phase 2.5 — `leaveTypes`, `holidays`, `leaveYearStartMonth`, and `maxCarryForwardDays` all required for leave validation and balance computation.

**Can Build Parallel With:** Phase 6 (Regularization) after Phase 4 backend is done.

**Risks:**
- Leave year boundary: carry-forward calculation must be correct and idempotent (cron runs once)
- Half-day + attendance on same day: edge case — employee applies AM leave, checks in at PM. Define rule: attendance present for PM counts as half-day present regardless of leave.
- LWP payroll integration: ensure LWP flag propagates to payroll compute
- `PayrollStaleBanner` requires `meta.staleEmployeeIds` in payroll list response — this field must be implemented in Phase 7

**Validation Criteria:**
- Apply leave → balance deducted on approval → balance restored on rejection/revocation
- LWP apply → balance not deducted → LWP flag in payroll record
- Half-day leave → 0.5 days deducted from balance
- Revoke + payroll finalized → Variant B modal shown → stale banner appears
- Leave year rollover cron: carry-forward computed correctly, max carry-forward cap applied
- Brevo + FCM notifications delivered on approve/reject
- Admin bulk approve: 10 leaves approved in one action
- All leave unit + integration tests pass

**Estimated Complexity:** High (5–7 days solo / 2–3 days small team)

---

### Phase 6 — Regularization

**Goal:** Implement regularization requests (missed check-in/out, work away, client visit, etc.), approval/rejection workflow, and admin correction integration.

**Deliverables:**

*Backend (API):*
- `POST /api/v1/regularizations` — create request (with `X-Idempotency-Key`)
- `GET /api/v1/regularizations` — employee history; admin: all with filters
- `GET /api/v1/regularizations/:id` — single detail
- `PATCH /api/v1/regularizations/:id/withdraw` — employee withdraw pending
- `PATCH /api/v1/regularizations/:id/approve` — admin approve + auto-correct attendance record
- `PATCH /api/v1/regularizations/:id/reject` — admin reject with reason
- Regularization types: `FORGOT_CHECKIN | FORGOT_CHECKOUT | WORK_AWAY | CLIENT_VISIT | OFFICIAL_TRAVEL | MANAGEMENT_DUTY`
- On approve: write corrected `AttendanceSession` into `AttendanceRecord`; recalculate `dayStatus`
- Brevo email + FCM push on approve/reject
- `Regularization` Mongoose model

*Admin (Next.js):*
- Regularization Pending page (DataTable with approve/reject actions)
- Regularization History page (all employees, filters)
- Approve drawer (view request detail + attendance context + approve/reject)

*Mobile (Flutter):*
- Create Regularization form (type, date, times, notes)
- Regularization History screen
- Regularization Detail screen (with withdraw CTA for pending)
- Withdraw confirmation dialog
- R-MOB-009: `companySettings` refresh on Regularization Create screen open (condition — resolve here)

**Dependencies:** Phase 4 (attendance records must exist to be corrected), Phase 2 (FCM + Brevo), Phase 2.5 (`maxRegularizationDaysBack` setting required for date-window validation).

**Can Build Parallel With:** Phase 5 back half (both only need Phase 4 backend complete).

**Risks:**
- Approve regularization modifying attendance: ensure `AttendanceRecord` update is atomic; no partial correction
- `dayStatus` recalculation after correction: must re-run same logic as Phase 4 day status engine
- Regularization for past dates: validate that correction date is within allowed window (e.g., ≤ 7 days ago); configure in `companySettings`

**Validation Criteria:**
- FORGOT_CHECKOUT regularization approved → `AttendanceSession.checkOutTimestamp` written → `dayStatus` recalculated
- WORK_AWAY approved → attendance record created for that date if absent
- Withdraw by employee → status `withdrawn` → no admin action possible
- FCM + Brevo delivered on approve/reject
- All regularization unit tests pass

**Estimated Complexity:** Medium (3–4 days solo / 1–2 days small team)

---

### Phase 7 — Payroll Assistance

**Goal:** Implement payroll computation engine, per-employee draft payroll, finalization, unfinalization, recompute, lock mechanism, stale detection, and payslip generation.

**Deliverables:**

*Backend (API):*
- `POST /api/v1/payroll/compute` — trigger bulk compute for a month; sets `isComputeLocked: true`
- `GET /api/v1/payroll` — list all employees' payroll for a month (`meta.isComputeLocked`, `meta.staleEmployeeIds`)
- `GET /api/v1/payroll/:employeeId` — single employee payroll detail
- `PATCH /api/v1/payroll/:employeeId/finalize` — mark employee payroll as final
- `PATCH /api/v1/payroll/:employeeId/unfinalize` — revert to draft
- `POST /api/v1/payroll/finalize-all` — bulk finalize all draft employees
- `GET /api/v1/payroll/:employeeId/payslip` — generate payslip (PDF or JSON)
- Payroll compute engine:
  - Attendance-based present days count (including partial)
  - LWP days deduction
  - Leave days classification (paid vs. LWP)
  - Gross salary prorate (present / working days × monthly gross)
  - Deductions placeholder (PF/ESI stub — not full statutory for v1)
  - Net pay = gross − deductions
- `meta.isComputeLocked`: set true during compute, false on complete/error
- `meta.staleEmployeeIds`: populated when leave revoked after payroll computed
- `PayrollRecord` + `PayrollItem` Mongoose models
- Concurrent compute guard: check Redis lock before starting; `409 COMPUTE_IN_PROGRESS`
- Vercel cron: `POST /api/cron/payroll-reminder` — admin reminder on last day of month
- `systemEvents` write for cron idempotency

*Admin (Next.js):*
- Payroll List page with DataTable (`meta.isComputeLocked` → disabled compute button)
- `PayrollComputeModal` — 6-state machine (B:Confirmation → C:InProgress → D:Success | E:Locked | F:PartialFailure | G:AllFinalised)
- `PayrollLockBanner` with SWR 10s refresh during compute
- `PayrollStaleBanner` (amber) when `meta.staleEmployeeIds` non-empty
- Per-employee payroll detail (breakdown cards)
- Finalize confirmation dialog
- Unfinalize (+ recompute + re-finalize) `PayrollReopenModal` — 3-step wizard
- Payslip view (print/download)

**Dependencies:** Phase 4 (attendance data), Phase 5 (leave data — LWP, approved leaves), Phase 3 (employee salary config).

**Must Build Before:** Phase 9 (payroll reports).

**Risks:**
- Payroll compute can take seconds on large employee sets — Vercel function timeout (300s max); plan pagination if >500 employees
- Redis compute lock: if Vercel function crashes mid-compute, lock remains set — implement lock TTL + admin manual unlock endpoint
- `staleEmployeeIds` logic: triggered by leave revocation in Phase 5; must be implemented as cross-phase concern (Phase 5 writes, Phase 7 reads)
- Payslip PDF generation: use `@react-pdf/renderer` or server-side HTML → PDF; evaluate package size for Vercel bundle

**Validation Criteria:**
- Compute triggered → `isComputeLocked: true` → second compute returns `409`
- Compute complete → `isComputeLocked: false` → payroll list populated
- Net pay formula verified against known input/output (test fixture)
- LWP leave → LWP days deducted from pay
- Finalize all → all `draft` → `finalized`; no further compute allowed
- Unfinalize → recompute → re-finalize 3-step wizard completes in admin
- `PayrollStaleBanner` appears after leave revocation when payroll already computed
- Partial failure (1 employee compute error) → F state in modal → retry succeeds
- All payroll unit + integration + concurrency tests pass

**Estimated Complexity:** Very High (8–10 days solo / 3–4 days small team)

---

### Phase 8 — Notifications & Audit Logs

**Goal:** Implement in-app notification list, FCM deep links, audit log capture, and admin notification/audit views.

**Deliverables:**

*Backend (API):*
- `GET /api/v1/notifications` — employee: own list with `read` filter; pagination
- `PATCH /api/v1/notifications/:id/read` — mark single read
- `PATCH /api/v1/notifications/read-all` — mark all read (bulk, per gap analysis from admin review)
- `GET /api/v1/notifications/count` — unread count (for badge)
- `GET /api/v1/audit-logs` — admin: list with date/action/actor filters
- `GET /api/v1/audit-logs/:id` — single event detail
- Audit log middleware: auto-write to `auditLogs` on every mutating admin action
- `Notification` Mongoose model
- `AuditLog` Mongoose model
- FCM deep link payload format: `{ type: 'LEAVE_APPROVED', entityId, path: '/leaves/:id' }`
- Notification creation service: called from Leave, Regularization, Attendance cron handlers

*Admin (Next.js):*
- Notifications page (admin's own notifications list + mark all read)
- Sidebar notification badge (SWR `refreshInterval: 120_000` + `revalidateOnFocus: true`)
- Audit Logs list page (DataTable with filters: date range, action type, actor)
- Audit Log detail drawer

*Mobile (Flutter):*
- Notifications list screen (grouped by date, unread indicator)
- Notification detail screen
- Bottom nav badge count (unread notifications)
- FCM cold start: `GET /notifications?read=false&count=true` on cold start (R-MOB-010 — condition resolved here)
- FCM deep link handler: `app_links` → GoRouter route push
- R-MOB-008: Deep link Play Store fallback (condition resolved here)

**Dependencies:** Phase 2 (FCM token endpoint), Phase 5 (leave notifications), Phase 6 (regularization notifications), Phase 7 (payroll notifications).

**Can Build Parallel With:** Phase 9 (Reports) — both are read-mostly and don't block each other.

**Risks:**
- FCM deep link on cold start: app may open to home, then deep link fires — ensure `app_links` initializer runs before first frame
- Audit log volume: high-traffic systems generate large audit collections — ensure `createdAt` TTL index (90d retention per database spec)
- Badge count SWR: `revalidateOnFocus: true` + 2min interval is acceptable; warn that React 19 Strict Mode double-fires effects

**Validation Criteria:**
- Leave approved → Notification created → FCM sent → mobile notification tapped → deep links to leave detail
- Mark all read → badge count = 0 → SWR revalidates within 2min
- Admin action → audit log entry written with correct actor, action, target, metadata
- Audit log list filterable by date + action
- All notification unit tests pass

**Estimated Complexity:** Medium (3–4 days solo / 1–2 days small team)

---

### Phase 9 — Reports

**Goal:** Implement attendance, leave, and payroll report generation with XLSX export.

**Deliverables:**

*Backend (API):*
- `GET /api/v1/reports/attendance` — filtered by date range, employee, department; returns XLSX
- `GET /api/v1/reports/leave` — filtered by leave type, year, employee; returns XLSX
- `GET /api/v1/reports/payroll` — filtered by month, status; returns XLSX
- XLSX generation via `exceljs` or `xlsx` package
- Report preview (first 50 rows JSON response) for admin UI preview
- Vercel function streaming for large XLSX (use `Response` with `ReadableStream`)

*Admin (Next.js):*
- Attendance Report page: date range picker, employee filter, preview table, export button
- Leave Report page: year/type filter, preview table, export button
- Payroll Report page: month picker, status filter, preview table, export button
- "Preview showing first 50 of N records" banner (R-UI-008 MEDIUM — resolve here)
- PDF deferral note in export dropdown (R-UI-015 LOW — resolve here)

**Dependencies:** Phase 4, 5, 7 (data must exist to report on).

**Can Build Parallel With:** Phase 8 (Notifications & Audit).

**Risks:**
- Large XLSX generation (1000+ rows) in Vercel function: stay within 300s timeout; add pagination or chunked streaming
- XLSX memory: `exceljs` streaming API vs. full-document; use streaming for >500 rows

**Validation Criteria:**
- Attendance report XLSX downloaded with correct columns and date range filter applied
- Leave report shows correct balances and statuses
- Payroll report shows all employees for selected month
- Preview table shows max 50 rows with count banner
- All report integration tests pass

**Estimated Complexity:** Medium (2–3 days solo / 1 day small team)

---

### Phase 10 — Admin Portal (Settings & Remaining UI)

**Goal:** Complete all remaining Admin Portal screens not covered in Phases 2–9: Company Settings, Working Days, Holidays, Leave Configuration, Geo-Fence, Shift Config, and all Settings confirmation guards.

**Deliverables:**

*Backend (API):*
- `GET /api/v1/settings/company` — fetch all company settings
- `PATCH /api/v1/settings/company` — update (with destructive field confirmation guards)
- `GET /api/v1/settings/holidays` — list holidays
- `POST /api/v1/settings/holidays` — add holiday
- `DELETE /api/v1/settings/holidays/:id` — remove holiday
- `GET /api/v1/settings/leave-types` — list configured leave types
- `PATCH /api/v1/settings/leave-types/:id` — update leave type
- `PATCH /api/v1/settings/geofence` — update geo-fence config
- `PATCH /api/v1/settings/shift` — update shift config
- `PATCH /api/v1/settings/working-days` — update working days

*Admin (Next.js):*
- Company Settings page (5 sub-sections)
- Destructive settings confirmation guards for `workStartTime`, `leaveYearStartMonth`, `geoFenceEnabled` (R-UI-007 condition — resolve here)
- Working Days configuration
- Holidays list + add/remove (date picker)
- Leave Types configuration (enable/disable types, max carry-forward)
- Geo-Fence configuration (center lat/lng, radius)
- Shift Configuration (start time, end time, required hours)
- Settings breadcrumb `Settings / [Section Name]` (R-UI-016 LOW — resolve here)
- Dashboard page (KPI cards, live attendance widget, pending leave/reg panel, quick-approve)
- Error pages: `not-found.tsx`, `error.tsx`, `global-error.tsx`, `/unauthorized`
- `public/maintenance.html`
- Mobile viewport overlay `@media (max-width: 1023px)` (R-UI-018 LOW — resolve here)

**Dependencies:** Phase 2 (auth middleware). Settings data needed by Phases 4, 5, 6.

**Note:** Settings backend should ideally be built in Phase 1/2 as seed data, but the admin Settings UI is built here.

**Can Build Parallel With:** Phase 11 (Mobile App).

**Risks:**
- Changing `leaveYearStartMonth` mid-year: define migration behavior (existing allocations unaffected; new employees use new year start)
- Changing `geoFenceEnabled` immediately affects all check-in attempts

**Validation Criteria:**
- Update `workStartTime` → confirmation dialog shown → saved → reflected in attendance validation
- Add holiday → holiday appears in leave apply form calendar
- Geo-fence update → new radius applied to next check-in attempt
- Dashboard KPI cards show correct live counts
- 404 page renders for unknown routes; 500 page renders on simulated error
- All settings unit tests pass

**Estimated Complexity:** Medium (3–4 days solo / 1–2 days small team)

---

### Phase 11 — Mobile App (Profile & Remaining Screens)

**Goal:** Complete all remaining Mobile App screens not covered in Phases 2–9: Profile, Device Info, Change Password, and full offline/edge-case polish.

**Deliverables:**

*Mobile (Flutter):*
- Profile screen (view employee info, device info card)
- Change Password screen (current + new + confirm — R-MOB-006 condition resolved in Phase 5 but applied here)
- Device Information screen (fingerprint display, copy)
- Session Expired screen (full-screen, non-dismissible)
- Offline detection: `connectivity_plus`; offline banner in all screens
- All skeleton loaders: `ShimmerCard` standardized (R-MOB-014 LOW — resolve here)
- Error snackbar duration standardized: 4s errors / 2s success (R-MOB-016 LOW — resolve here)
- Pull-to-refresh on all list screens; verify no GoRouter conflict (R-MOB-015 LOW — verify here)
- Font scaling audit at 1.6× scale (R-MOB-013 LOW — QA phase, note here)
- Session expiry on foreground resume: `AppLifecycleObserver` → `GET /auth/me` → 401 → logout (R-MOB-017 LOW — resolve here)

**Dependencies:** Phase 2 (auth), Phase 3 (employee profile data), Phase 4 (attendance), Phase 5 (leave), Phase 6 (regularization), Phase 8 (notifications).

**Can Build Parallel With:** Phase 10 (Admin Portal Settings).

**Risks:**
- `connectivity_plus` has known issues with VPN-connected devices reporting online when offline — test with airplane mode
- Session expiry on resume: if token refresh call fires during resume and fails, must clear tokens and redirect to login cleanly

**Validation Criteria:**
- Profile screen shows employee name, email, department, device fingerprint
- Change password with correct current password → success; wrong current password → error
- Offline: all screens show cached data; write actions show `PendingSubmissionBanner`
- Font scaling at 1.6× — no overflow, no clipped text (audit result documented)
- App killed during check-in, network offline, app reopened → RECONCILING → CHECKED_IN on reconnect

**Estimated Complexity:** Medium (3–4 days solo / 1–2 days small team)

---

### Phase 12 — Testing & Hardening

**Goal:** Execute all test suites from `03-testing-strategy.md`, harden security, performance test, fix all critical bugs, and prepare for production deployment.

**Deliverables:**
- Full unit test suite execution (target: >90% coverage on services)
- Full integration test suite execution (all 69 API endpoints)
- Security test execution (OWASP Top 10, JWT attack vectors, rate limit, CSRF)
- Concurrency tests (payroll lock, simultaneous check-in, duplicate submission)
- UAT execution (admin portal + mobile app end-to-end workflows)
- Performance test: 100 concurrent check-ins (target: <2s p95 response)
- Flutter widget tests + integration tests (Patrol or `integration_test`)
- Mobile performance: time-to-interactive <3s on mid-range Android (Pixel 4a or equivalent)
- Lighthouse admin portal: Performance >80, Accessibility >90
- Dependency audit: `npm audit` + `flutter pub outdated`
- Secrets scan: `git secrets` or `truffleHog` scan on full repo history
- Production environment variables verified in Vercel
- MongoDB Atlas: production indexes verified; M10 cluster scaled if needed
- FCM production credentials rotated from test
- Brevo production sender domain verified (not test)

**Dependencies:** All phases 1–11 complete.

**Validation Criteria:** See "Definition of Complete" (Section 14).

**Estimated Complexity:** High (5–7 days solo / 2–3 days small team)

---

## 3. Implementation Order

### 3.1 Must Build First (Strict Sequential)

```
Phase 1 (Foundation)
  → Phase 2 (Authentication)
    → Phase 2.5 (Settings Bootstrap)
      → Phase 3 (Employee Management)
        → Phase 4 (Attendance Engine)
        → Phase 5 (Leave Management)
          → Phase 6 (Regularization) ← can start parallel with Phase 5 back-half
          → Phase 7 (Payroll Assistance)
            → Phase 8 (Notifications & Audit)
            → Phase 9 (Reports)
              → Phase 10 (Admin Portal — Settings)  ← parallel with Phase 11
              → Phase 11 (Mobile App — Profile)     ← parallel with Phase 10
                → Phase 12 (Testing & Hardening)
```

### 3.2 Must Build Before

| Item | Must Complete Before |
|---|---|
| Phase 1 (Foundation) | Everything |
| Phase 2 (Auth) | Everything — auth middleware required on all endpoints |
| Phase 2.5 (Settings Bootstrap) | Phase 3, 4, 5, 6 — settings data required by all business domains |
| Phase 3 (Employees) | Phase 4, 5, 6, 7 |
| Phase 4 (Attendance) | Phase 5, 6, 7 |
| Phase 5 (Leave) | Phase 7 (payroll needs leave data) |
| Phase 7 (Payroll) | Phase 9 (payroll reports) |
| Phase 8 (Notifications) | Phase 12 (FCM must be verified) |

### 3.3 Can Build Parallel

| Parallel Set | Condition |
|---|---|
| Phase 5 (Leave) ‖ Phase 6 (Regularization) back-half | Phase 4 complete |
| Phase 8 (Notifications) ‖ Phase 9 (Reports) | Phase 7 complete |
| Phase 10 (Admin Portal) ‖ Phase 11 (Mobile App) | Phase 9 complete |

### 3.4 Settings Bootstrap: Phase 2.5

Settings backend is formally **Phase 2.5** — see full specification in Section 2 above. Settings read API (`GET /settings/*`) available to both admin and employee roles from Phase 2.5 onward. Settings write API (`PATCH /settings/*`) built in Phase 10 (admin UI).

For complete dependency rationale and field-level analysis see `docs/07.2-roadmap-remediation.md` R-RD-001.

---

## 4. MongoDB Implementation Order

### 4.1 Collections Creation Order

| Order | Collection | Reason |
|---|---|---|
| 1 | `users` | Foundation for auth; all other collections reference this |
| 2 | `companySettings` | Single-document collection; seed immediately; required by Phase 4 |
| 3 | `employees` | References `users`; needed by all business collections |
| 4 | `attendanceRecords` | References `employees`; contains embedded `attendanceSessions` |
| 5 | `leaves` | References `employees`; standalone |
| 6 | `leaveTransactions` | References `leaves` + `employees` |
| 7 | `leaveYearAllocations` | References `employees`; seeded per employee per year |
| 8 | `regularizations` | References `employees` + `attendanceRecords` |
| 9 | `payrollRecords` | References `employees`; depends on Phase 4+5 data |
| 10 | `payrollItems` | Embedded in `payrollRecords` (or separate collection per design doc) |
| 11 | `notifications` | References `employees`; written by leave/reg/attendance handlers |
| 12 | `auditLogs` | Cross-cutting; written by admin middleware on all mutations |
| 13 | `systemEvents` | Cron idempotency guard; written by Vercel cron handlers |

### 4.2 Indexes Creation Order

Create all indexes at collection creation time via Mongoose schema definitions.

| Priority | Collection | Index | Purpose |
|---|---|---|---|
| 1 | `users` | `{ email: 1 }` unique | Login lookup |
| 1 | `users` | `{ refreshTokenHash: 1 }` | Token rotation |
| 1 | `users` | `{ passwordResetTokenHash: 1 }` | Reset token lookup |
| 2 | `employees` | `{ userId: 1 }` unique | Employee-user join |
| 2 | `employees` | `{ employeeCode: 1 }` unique | Employee lookup |
| 2 | `employees` | `{ status: 1 }` | Filter active employees |
| 3 | `attendanceRecords` | `{ employeeId: 1, date: 1 }` unique | Single record per employee per day |
| 3 | `attendanceRecords` | `{ date: 1 }` | Admin daily view query |
| 3 | `attendanceRecords` | `{ employeeId: 1, date: -1 }` | Employee history (descending) |
| 4 | `leaves` | `{ employeeId: 1, status: 1 }` | Pending leaves per employee |
| 4 | `leaves` | `{ status: 1, createdAt: -1 }` | Admin pending approvals |
| 4 | `leaves` | `{ employeeId: 1, startDate: 1 }` | Date range queries |
| 5 | `leaveTransactions` | `{ leaveId: 1 }` | Leave balance trace |
| 5 | `leaveTransactions` | `{ employeeId: 1, leaveType: 1 }` | Balance computation |
| 5 | `leaveYearAllocations` | `{ employeeId: 1, leaveYear: 1 }` unique | One allocation per year |
| 6 | `regularizations` | `{ employeeId: 1, status: 1 }` | Employee pending view |
| 6 | `regularizations` | `{ status: 1, createdAt: -1 }` | Admin pending approvals |
| 7 | `payrollRecords` | `{ employeeId: 1, month: 1, year: 1 }` unique | Single payroll per employee per month |
| 7 | `payrollRecords` | `{ month: 1, year: 1, status: 1 }` | Bulk compute/finalize queries |
| 8 | `notifications` | `{ employeeId: 1, read: 1, createdAt: -1 }` | Unread count + list |
| 9 | `auditLogs` | `{ createdAt: 1 }` TTL (90d) | Auto-expiry |
| 9 | `auditLogs` | `{ actorId: 1, action: 1, createdAt: -1 }` | Admin audit view |
| 10 | `systemEvents` | `{ eventType: 1, date: 1 }` unique | Cron idempotency |

### 4.3 Seed Data Order

| Order | Data | When | Command |
|---|---|---|---|
| 1 | Admin `users` + `employees` record | Phase 2 — reads `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` from env; `requiresPasswordChange: true` | `npm run seed:admin` |
| 2 | `companySettings` — default document with 4 leave types, empty holidays, geo-fence disabled | Phase 2.5 | `npm run seed:settings` |
| 3 | `leaveYearAllocations` for all active employees (current year) | Phase 5 — run once on first deploy; C-02 cron handles all future years | `npm run seed:leave-allocations` |
| 4 | Test employee accounts (non-production environments only) | Phase 3 test seed | `npm run seed:test-employees` |

---

## 5. Backend Implementation Order

For each phase, implement in this strict order within the phase:

```
1. Mongoose Models (schema + indexes + virtuals + hooks)
2. Repositories     (raw DB queries; no business logic)
3. Services         (business logic; calls repositories)
4. Validators       (Zod schemas for request bodies)
5. Route handlers   (thin; call validators then services)
6. Middleware       (auth guards, rate limiters, idempotency)
```

### 5.1 Per-Phase Backend Order

**Phase 2 — Auth:**
```
Model:      User (users collection)
             AuditLog (stub — model only; middleware wired in Phase 8)
Repository: UserRepository (findByEmail, findByRefreshToken, findByResetToken, updateFcmToken)
Service:    AuthService (login, logout, refresh, forgotPassword, resetPassword, changePassword)
Validator:  LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, ChangePasswordSchema, FcmTokenSchema
Middleware: requireAuth, requireRole, requirePasswordChanged, rateLimiter, csrfGuard
             AuditMiddleware (stub — wired to admin routes; writes to auditLogs collection)
Routes:     /auth/login, /auth/logout, /auth/refresh, /auth/forgot-password,
            /auth/reset-password, /auth/me, /auth/me/password, /auth/me/fcm-token
Seed:       scripts/seed-admin.ts (reads ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD; idempotent)
```

**Phase 2.5 — Settings Bootstrap:**
```
Model:      CompanySettings (single-document collection)
Repository: SettingsRepository (findSettings, updateSettings, addHoliday, removeHoliday, updateLeaveType)
Service:    SettingsService (getSettings, getHolidays, getLeaveTypes, getGeoFenceConfig,
                             getShiftConfig, getWorkingDays, seedDefaults)
Validator:  (read-only phase — no update validators; built in Phase 10)
Routes:     GET /settings/company, GET /settings/holidays, GET /settings/leave-types,
            GET /settings/geofence, GET /settings/shift, GET /settings/working-days
            Auth: requireAuth (both admin + employee role; no role restriction on reads)
Seed:       scripts/seed-settings.ts (idempotent; no-op if document exists)
```

**Phase 3 — Employees:**
```
Model:      Employee (employees collection)
Repository: EmployeeRepository (findAll, findById, findByUserId, create, update, updateStatus, updateDevice)
Service:    EmployeeService (create, update, activate, deactivate, registerDevice, resetDevice, resetPassword)
Validator:  CreateEmployeeSchema, UpdateEmployeeSchema, RegisterDeviceSchema
Routes:     /employees, /employees/:id, /employees/:id/status, /employees/:id/device,
            /employees/:id/reset-password
Email:      WelcomeEmailTemplate, TempPasswordEmailTemplate (Brevo)
```

**Phase 4 — Attendance:**
```
Model:      AttendanceRecord (+ embedded AttendanceSession)
Repository: AttendanceRepository (findTodayByEmployee, findByDateRange, findDailyAll, upsertSession, closeSession)
Service:    AttendanceService (checkIn, checkOut, getTodayForEmployee, getHistory, getDailyView, adminCorrect)
             GeoFenceService (validateCoords, haversineDistance)
             DayStatusService (computeDayStatus — present/half-day/absent/leave/holiday/weekend)
Validator:  CheckInSchema, CheckOutSchema, AttendanceCorrectionSchema
Middleware: IdempotencyMiddleware (Redis; applies to checkin/checkout routes)
Routes:     /attendance/checkin, /attendance/checkout, /attendance/today, /attendance,
            /attendance/:employeeId, /attendance/daily, /attendance/weekly, /attendance/monthly,
            /attendance/:id/correct
Cron:       /api/cron/session-auto-close  (C-01 — stub wired Phase 1; implemented here)
             /api/cron/attendance-reminder (C-04 — 10:30 IST Mon-Fri)
             /api/cron/checkout-reminder   (C-05 — 18:30 IST Mon-Fri)
```

**Phase 5 — Leave:**
```
Model:      Leave, LeaveTransaction, LeaveYearAllocation
Repository: LeaveRepository, LeaveTransactionRepository, LeaveYearAllocationRepository
Service:    LeaveService (apply, approve, reject, revoke, cancel, getBalance, checkPayrollConflict)
             LeaveBalanceService (computeBalance from transactions)
             CarryForwardService (annual rollover logic)
Validator:  ApplyLeaveSchema, ApproveLeaveSchema, RejectLeaveSchema, RevokeLeaveSchema
Routes:     /leaves, /leaves/:id, /leaves/balance, /leaves/:id/approve, /leaves/:id/reject,
            /leaves/:id/revoke, /leaves/:id/cancel
Cron:       /api/cron/leave-year-allocation     (C-02 — replaces leave-year-rollover)
             /api/cron/leave-carryforward-expiry (C-03 — expires carry-forward after grace period)
```

**Phase 6 — Regularization:**
```
Model:      Regularization
Repository: RegularizationRepository
Service:    RegularizationService (create, approve, reject, withdraw)
             AttendanceCorrectionService (apply correction to AttendanceRecord on approve)
Validator:  CreateRegularizationSchema, ApproveRegularizationSchema, RejectRegularizationSchema
Routes:     /regularizations, /regularizations/:id, /regularizations/:id/approve,
            /regularizations/:id/reject, /regularizations/:id/withdraw
```

**Phase 7 — Payroll:**
```
Model:      PayrollRecord, PayrollItem
Repository: PayrollRepository (findByMonthYear, findByEmployee, updateStatus, bulkFinalize)
Service:    PayrollComputeService (compute per employee; orchestrate bulk)
             PayrollLockService (Redis lock acquire/release/TTL guard)
             PayrollStaleService (detect staleEmployeeIds after leave revocation)
             PayslipService (generate payslip data structure)
Validator:  ComputePayrollSchema, FinalizePayrollSchema
Middleware: ComputeLockGuard (Redis check before starting compute)
Routes:     /payroll/compute, /payroll, /payroll/:employeeId, /payroll/:employeeId/finalize,
            /payroll/:employeeId/unfinalize, /payroll/finalize-all, /payroll/:employeeId/payslip
Cron:       /api/cron/payroll-month-end (C-06 — replaces payroll-reminder; fires last day of month)
```

**Phase 8 — Notifications & Audit:**
```
Model:      Notification, AuditLog, SystemEvent
Repository: NotificationRepository, AuditLogRepository
Service:    NotificationService (create, markRead, markAllRead, getUnreadCount)
             AuditLogService (write, query)
             FcmService (sendToUser, sendBulk — wraps Firebase Admin SDK)
Middleware: AuditMiddleware (wraps all admin mutation routes; auto-writes audit log)
Routes:     /notifications, /notifications/:id/read, /notifications/read-all,
            /notifications/count, /audit-logs, /audit-logs/:id
```

**Phase 9 — Reports:**
```
Service:    AttendanceReportService (query + XLSX generation)
             LeaveReportService (query + XLSX generation)
             PayrollReportService (query + XLSX generation)
Validator:  AttendanceReportSchema, LeaveReportSchema, PayrollReportSchema
Routes:     /reports/attendance, /reports/leave, /reports/payroll
```

**Phase 10 — Settings (Write endpoints only; read endpoints already in Phase 2.5):**
```
Validator:  CompanySettingsUpdateSchema, HolidaySchema, LeaveTypeUpdateSchema,
            GeoFenceSchema, ShiftSchema, WorkingDaysSchema
Routes:     PATCH /settings/company, POST /settings/holidays, DELETE /settings/holidays/:id,
            PATCH /settings/leave-types/:code, PATCH /settings/geofence,
            PATCH /settings/shift, PATCH /settings/working-days
            Auth: requireAuth + requireRole('admin') on all PATCH/POST/DELETE routes
```

### 5.2 Cron Schedule Matrix

All cron jobs defined in `vercel.ts` from Phase 1 (as stubs). UTC expressions must be set correctly before any cron fires in staging. IST = UTC+5:30.

| ID | Job Path | Purpose | IST Time | UTC Cron Expression | Implemented In |
|---|---|---|---|---|---|
| C-01 | `/api/cron/session-auto-close` | Close dangling active sessions at end of day; prevents next-day check-in block | 23:30 daily | `"0 18 * * *"` | Phase 4 |
| C-02 | `/api/cron/leave-year-allocation` | Create `leaveYearAllocation` records for all employees on new leave year start | 00:05 IST 1st of `leaveYearStartMonth` | `"35 18 28-31 * *"` + code check for month | Phase 5 |
| C-03 | `/api/cron/leave-carryforward-expiry` | Zero out carry-forward balances past their expiry month | 00:05 IST 1st of expiry month | `"35 18 28-31 * *"` + code check per leave type | Phase 5 |
| C-04 | `/api/cron/attendance-reminder` | FCM push to employees not yet checked in by 10:30 IST | 10:30 IST Mon–Fri | `"0 5 * * 1-5"` | Phase 4 |
| C-05 | `/api/cron/checkout-reminder` | FCM push to employees still checked in at 18:30 IST | 18:30 IST Mon–Fri | `"0 13 * * 1-5"` | Phase 4 |
| C-06 | `/api/cron/payroll-month-end` | FCM + email reminder to admin on last calendar day of month | 09:00 IST last day | `"30 3 28-31 * *"` + `isTomorrow(1st)` check | Phase 7 |

**`vercel.ts` configuration:**
```typescript
import { type VercelConfig } from '@vercel/config/v1';
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/session-auto-close',        schedule: '0 18 * * *'      },
    { path: '/api/cron/leave-year-allocation',     schedule: '35 18 28-31 * *'  },
    { path: '/api/cron/leave-carryforward-expiry', schedule: '35 18 28-31 * *'  },
    { path: '/api/cron/attendance-reminder',       schedule: '0 5 * * 1-5'     },
    { path: '/api/cron/checkout-reminder',         schedule: '0 13 * * 1-5'    },
    { path: '/api/cron/payroll-month-end',         schedule: '30 3 28-31 * *'   },
  ],
};
```

**All cron handlers must:**
1. Respond 200 within 60s (Vercel requirement); run long work via `waitUntil()` or background
2. Check `systemEvents` collection for idempotency before doing any work
3. Write to `systemEvents` on success
4. Return `{ success: true, jobName, executedAt }` for Vercel log visibility
5. Log errors to `console.error` (visible in Vercel function logs)

**Failure recovery per cron:**

| Cron | Failure Consequence | Recovery |
|---|---|---|
| C-01 session-auto-close | Employees stuck as CHECKED_IN; next-day check-in blocked | Admin uses attendance correction endpoint to manually close sessions |
| C-02 leave-year-allocation | Employees see 0 leave balance on new year's first day | `POST /api/admin/cron/leave-year-allocation?force=true` (admin-only, bypasses idempotency) |
| C-03 carryforward-expiry | Carry-forward not expired; employees retain expired balance | `POST /api/admin/cron/leave-carryforward-expiry?force=true` |
| C-04 attendance-reminder | No FCM push; employees not reminded | No user-visible harm; logs cron failure |
| C-05 checkout-reminder | No FCM push; C-01 auto-close at 23:30 is the safety net | No user-visible harm |
| C-06 payroll-month-end | Admin misses reminder; may delay payroll | Admin checks payroll portal manually; no data loss |

---

### 5.3 Cross-Phase Contracts

Explicit contracts for data written in one phase and read in another. Developers must read the relevant contract before implementing the consuming phase.

---

#### Contract A — `staleEmployeeIds` (Phase 5 writes → Phase 7 reads)

```
Collection:  payrollRecords
Field:       staleEmployeeIds: String[]  (default: [])
Written by:  LeaveService.revokeLeave() — Phase 5
Read by:     PayrollRepository.findByMonthYear() → meta.staleEmployeeIds — Phase 7
Cleared by:  PayrollReopenModal Step 2 (recompute) — Phase 7
```

**Write rule (Phase 5):**
```typescript
// On leave revoke: append employeeId if payroll already computed for that month
await PayrollRecord.updateOne(
  { employeeId, month, year, status: { $in: ['computed', 'finalized'] } },
  { $addToSet: { staleEmployeeIds: employeeId.toString() } }
);
```
**Implementation timing:** `PayrollRecord` model is defined in Phase 7. Phase 5 developer adds a `// TODO Phase 7: implement staleEmployeeIds write` stub in `LeaveService.revokeLeave()`. The write is implemented during Phase 7, not Phase 5.

**Read rule (Phase 7):**
```typescript
// Aggregate across all records for the period
meta: {
  staleEmployeeIds: records.flatMap(r => r.staleEmployeeIds ?? []).filter(unique),
}
```

---

#### Contract B — Attendance → Payroll (Phase 4 produces → Phase 7 consumes)

```
Collection:  attendanceRecords
Key fields:  dayStatus: 'present' | 'half-day' | 'absent' | 'leave' | 'holiday' | 'weekend'
             totalMinutesWorked: number
Written by:  DayStatusService — Phase 4
Read by:     PayrollComputeService — Phase 7
```

**Invariant:** `dayStatus` is always set for every working day in the past. Phase 4 session auto-close cron (C-01) also triggers `dayStatus` backfill for any employee whose session was auto-closed. Phase 7 payroll compute assumes `dayStatus` is never null for past dates.

**Phase 4 → Phase 5 dependency:** `DayStatusService` must accept a leave data source to set `dayStatus = 'leave'` for approved leave dates. Implement as an interface parameter, filled with real `LeaveRepository` in Phase 5:
```typescript
// Phase 4: DayStatusService accepts optional leave resolver
computeDayStatus(record, settings, leaveResolver?: LeaveResolver)
// Phase 5: wire real LeaveRepository as leaveResolver
```

---

#### Contract C — Leave → Payroll (Phase 5 produces → Phase 7 consumes)

```
Collection:  leaves
Key fields:  status: 'approved', leaveType: { isPaid: false } → LWP deduction
             startDate / endDate → overlap with payroll month
Written by:  LeaveService — Phase 5
Read by:     PayrollComputeService — Phase 7
Query:       Leave.find({ employeeId, status: 'approved',
               startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } })
```

**LWP rule:** Count approved LWP leave days overlapping the payroll month → deduct from gross pay prorate. Paid leave days are already reflected as `dayStatus = 'leave'` (counted as present for pay purposes).

---

#### Contract D — Settings → All Business Domains (Phase 2.5 produces → Phases 4, 5, 6 consume)

```
Collection:  companySettings  (single document — findOne({}))
Guarantee:   Always non-null after Phase 2.5 seed. SettingsService.getSettings() throws
             descriptive error if document missing (never returns null silently).
Cache:       In-memory within Vercel function instance. Refreshed on cold start.
             Settings changes (Phase 10) take effect on next function cold start.
```

All consuming services call `SettingsService.getSettings()` — never query `companySettings` directly.

---

For full contract narrative and edge case handling see `docs/07.2-roadmap-remediation.md` R-RD-002.

---

## 6. Admin Portal Page Build Sequence

Build in this order (each row unblocks the next group):

### Group 1 — Foundation (no API data needed)
1. `app/layout.tsx` — root layout with font, theme, `SessionExpiredOverlay`, `Toaster`
2. `components/ui/` — shadcn/ui component setup: Button, Input, Table, Sheet, Dialog, Badge, Sonner
3. `components/shared/UnsavedChangesDialog` — build once, reuse in all drawers (R-UI-009)
4. `components/shared/DataTable` — TanStack Table v8 wrapper with server-side pagination
5. `app/(auth)/login/page.tsx`
6. `app/(auth)/forgot-password/page.tsx`
7. `app/(auth)/reset-password/page.tsx`
8. `app/(auth)/change-password/page.tsx` (`RestrictedShell`)
9. `app/not-found.tsx`
10. `app/error.tsx`
11. `app/global-error.tsx`
12. `public/maintenance.html`
13. `app/unauthorized/page.tsx`

### Group 2 — Shell & Dashboard (requires auth API)
14. `components/layout/Sidebar` — dark sidebar, nav items, notification badge
15. `components/layout/Header` — breadcrumb, user menu
16. `app/(admin)/dashboard/page.tsx` — KPI cards, live attendance widget, pending panel

### Group 3 — Settings (requires settings API — unblocks Phase 4/5 testing)
17. `app/(admin)/settings/company/page.tsx` — all 5 sub-sections
18. `app/(admin)/settings/holidays/page.tsx`
19. `app/(admin)/settings/leave-types/page.tsx`
20. `app/(admin)/settings/geofence/page.tsx`
21. `app/(admin)/settings/shift/page.tsx`

### Group 4 — Employee Module
22. `app/(admin)/employees/page.tsx` — list DataTable
23. `components/employees/CreateEmployeeDrawer` — with temp-password modal (R-UI-005)
24. `components/employees/EditEmployeeDrawer`
25. `components/employees/RegisterDeviceModal`
26. `components/employees/ResetDeviceDialog`
27. `components/employees/ResetPasswordDialog`

### Group 5 — Attendance Module
28. `app/(admin)/attendance/daily/page.tsx`
29. `app/(admin)/attendance/weekly/page.tsx` — with `@tanstack/react-virtual` (R-UI-006)
30. `app/(admin)/attendance/monthly/page.tsx`
31. `app/(admin)/attendance/[employeeId]/page.tsx`
32. `components/attendance/CorrectionDrawer`

### Group 6 — Leave Module
33. `app/(admin)/leave/pending/page.tsx` — bulk approve
34. `app/(admin)/leave/history/page.tsx`
35. `app/(admin)/leave/balances/page.tsx`
36. `components/leave/RevokeLeaveModal` — Variant A + B

### Group 7 — Regularization Module
37. `app/(admin)/regularization/pending/page.tsx`
38. `app/(admin)/regularization/history/page.tsx`
39. `components/regularization/ApproveDrawer`

### Group 8 — Payroll Module
40. `app/(admin)/payroll/page.tsx` — list with `PayrollLockBanner` + `PayrollStaleBanner`
41. `components/payroll/PayrollComputeModal` — 6-state machine
42. `components/payroll/PayrollReopenModal` — 3-step wizard
43. `app/(admin)/payroll/[employeeId]/page.tsx` — detail + finalize/unfinalize
44. `app/(admin)/payroll/[employeeId]/payslip/page.tsx`

### Group 9 — Reports
45. `app/(admin)/reports/attendance/page.tsx`
46. `app/(admin)/reports/leave/page.tsx`
47. `app/(admin)/reports/payroll/page.tsx`

### Group 10 — Notifications & Audit
48. `app/(admin)/notifications/page.tsx`
49. `app/(admin)/audit-logs/page.tsx`
50. `components/audit-logs/AuditLogDetailDrawer`

---

## 7. Mobile App Screen Build Sequence

Build in this order (Flutter screens):

### Group 1 — Foundation (no API)
1. `main.dart` — `MaterialApp.router`, `ProviderScope`, `AppLifecycleObserver`, theme setup (`ColorScheme.fromSeed(Color(0xFF2563EB))`)
2. `core/di/providers.dart` — Riverpod provider registrations
3. `core/router/app_router.dart` — GoRouter config with redirect guards
4. `core/network/dio_client.dart` — `Dio` + `DioInterceptor` (auth refresh, error routing)
5. `core/storage/secure_storage.dart` — `flutter_secure_storage` wrapper
6. `core/storage/hive_boxes.dart` — Hive box registration + adapters
7. `core/widgets/shimmer_card.dart` — `ShimmerCard` standard component (R-MOB-014)
8. `core/widgets/pending_submission_banner.dart` — `PendingSubmissionBanner`
9. `core/widgets/offline_banner.dart` — `connectivity_plus` wrapper

### Group 2 — Auth Screens
10. `features/auth/screens/login_screen.dart`
11. `features/auth/screens/forgot_password_screen.dart`
12. `features/auth/screens/reset_password_screen.dart`
13. `features/auth/screens/force_change_password_screen.dart`
14. `features/auth/screens/session_expired_screen.dart`
15. `features/auth/screens/notification_permission_screen.dart`
16. `features/auth/notifiers/auth_notifier.dart`
17. `features/auth/services/fcm_token_service.dart`

### Group 3 — Device Screens
18. `features/device/screens/device_not_registered_screen.dart` — Section 0.7
19. `features/device/screens/device_awaiting_screen.dart` — Section 0.8
20. `features/device/screens/device_mismatch_screen.dart`

### Group 4 — Shell & Navigation
21. `features/shell/screens/main_shell.dart` — bottom nav 5 tabs
22. `features/home/screens/home_screen.dart` — dashboard + attendance widget

### Group 5 — Attendance Screens (state machine)
23. `features/attendance/notifiers/attendance_notifier.dart` — `AsyncNotifier` + `reconcileWithServer()`
24. `features/attendance/widgets/attendance_action_button.dart` — `AttendanceActionButton`
25. `features/attendance/widgets/live_timer_widget.dart`
26. `features/attendance/screens/attendance_idle_state.dart`
27. `features/attendance/screens/attendance_checked_in_state.dart`
28. `features/attendance/screens/attendance_checked_out_partial_state.dart`
29. `features/attendance/screens/attendance_checked_out_complete_state.dart`
30. `features/attendance/screens/attendance_reconciling_state.dart`
31. `features/attendance/screens/attendance_weekly_screen.dart`
32. `features/attendance/screens/attendance_daily_detail_screen.dart`
33. `features/attendance/screens/attendance_history_screen.dart` — infinite scroll (R-MOB-011)
34. `features/attendance/services/submission_service.dart` — `SubmissionService` with idempotency

### Group 6 — Leave Screens
35. `features/leave/screens/leave_balance_screen.dart`
36. `features/leave/screens/apply_leave_screen.dart` — with holiday cache refresh (R-MOB-007)
37. `features/leave/screens/leave_history_screen.dart`
38. `features/leave/screens/leave_detail_screen.dart`
39. `features/leave/widgets/cancel_leave_dialog.dart`

### Group 7 — Regularization Screens
40. `features/regularization/screens/create_regularization_screen.dart` — with settings refresh (R-MOB-009)
41. `features/regularization/screens/regularization_history_screen.dart`
42. `features/regularization/screens/regularization_detail_screen.dart`

### Group 8 — Notifications
43. `features/notifications/screens/notifications_screen.dart`
44. `features/notifications/screens/notification_detail_screen.dart`
45. FCM deep link handler wired to `app_links` + GoRouter

### Group 9 — Profile
46. `features/profile/screens/profile_screen.dart`
47. `features/profile/screens/change_password_screen.dart` (with current-password — R-MOB-006)
48. `features/profile/screens/device_info_screen.dart`

---

## 8. Testing Checkpoints

Each checkpoint must pass before proceeding to the next phase.

| Checkpoint | After Phase | Tests Required |
|---|---|---|
| TC-01 | Phase 1 | Health endpoint green; CI pipeline green; DB + Redis connected |
| TC-02 | Phase 2 | All auth unit tests pass; rate limit integration test; device fingerprint tests; admin login → forced password change → dashboard flow verified; `npm run seed:admin` idempotent |
| TC-02.5 | Phase 2.5 | `GET /settings/company` returns seeded defaults; all 6 read endpoints return 200; employee role can read, cannot write; `npm run seed:settings` idempotent |
| TC-03 | Phase 3 | Employee CRUD unit tests; Brevo welcome email received; admin create employee flow manual test |
| TC-04a | Phase 4 (backend) | Attendance unit + integration tests; multi-session test; idempotency test; geo-fence unit test; C-01/C-04/C-05 cron manual trigger tests; `dayStatus` backfill verified — **backend team may proceed to Phase 5** |
| TC-04b | Phase 4 (mobile) | Mobile RECONCILING state test; offline queue test; live timer restore from server; all 5 attendance states on physical device — complete before Phase 12 UAT |
| TC-05 | Phase 5 | Leave unit + integration tests; balance computation tests; LWP test; carry-forward calculation test; payroll conflict pre-check test |
| TC-06 | Phase 6 | Regularization unit tests; approval + attendance correction test |
| TC-07 | Phase 7 | Payroll compute unit + integration tests; concurrency lock test; stale detection test; partial failure test; 3-step reopen wizard manual test |
| TC-08 | Phase 8 | Notification delivery end-to-end (FCM tap → deep link); audit log write test; badge count test |
| TC-09 | Phase 9 | XLSX export download test; preview 50-row limit test |
| TC-10 | Phase 10+11 | Full admin UAT (30 workflows); full mobile UAT (27 workflows); accessibility audit |
| TC-11 | Phase 12 | Security tests pass; performance test (100 concurrent check-ins); Lighthouse >80 admin; no HIGH open bugs |

---

## 9. Deployment Checkpoints

| Checkpoint | Trigger | Environment | Rollback Strategy |
|---|---|---|---|
| DC-01 | Phase 1 complete | Preview (Vercel) | Delete preview; no data |
| DC-02 | Phase 2 complete | Staging (Vercel) | Revert to previous Vercel deployment |
| DC-03 | Phase 4 complete | Staging | Revert deployment; drop `attendanceRecords` if schema changed |
| DC-04 | Phase 7 complete | Staging | Revert deployment; do NOT drop payroll data |
| DC-05 | Phase 10+11 complete | Staging → UAT | UAT sign-off required before production |
| DC-06 | Phase 12 complete | Production | See rollback strategy below |

**Production deployment checklist (DC-06):**
- [ ] All environment variables set in Vercel production env
- [ ] MongoDB Atlas M10 cluster — connection string updated to production
- [ ] Upstash Redis — production instance; not shared with staging
- [ ] Firebase — production FCM credentials (not test project)
- [ ] Brevo — production sender domain verified; test email delivered
- [ ] `MAINTENANCE_MODE=false` set in Vercel env
- [ ] DNS pointed to Vercel production URL
- [ ] `public/maintenance.html` reachable at `/maintenance.html`
- [ ] Admin account seeded with initial password
- [ ] MongoDB indexes verified via Atlas UI
- [ ] Cron jobs configured in `vercel.ts` with correct schedules (UTC offsets)
- [ ] Flutter app APK built with production `google-services.json`
- [ ] APK signed with production keystore
- [ ] APK distributed to internal test track before public release

---

## 10. Rollback Strategy

### 10.1 Backend Rollback (Vercel)

Vercel maintains deployment history. Rollback = instant:
```
vercel rollback [deployment-url]
```
Or via Vercel dashboard: Deployments → previous → Promote to Production.

**When to rollback:** P0 bug in production; data corruption; auth broken.

### 10.2 MongoDB Rollback

MongoDB has no built-in migration rollback. Mitigation strategy:

| Scenario | Strategy |
|---|---|
| Schema field added (backward compatible) | No rollback needed — old code ignores new fields |
| Schema field renamed | Never rename; add new field + deprecate old; rollback is safe |
| Schema field removed | Never remove in same deploy as code removal; two-phase deploy |
| Index added | Drop index if causing performance issues: `collection.dropIndex(name)` |
| Data migration run | Keep migration script + inverse migration script; test inverse before prod run |
| Seed data corrupted | Restore from Atlas point-in-time backup (M10 supports 7d backup) |

**Atlas backup policy:** Enable continuous backup on M10. Take manual snapshot before every production schema migration.

### 10.3 Mobile App Rollback

Flutter APK is distributed via internal track or direct APK. Rollback:
- Re-distribute previous APK version
- If on Play Store: use Play Console "Release rollout" to halt and revert

**API backward compatibility:** Mobile app may lag behind backend by 1–2 versions. All API changes must be backward compatible (additive only) for 2 deploy cycles.

### 10.4 Cron Job Rollback

Cron jobs are defined in `vercel.ts`. To disable a cron:
1. Set `MAINTENANCE_MODE=true` — all `/api/cron/*` routes return 503
2. Or remove cron from `vercel.ts` and redeploy

`systemEvents` collection prevents double-execution if cron fires twice during a rollback window.

---

## 11. Milestone Approvals

| Milestone | Deliverable | Approval Required From |
|---|---|---|
| M1 — Foundation Ready | Phase 1 complete; health endpoint green; CI green; `vercel.ts` with all 6 cron stubs deployed to preview | Tech lead |
| M2 — Auth Complete | Phase 2 TC-02 passed; JWT + device fingerprint security review; `seed:admin` tested; forced password change flow verified | Tech lead + security reviewer |
| M2.5 — Settings Ready | Phase 2.5 TC-02.5 passed; all settings read endpoints return seeded defaults; geo-fence + leave types confirmed readable by employee role JWT | Tech lead |
| M3 — Core CRUD Ready | Phase 3 TC-03 passed; employee CRUD working in admin portal | Product owner |
| M4 — Attendance Ready | Phase 4 TC-04a passed; C-01 session auto-close tested via manual trigger; mobile check-in works on physical device (TC-04b in progress, completes before Phase 12) | Tech lead + product owner |
| M5 — Leave + Reg Ready | Phases 5+6 TC-05+06 passed; leave flow works end-to-end; C-02 leave allocation cron manually triggered and verified; C-03 carry-forward expiry unit tested | Product owner |
| M6 — Payroll Ready | Phase 7 TC-07 passed; payroll compute + finalize verified; C-06 payroll reminder fires to admin FCM + Brevo via manual trigger; Redis lock TTL 600s confirmed | Product owner + finance stakeholder |
| M7 — Full Admin Portal | Phase 10 complete; all 30 admin workflows work | Product owner |
| M8 — Full Mobile App | Phase 11 complete; all 27 mobile workflows work | Product owner |
| M9 — Testing Complete | Phase 12 TC-11 passed; security + performance tests green | Tech lead |
| M10 — Production Ready | DC-06 checklist complete; APK distributed; `ADMIN_INITIAL_PASSWORD` removed from Vercel env vars post-seed; admin credentials in company password vault | Product owner + stakeholder sign-off |

---

## 12. Developer Checklist

### Per-Phase Checklist (run before marking phase complete)

- [ ] All deliverables listed in phase built and committed
- [ ] Unit tests written and passing (per `03-testing-strategy.md` matrix for this phase)
- [ ] Integration tests written and passing
- [ ] No `console.log` statements in production code paths
- [ ] No hardcoded secrets (API keys, passwords, connection strings)
- [ ] All environment variables documented in `.env.example`
- [ ] API response format matches `04-api-specification.md` for new endpoints
- [ ] New Mongoose models have all indexes defined in schema
- [ ] New routes protected by correct middleware (`requireAuth`, `requireRole`)
- [ ] Error codes match `04-api-specification.md` error catalog
- [ ] Admin UI: new pages/drawers/modals match `05-admin-ui-ux.md` spec
- [ ] Mobile: new screens match `06-mobile-ui-ux.md` spec
- [ ] Corresponding testing checkpoint passed (see Section 8)
- [ ] PR reviewed; no critical review comments unresolved

### Pre-Production Checklist

- [ ] `npm audit` — no HIGH or CRITICAL vulnerabilities
- [ ] `flutter pub outdated` — no deprecated packages with security patches
- [ ] All TODO/FIXME comments resolved or tracked as issues
- [ ] No dead code (unused imports, commented-out blocks)
- [ ] Logging: structured JSON logs; no PII in logs; no passwords/tokens in logs
- [ ] Rate limiting tested in staging with real load
- [ ] MongoDB Atlas M10 — confirm indexes; check slow query logs
- [ ] Redis — confirm TTLs set on all keys; no unbounded growth
- [ ] FCM — production credentials; test push on physical device
- [ ] Brevo — production domain; SPF/DKIM verified
- [ ] Vercel cron — UTC schedules correct for IST
- [ ] Mobile APK — signed with production keystore; `google-services.json` production config
- [ ] `MAINTENANCE_MODE` env var tested (can enable/disable without redeploy)
- [ ] Admin initial account created; temp password documented securely
- [ ] All milestone approvals obtained (Section 11)

---

## 13. Definition of Complete

The project is complete when ALL of the following are true:

### Backend
- [ ] All 69 API endpoints (per `04-api-specification.md`) implemented and returning correct responses
- [ ] API gap analysis G-001 through G-005 patches applied to `04-api-specification.md` and implemented
- [ ] All Mongoose models match `02-database-design.md` v1.2 schema
- [ ] All indexes created; no missing indexes per Section 4.2
- [ ] All business rules per `04-api-specification.md` Appendix B enforced
- [ ] All error codes per error catalog returned correctly
- [ ] `X-Idempotency-Key` implemented for 4 endpoints
- [ ] Rate limiting: `authLimiter` (5/15min) + standard authenticated limiter active
- [ ] CSRF protection active on all mutating admin routes
- [ ] All 6 Vercel cron jobs active and idempotency-guarded (C-01 session-auto-close, C-02 leave-year-allocation, C-03 leave-carryforward-expiry, C-04 attendance-reminder, C-05 checkout-reminder, C-06 payroll-month-end)
- [ ] Brevo transactional emails delivered for: welcome, temp password reset, forgot password, leave approve/reject/revoke, regularization approve/reject
- [ ] FCM push delivered for: leave approve/reject, regularization approve/reject, attendance check-in reminder (C-04), checkout reminder (C-05), payroll month-end reminder to admin (C-06)

### Admin Portal
- [ ] All 45 screens implemented per `05-admin-ui-ux.md` v1.1
- [ ] All 30 workflows functional end-to-end
- [ ] All MEDIUM findings from `05.1-admin-ui-review.md` resolved (R-UI-005, R-UI-006, R-UI-007, R-UI-008, R-UI-009, R-UI-010, R-UI-011, R-UI-012)
- [ ] `SessionExpiredOverlay` active in root layout
- [ ] Error pages (`not-found.tsx`, `error.tsx`, `global-error.tsx`, `maintenance.html`) functional
- [ ] Lighthouse Performance ≥ 80; Accessibility ≥ 90 (on dashboard + attendance pages)
- [ ] All keyboard navigation functional (Tab, Escape, Enter on interactive elements)
- [ ] All table states: loading, empty, error, populated — tested

### Mobile App
- [ ] All 27 screens implemented per `06-mobile-ui-ux.md` v1.1
- [ ] All 27 workflows functional end-to-end on physical Android device
- [ ] All MEDIUM findings from `06.1-mobile-ui-review.md` resolved (R-MOB-006 through R-MOB-012)
- [ ] Attendance state machine v2 (all 5 states + RECONCILING) functional
- [ ] FCM push received and deep links navigate to correct screen
- [ ] Offline: check-in queued, synced on reconnect; all lists serve from Hive cache
- [ ] `flutter_secure_storage` storing tokens in Android Keystore (verify via device Developer options)
- [ ] App kills during check-in → reopen → CHECKED_IN restored from server
- [ ] All Flutter widget tests pass; integration test suite green

### Testing
- [ ] Unit test coverage ≥ 90% on all services
- [ ] All integration tests pass (all 69 API endpoints)
- [ ] Security tests pass: OWASP Top 10 checklist completed; no P0/P1 findings open
- [ ] Concurrency tests pass: payroll lock, simultaneous check-in, duplicate submission
- [ ] Performance test: 100 concurrent check-ins < 2s p95
- [ ] UAT: all admin workflows signed off by product owner
- [ ] UAT: all mobile workflows signed off by product owner

### Operations
- [ ] Production MongoDB Atlas M10 cluster with continuous backup enabled
- [ ] Production Upstash Redis (not shared with staging)
- [ ] All environment variables in Vercel production environment
- [ ] `MAINTENANCE_MODE` tested (enable → `maintenance.html` served; disable → app resumes)
- [ ] Atlas slow query logs reviewed; no queries without index
- [ ] Rollback tested: previous Vercel deployment promoted in staging
- [ ] On-call runbook written (what to do for: DB down, Redis down, FCM outage, Brevo bounce)

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-06-14 | Initial implementation roadmap — 12 phases, full implementation order |
