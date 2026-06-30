# 03 — Testing Strategy & QA Specification
**Workforce Management Platform**
Last updated: 2026-06-14 (v1.1 — 5 HIGH findings from 03.1 applied)
Roles: QA Lead · Security Lead · Principal Architect · HRMS Domain Expert

---

## 1. Testing Philosophy

### 1.1 Shift-Left Testing

Testing is a design activity, not a post-implementation activity.

| Principle | Practice |
|---|---|
| Test before code | Write test cases from this document before writing service methods |
| Fail fast | Every PR triggers full unit + integration suite in CI before review |
| Defect prevention | Edge cases identified in this document are fixed in design, not in production |
| Living tests | Test matrix is the source of truth for feature completeness |

**Order of work per feature:**
```
1. Review test cases from this document for the feature
2. Write unit tests for the service/engine (TDD optional but preferred for engines)
3. Implement the service/engine
4. Write integration tests against real DB
5. PR only passes when all relevant TC-* cases pass
```

---

### 1.2 Test Pyramid

```
         ┌─────────────────────┐
         │    E2E / UAT (10%)  │   Playwright — admin portal + key flows
         │  ~30 scenarios      │
         ├─────────────────────┤
         │  Integration (30%)  │   Vitest + mongodb-memory-server (replica set)
         │  ~60 scenarios      │   Real transactions, real indexes, real TTL
         ├─────────────────────┤
         │   Unit Tests (60%)  │   Vitest — services, engines, utils
         │  ~120 scenarios     │   Mocked repositories. Pure function engines.
         └─────────────────────┘
```

**Tooling:**

| Layer | Tool | Notes |
|---|---|---|
| Unit | Vitest 2.x | TS-native, fast, ESM-compatible with Next.js |
| Integration | Vitest + `mongodb-memory-server` 10.x | Replica set mode for transaction support |
| Concurrency | Vitest + real Atlas M10 test cluster | Memory server has race condition limits |
| E2E / UAT | Playwright 1.x | Browser automation against local dev server |
| Load / Perf | k6 | Scripted scenarios, threshold assertions |
| CI | GitHub Actions | Runs unit + integration on every PR; E2E on merge to main |

**Test cluster:** Dedicated Atlas M10 cluster (`company-test`) — separate from development. Wiped before each integration run via `beforeAll` seed helper. Never shares connection string with production.

---

### 1.3 Definition of Done

A feature is **Done** when:

- [ ] All TC-* scenarios for the feature pass
- [ ] Unit test coverage ≥ 80% for the service file (lines + branches)
- [ ] Unit test coverage = 100% for engine files (`payrollEngine`, `geoFenceEngine`, `dateUtils`)
- [ ] No ESLint errors, no TypeScript errors (`tsc --noEmit`)
- [ ] Integration tests pass against `mongodb-memory-server` in CI
- [ ] No `console.log` left in production code paths
- [ ] `AppError` used for all error paths — no raw `throw new Error()` in service layer
- [ ] API error code from `ApiErrorCode` enum used for every error response
- [ ] Audit log written for all state-changing operations

---

### 1.4 Quality Gates

| Gate | Threshold | Enforcement |
|---|---|---|
| Unit test coverage (services) | ≥ 80% | CI fails below threshold |
| Unit test coverage (engines/utils) | 100% | CI fails below threshold |
| Integration tests | 100% pass | PR blocked on failure |
| Security tests (TC-SEC) | 100% pass | Release blocked |
| Concurrency tests (TC-CON) | 100% pass | Release blocked |
| TypeScript strict mode | Zero errors | CI fails on any `tsc` error |
| Lint | Zero errors | CI fails on any ESLint error |
| Performance P95 latency | ≤ 500ms (API) | k6 threshold — advisory for V1 |
| UAT sign-off | 100% of TC-UAT | Client approval required before production |

---

## 2. Unit Testing Strategy

### 2.1 Testing Stack Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/models/**', 'src/lib/db/**'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

```typescript
// src/test/setup.ts
import { vi } from 'vitest';

// Suppress console.log in test runs
vi.spyOn(console, 'log').mockImplementation(() => {});

// Reset all mocks between tests
afterEach(() => vi.clearAllMocks());
```

### 2.2 Repository Mock Pattern

All unit tests mock repositories. Engines are tested with pure inputs (no mocks needed).

```typescript
// src/test/mocks/repositoryMocks.ts
export const mockLeaveRepository = {
  findById:    vi.fn(),
  findByEmployee: vi.fn(),
  updateStatus:   vi.fn(),
  create:         vi.fn(),
};
export const mockUserRepository = {
  findById:            vi.fn(),
  atomicBalanceDeduct: vi.fn(),
  atomicBalanceRestore: vi.fn(),
};
// ... one mock object per repository
```

---

### 2.3 `authService` — Unit Test Coverage

**Key scenarios (minimum 10):**

| # | Scenario | Key Assert |
|---|---|---|
| U-AUTH-01 | Login with valid credentials → returns access + refresh tokens | Tokens are JWTs signed with `JWT_SECRET` |
| U-AUTH-02 | Login with wrong password → throws `INVALID_CREDENTIALS` | `bcryptjs.compare` returns false → `AUTH_001` |
| U-AUTH-03 | Login with unknown email → throws `INVALID_CREDENTIALS` (same error — no enumeration) | Both cases return identical error |
| U-AUTH-04 | Login with deactivated account → throws `ACCOUNT_DEACTIVATED` | Checks `isActive` before password compare |
| U-AUTH-05 | Login with unregistered device → throws `DEVICE_NOT_REGISTERED` | `registeredDevice` is null |
| U-AUTH-06 | Login with device fingerprint mismatch → throws `DEVICE_FINGERPRINT_MISMATCH` | Hash comparison fails |
| U-AUTH-07 | Refresh with valid refresh token → returns new access token | Old session updated with `lastUsedAt` |
| U-AUTH-08 | Refresh with revoked session → throws `TOKEN_INVALID` | `isRevoked: true` check |
| U-AUTH-09 | Refresh with expired session → throws `TOKEN_EXPIRED` | `expiresAt < now()` |
| U-AUTH-10 | Password reset request for existing email → creates `passwordResetTokens` doc, returns success | Token hash stored, raw token not stored |
| U-AUTH-11 | Password reset request for nonexistent email → returns same success response (no enumeration) | Rate limiter hit, same 200 response |
| U-AUTH-12 | Password reset confirm with valid token → updates `passwordHash`, revokes all `deviceSessions` | `withTransaction` wraps both writes |
| U-AUTH-13 | Password reset confirm with expired token → throws `PASSWORD_RESET_TOKEN_EXPIRED` | TTL check against `expiresAt` |
| U-AUTH-14 | Password reset confirm with already-used token → throws `PASSWORD_RESET_TOKEN_INVALID` | `isUsed: true` check |
| U-AUTH-15 | Refresh within 30-day inactivity window, within 90-day absolute max | `expiresAt` extended by +30d (capped at `absoluteExpiresAt`); new access token returned; `lastUsedAt` updated |
| U-AUTH-16 | Refresh after 30-day inactivity (`expiresAt` in past, `absoluteExpiresAt` future) | `401 TOKEN_EXPIRED (AUTH_002)` |
| U-AUTH-17 | Refresh within 30-day inactivity but past 90-day absolute max | `401 TOKEN_EXPIRED (AUTH_002)` |
| U-AUTH-18 | Refresh where `now() + 30d > absoluteExpiresAt` | New `expiresAt = absoluteExpiresAt` (capped, never overshot); access token still issued |
| U-AUTH-19 | Refresh after password reset — all sessions revoked | `401 TOKEN_INVALID (AUTH_003)` — `isRevoked: true` on all sessions |
| U-AUTH-20 | Refresh after employee deactivation — sessions revoked at deactivation time | `401 TOKEN_INVALID (AUTH_003)` |

---

### 2.4 `attendanceService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-ATT-01 | Checkin within geo-fence, fresh nonce → creates session, updates day | `attendanceDayId` set, `isActive: true` |
| U-ATT-02 | Checkin outside geo-fence (isEnabled: true) → throws `OUTSIDE_GEOFENCE` | Error before session insert |
| U-ATT-03 | Checkin with GPS accuracy > threshold → throws `GPS_ACCURACY_LOW` | Checked before geo-fence |
| U-ATT-04 | Checkin with replayed nonce → throws `NONCE_REPLAYED` | `usedNonces.create()` duplicate key |
| U-ATT-05 | Checkin outside timestamp window → throws `OUTSIDE_TIMESTAMP_WINDOW` | `|serverTime - checkIn.timestamp| > windowMinutes` |
| U-ATT-06 | Checkin when active session exists → throws `SESSION_ALREADY_ACTIVE` | Partial index error code `11000` |
| U-ATT-07 | Checkout with valid active session → closes session, updates `durationMinutes` and `AttendanceDay` | `isActive: false`, `totalMinutes` updated |
| U-ATT-08 | Checkout without active session → throws `NO_ACTIVE_SESSION` | No `isActive: true` session found |
| U-ATT-09 | Checkout on weekend day → day status remains `weekend` | Status derivation priority respected |
| U-ATT-10 | Checkout after required minutes → `status: 'present'` | `totalMinutes >= requiredMinutes` |
| U-ATT-11 | Checkout between half-day threshold and required → `status: 'half-day'` | Threshold range check |
| U-ATT-12 | Checkout before half-day threshold → `status: 'absent'` | Below minimum threshold |
| U-ATT-13 | Checkin on holiday → `AttendanceDay.status` starts as `holiday`; checkin still allowed | Holiday flag does not block checkin |
| U-ATT-14 | Auto-close session (cron) → `closedBySystem: true`, duration capped at `workEndTime` | `systemCloseReason: 'midnight-rollover'` |

---

### 2.5 `leaveService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-LVE-01 | Apply leave with sufficient balance → creates `LeaveRequest` with `status: 'pending'` | Balance NOT deducted until approval |
| U-LVE-02 | Apply leave with zero balance → throws `LEAVE_BALANCE_INSUFFICIENT` | Balance check before insert |
| U-LVE-03 | Apply leave overlapping approved leave → throws `LEAVE_DATE_CONFLICT` | `affectedDates` multikey index query |
| U-LVE-04 | Apply leave on weekend → throws `LEAVE_ON_WEEKEND` | Filtered from `affectedDates` |
| U-LVE-05 | Apply leave on holiday → throws `LEAVE_ON_HOLIDAY` | Holiday check via `holidayRepository` |
| U-LVE-06 | `leaveYear` computed from `startDate` + `leaveYearStartMonth` | `getLeaveYearBoundaries()` called with settings |
| U-LVE-07 | `affectedDates` excludes weekends and holidays | Server-computed, never from client |
| U-LVE-08 | Approve leave → deducts balance atomically, updates day statuses, creates `leaveTransaction` | All in `withTransaction` |
| U-LVE-09 | Approve leave with carry-forward → carry-forward consumed first | `carriedForward` deducted before `currentYear` |
| U-LVE-10 | Approve leave with exact balance → balance reaches 0, not negative | Atomic `$expr $gte` prevents underflow |
| U-LVE-11 | Reject pending leave → restores balance, creates `leaveTransaction` | `restoration-rejection` transaction type |
| U-LVE-12 | Cancel pending leave (employee) → `status: 'cancelled'`, no balance change | Pending has no deduction to restore |
| U-LVE-13 | Cancel approved leave (employee) → throws `LEAVE_CANCELLATION_NOT_ALLOWED` | Only `pending` can be cancelled by employee |
| U-LVE-14 | Revoke approved leave (admin) → restores balance, updates attendance days, `leaveTransaction` | `restoration-revocation` type |
| U-LVE-15 | Revoke non-approved leave → throws `LEAVE_REVOCATION_NOT_ALLOWED` | Only `approved` can be revoked |
| U-LVE-16 | Half-day leave deducts 0.5 days | `totalDays: 0.5`, balance reduced by 0.5 |
| U-LVE-17 | Leave spanning leave year boundary → `leaveYear` set from `startDate` | Cross-year leave uses start date's year |

---

### 2.6 `regularizationService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-REG-01 | Apply regularization within lookback window → creates request | Date diff ≤ `regularizationLookbackDays` |
| U-REG-02 | Apply regularization beyond lookback window → throws `REGULARIZATION_LOOKBACK_EXCEEDED` | |
| U-REG-03 | Apply duplicate regularization for same employee+date → throws `REGULARIZATION_DUPLICATE` | Unique check via repository |
| U-REG-04 | Approve regularization → updates `AttendanceSession` + `AttendanceDay` atomically | `withTransaction`, `attendanceDayId` set on request |
| U-REG-05 | Reject regularization → `status: 'rejected'`, no attendance changes | |
| U-REG-06 | Cancel pending regularization (employee) → `status: 'cancelled'` | |
| U-REG-07 | Approve `forgotCheckOut` type → sets `checkOut` timestamp to requested value | |
| U-REG-08 | Approve `forgotCheckIn` type → creates session with requested `checkIn` | |

---

### 2.7 `payrollService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-PAY-01 | Compute payroll → creates `PayrollSummary` with `status: 'draft'` | All formula fields populated |
| U-PAY-02 | Compute payroll for existing draft → overwrites (idempotent recompute) | Existing draft replaced |
| U-PAY-03 | Compute payroll for finalised month → throws `PAYROLL_ALREADY_FINALISED` | `status: 'finalised'` is write-locked |
| U-PAY-04 | Finalise draft → `status: 'finalised'`, `finalisedAt` set | Cannot be recomputed after |
| U-PAY-05 | `employeeSnapshot` excludes `passwordHash` | Snapshot strips sensitive fields |
| U-PAY-06 | `joiningDateSnapshot` and `leavingDateSnapshot` captured at compute time | Snapshot is stable even if user record changes |
| U-PAY-07 | Unfinalize payroll → `status: 'draft'`; `unfinalisedAt` + `unfinalisedBy` set | Audit log `PAYROLL_UNFINALISED` written; subsequent recompute now allowed |
| U-PAY-08 | Recompute after unfinalize → new `payableAmount` reflects current attendance/leave data | Overwrites all draft fields; finalised fields cleared |

---

### 2.8 `notificationService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-NOT-01 | Send push to active FCM token → FCM API called with correct payload | |
| U-NOT-02 | FCM returns `registration-token-not-registered` → marks token `isActive: false`, does NOT throw | Failure is swallowed |
| U-NOT-03 | Send email via Brevo → correct `POST` to Brevo REST API | Brevo API key in header |
| U-NOT-04 | Notification log inserted regardless of FCM/email success | `Notification` doc created before sends |
| U-NOT-05 | Employee with no active FCM token → notification logged, push skipped gracefully | No error thrown |

---

### 2.9 `settingsService` — Unit Test Coverage

| # | Scenario | Key Assert |
|---|---|---|
| U-SET-01 | Update settings → `findByIdAndUpdate('company-settings', ...)` called | Singleton ID used |
| U-SET-02 | `halfDayThresholdMinutes >= requiredDailyMinutes` → throws `SETTINGS_VALIDATION_FAILED` | Cross-field validation |
| U-SET-03 | `workStartTime >= workEndTime` → throws `SETTINGS_VALIDATION_FAILED` | |
| U-SET-04 | `workingDays` empty array → throws `SETTINGS_VALIDATION_FAILED` | At least one working day required |
| U-SET-05 | Valid update → audit log `SETTINGS_UPDATED` written | |
| U-SET-06 | `leaveYearStartMonth` change noted with warning in response | UI must warn admin about cron schedule impact |

---

### 2.10 Engine Unit Tests

#### `payrollEngine.ts` — 100% coverage required

| # | Scenario | Key Assert |
|---|---|---|
| E-PAY-01 | Full month, no absences → `payableAmount = monthlySalary` | `effectiveLwpDays + absentDays = 0` |
| E-PAY-02 | 1 LWP day in 22-day month at ₹50,000 → `payableAmount = ₹47,727.27` | Exact rounding: `Math.round(47727.272... * 100) / 100` |
| E-PAY-03 | Half-day LWP → 0.5 day deducted (`effectiveLwpDays = 0.5`) | |
| E-PAY-04 | Half-day present → `effectivePresentDays += 0.5` | |
| E-PAY-05 | Mid-month joiner (day 15 of 31) → `effectiveWorkingDays` = working days from day 15 only | Uses `max(monthStart, joinDate)` |
| E-PAY-06 | Mid-month leaver → `effectiveWorkingDays` ends at `dateOfLeaving` | |
| E-PAY-07 | `payableAmount` never negative → min 0 cap | `Math.max(0, ...)` |
| E-PAY-08 | All LWP (100% absent) → `payableAmount = 0` | |
| E-PAY-09 | Rounding: intermediates at full precision; only `payableAmount` rounded to 2dp | `perDaySalary * 3` at full precision, then round |
| E-PAY-10 | Paid leave days do not count as deductible | `paidLeaveDays` excluded from `deductibleDays` |
| E-PAY-11 | `effectiveWorkingDays = 0` (employee joined and left same day, non-working day) → handled without divide-by-zero | Guard: return `payableAmount: 0` |
| E-PAY-12 | `presentDays < 0` supplied as input → throws `INVALID_PAYROLL_INPUT` | Engine rejects invalid inputs before any computation |
| E-PAY-13 | `monthlySalary < 0` supplied as input → throws `INVALID_PAYROLL_INPUT` | Negative salary is a data-integrity error, not a legitimate payroll case |

#### `geoFenceEngine.ts` — 100% coverage required

| # | Scenario | Key Assert |
|---|---|---|
| E-GEO-01 | Employee at office centre (0m distance) → `isWithinGeoFence: true` | |
| E-GEO-02 | Employee exactly at radius boundary → `isWithinGeoFence: true` | Boundary-inclusive |
| E-GEO-03 | Employee 1m beyond radius → `isWithinGeoFence: false` | |
| E-GEO-04 | Geo-fence disabled (`isEnabled: false`) → always `isWithinGeoFence: true` | |
| E-GEO-05 | GPS accuracy > threshold → `lowGpsAccuracy: true` flag set | |
| E-GEO-06 | Haversine calculation correct for known lat/lon pair | Use precalculated reference distance |
| E-GEO-07 | `possibleMockGps: true` when accuracy == 0 (emulator) | Zero accuracy = mock GPS heuristic |

#### `dateUtils.ts` — 100% coverage required

| # | Scenario | Key Assert |
|---|---|---|
| E-DAT-01 | `getLeaveYearBoundaries(2026-06-14, 1)` → `{ leaveYear: 2026, start: 2026-01-01, end: 2026-12-31 }` | Jan start |
| E-DAT-02 | `getLeaveYearBoundaries(2026-06-14, 4)` → `{ leaveYear: 2026, start: 2026-04-01, end: 2027-03-31 }` | Apr start, spans years |
| E-DAT-03 | `getLeaveYearBoundaries(2026-03-15, 4)` → `{ leaveYear: 2025, start: 2025-04-01, end: 2026-03-31 }` | Before April = previous year |
| E-DAT-04 | `isWorkingDay(2026-06-13, ['saturday','sunday'])` → `false` (Saturday) | |
| E-DAT-05 | `isWorkingDay(2026-06-14, ['saturday','sunday'])` → `false` (Sunday) | |
| E-DAT-06 | `getWorkingDaysBetween(start, end, workingDays, holidays)` excludes holidays and weekends | |
| E-DAT-07 | Leap year: Feb 29 is valid `dateString` | |

---

### 2.11 Refresh Token Session Policy

#### Design Decision: Hybrid Session Expiry (Option C — Chosen)

| Option | Inactivity Timeout | Absolute Max | UX for Daily Users | Security |
|---|---|---|---|---|
| A. Sliding Window | Extends on each refresh | None | Excellent — never expires if active | Weakest — stolen token valid indefinitely |
| B. Absolute Expiry | N/A | Fixed from registration | Poor — forced re-login on fixed schedule | Strongest |
| **C. Hybrid (chosen)** | **30 days** | **90 days** | **Good — daily active users unaffected** | **Good — worst case 90 days** |

**Rationale:** Employees use the Flutter app daily for check-in/checkout. A pure absolute window (B) punishes active daily users with forced re-logins every N days regardless of usage. A pure sliding window (A) means a stolen or lost device's session refreshes indefinitely — unacceptable for an app with payroll and attendance data. Hybrid bounds worst-case stolen-token exposure to 90 days while leaving seamless UX for daily active employees (30-day inactivity timeout is effectively never triggered for someone checking in every weekday).

#### Session Contract

| Parameter | Value | Storage |
|---|---|---|
| Access token TTL | 15 minutes | JWT `exp` claim |
| Refresh inactivity timeout | 30 days | `deviceSessions.expiresAt` — extended on each successful refresh |
| Refresh absolute maximum | 90 days | `deviceSessions.absoluteExpiresAt` — set at device registration, **never mutated** |

**Required schema addition to `deviceSessions`:**
```typescript
absoluteExpiresAt: { type: Date, required: true }
// Set to createdAt + 90 days at device registration. Never updated on refresh.
```

#### Rotation Rules

1. On valid refresh: issue new access token; update `lastUsedAt`; extend `expiresAt` by +30 days — **capped at `absoluteExpiresAt`** (never push past the hard limit)
2. `expiresAt < now()` → reject `TOKEN_EXPIRED (AUTH_002)` — 30-day inactivity exceeded
3. `absoluteExpiresAt < now()` → reject `TOKEN_EXPIRED (AUTH_002)` — 90-day hard limit exceeded; full re-login required
4. Session ID is **not rotated** per refresh — same `deviceSessionId` persists for device lifetime (prevents race conditions when Flutter makes concurrent API calls)

#### Lifecycle Event Handling

| Event | Sessions Affected | Immediate Action |
|---|---|---|
| Employee logout | Current device session | `isRevoked = true` |
| Admin device reset | Specific named session | `isRevoked = true` |
| Password reset (confirmed) | **All** employee sessions | All `isRevoked = true` — full re-login on all devices |
| Employee deactivation | **All** employee sessions | All `isRevoked = true` immediately — no grace period |
| Employee re-activation | All sessions | Remain revoked — employee must re-login on each device individually |

---

## 3. Attendance Test Matrix

**TC-ATT prefix. Precondition unless stated: employee active, device registered, geo-fence enabled, within fence, GPS accurate.**

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-ATT-001 | First check-in of the day | No session exists, working day | Session created `isActive: true`; `AttendanceDay` created `status: 'absent'`; nonce consumed in `usedNonces` | Critical |
| TC-ATT-002 | First checkout of the day | Active session exists | Session `isActive: false`, `durationMinutes` set; `AttendanceDay.totalMinutes` updated; status derived | Critical |
| TC-ATT-003 | Checkout sets `status: 'present'` | `totalMinutes >= requiredDailyMinutes` | `AttendanceDay.status = 'present'`, `overtimeMinutes` computed | Critical |
| TC-ATT-004 | Checkout sets `status: 'half-day'` | `halfDayThreshold <= totalMinutes < requiredDailyMinutes` | `status = 'half-day'` | Critical |
| TC-ATT-005 | Checkout sets `status: 'absent'` | `totalMinutes < halfDayThreshold` | `status = 'absent'` | Critical |
| TC-ATT-006 | Multiple sessions same day | First session closed, employee re-checks in | Second session created; `AttendanceDay.totalMinutes` is cumulative across sessions | High |
| TC-ATT-007 | Double check-in (same request twice) | Active session exists | Second request → `SESSION_ALREADY_ACTIVE (ATT_003)` | Critical |
| TC-ATT-008 | Simultaneous double check-in (race) | Two concurrent requests, no session | One succeeds (partial unique index); other returns `ATT_003` | Critical |
| TC-ATT-009 | Checkout without prior check-in | No active session | `NO_ACTIVE_SESSION (ATT_005)` | High |
| TC-ATT-010 | Check-in then immediate checkout (0 min) | Session created at T, checkout at T | `durationMinutes = 0`; `status = 'absent'` | Medium |
| TC-ATT-011 | Midnight rollover — orphaned session | Session open from previous day | Cron closes session at `workEndTime`; `closedBySystem: true`; `systemCloseReason: 'midnight-rollover'`; duration capped | Critical |
| TC-ATT-012 | Midnight rollover — cron fires twice (Vercel retry) | First run succeeded (`systemEvents` updated) | Second run detects `systemEvent { status: 'success' }` and skips without modifying sessions | Critical |
| TC-ATT-013 | Check-in on working day | `companySettings.workingDays` includes today | Allowed | High |
| TC-ATT-014 | Check-in on weekend | Today is Saturday/Sunday | Allowed but `AttendanceDay.status` derivation respects weekend priority | Medium |
| TC-ATT-015 | Check-in on public holiday | Holiday exists for today | Allowed but `AttendanceDay.status` = `holiday` after checkout regardless of minutes | Medium |
| TC-ATT-016 | Check-in by deactivated user | `user.isActive = false` | `ACCOUNT_DEACTIVATED (AUTH_007)` at middleware level | Critical |
| TC-ATT-017 | Check-in outside geo-fence | `isEnabled: true`, distance > radius | `OUTSIDE_GEOFENCE (ATT_001)` — nonce still consumed (replay prevention) | High |
| TC-ATT-018 | Check-in with GPS accuracy above threshold | `accuracy > gpsAccuracyThresholdMeters` | `GPS_ACCURACY_LOW (ATT_002)` | High |
| TC-ATT-019 | Check-in outside timestamp window | `|clientTime - serverTime| > windowMinutes` | `OUTSIDE_TIMESTAMP_WINDOW (ATT_007)` | High |
| TC-ATT-020 | Replay attack — same nonce submitted twice | First request consumed nonce | Second request → `NONCE_REPLAYED (ATT_004)` regardless of other params | Critical |
| TC-ATT-021 | Device changed without reset | `deviceFingerprint` differs from registered device | `DEVICE_FINGERPRINT_MISMATCH (AUTH_005)` | Critical |
| TC-ATT-022 | Geo-fence disabled | `isEnabled: false` | Check-in allowed regardless of location | Medium |
| TC-ATT-023 | Check-in with `possibleMockGps` heuristic | `accuracy = 0` (emulator) | `flags.possibleMockGps = true`; session created but flagged for admin review | High |
| TC-ATT-024 | GET attendance status — active session | Employee has active session | Response includes `currentSession.checkInTimestamp` (ISO 8601) | High |
| TC-ATT-025 | GET attendance status — no session | No session today | `isCheckedIn: false`, `todaySummary.totalMinutes` from completed sessions | High |

**Timezone & IST boundary scenarios — precondition: `companySettings.timezone = 'Asia/Kolkata'` (UTC+5:30)**

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-ATT-026 | Check-in at 23:45 IST; cron closes at 02:00 IST next calendar day | Session open past IST midnight | Session `dateString` = IST date of check-in (e.g. `'2026-06-14'`, NOT `'2026-06-15'`); `AttendanceDay` for check-in IST date updated; cron closure attributed to correct day | Critical |
| TC-ATT-027 | Checkout after IST midnight — check-in 23:45 IST, checkout 00:15 IST next day | Active session spans IST midnight | Session `dateString` = check-in IST date; `durationMinutes = 30`; `AttendanceDay` for check-in date gets `totalMinutes`; next calendar day has no session from this event | Critical |
| TC-ATT-028 | Month boundary — check-in Jan 31 23:50 IST, checkout Feb 1 00:05 IST | Session spans month boundary | `AttendanceDay.dateString = 'YYYY-01-31'`; January payroll includes this day; February payroll does not | Critical |
| TC-ATT-029 | Leave year boundary — leave applied 23:59 IST on Mar 31 (April fiscal year) | `leaveYearStartMonth: 4`; date is last moment of fiscal year | `leaveYear` = year ending that day (e.g. 2025 for 2025–2026 year); balance drawn from correct fiscal year; NOT rolled into next year | High |
| TC-ATT-030 | UTC → IST dateString derivation | UTC timestamp `2026-06-14T18:30:00Z` stored in DB | `dateString = '2026-06-15'` (UTC 18:30 = IST 00:00 June 15); all date computations use IST, never raw UTC date | Critical |

**Employee reactivation scenarios**

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-ATT-031 | Deactivate employee — check-in blocked immediately | Admin deactivates active employee | Check-in returns `ACCOUNT_DEACTIVATED (AUTH_007)`; all `deviceSessions` set `isRevoked: true` at deactivation time; no existing session remains valid | Critical |
| TC-ATT-032 | Re-activate employee — must re-login; old tokens rejected | Admin re-activates deactivated employee | Pre-deactivation device sessions remain `isRevoked: true`; employee logs in fresh → new `deviceSession` created; check-in succeeds | Critical |
| TC-ATT-033 | Leave balance unchanged across deactivation/reactivation cycle | Employee has 8 PL days before deactivation | After reactivation: `paidLeave.currentYear = 8` (unchanged); `leaveTransactions` ledger intact and queryable | High |
| TC-ATT-034 | Audit log continuity across deactivation/reactivation | Full lifecycle | `auditLogs` contains pre-deactivation events + `EMPLOYEE_DEACTIVATED` event + `EMPLOYEE_REACTIVATED` event + post-reactivation events; no gap; all with actor + timestamp | High |
| TC-ATT-035 | Payroll for pre-deactivation months computable | Employee deactivated mid-month | Payroll for months fully before deactivation computes normally; deactivation-month payroll uses `effectiveWorkingDays` bounded to active period | High |

---

## 4. Leave Test Matrix

**Precondition unless stated: employee active, has sufficient leave balance, applying for future working day.**

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-LVE-001 | Apply paid leave — full day | `paidLeave.currentYear >= 1` | `LeaveRequest` created `status: 'pending'`; balance unchanged | Critical |
| TC-LVE-002 | Apply sick leave — full day | `sickLeave.currentYear >= 1` | Same as above | Critical |
| TC-LVE-003 | Apply casual leave — full day | `casualLeave.currentYear >= 1` | Same as above | Critical |
| TC-LVE-004 | Apply LWP | Any balance state | Created with `leaveType: 'lwp'`; no balance deduction ever | Critical |
| TC-LVE-005 | Apply half-day leave | Sufficient balance | `duration: 'half'`, `totalDays: 0.5` | High |
| TC-LVE-006 | Apply full-day leave | Sufficient balance | `duration: 'full'`, `totalDays = count of working days in range` | High |
| TC-LVE-007 | Approve leave — balance deduction | `paidLeave.currentYear = 5`, applying 3 days | After approval: `currentYear = 2`; `leaveTransaction { type: 'deduction-approval', days: -3 }` created | Critical |
| TC-LVE-008 | Approve leave — carry-forward consumed first | `carriedForward = 2`, `currentYear = 3`, applying 4 days | `carriedForward → 0`, `currentYear → 1` | Critical |
| TC-LVE-009 | Balance exactly exhausted | `currentYear = 3`, applying 3 days | Balance reaches 0; request approved; no underflow | Critical |
| TC-LVE-010 | Apply leave exceeding balance | `paidLeave.currentYear + carriedForward = 2`, applying 3 days | `LEAVE_BALANCE_INSUFFICIENT (LVE_001)` | Critical |
| TC-LVE-011 | Apply leave on weekend | `startDate` is Saturday | `affectedDates` excludes Saturday; if no working days in range → `LEAVE_ON_WEEKEND` | High |
| TC-LVE-012 | Apply leave on public holiday | Only day in range is a holiday | `LEAVE_ON_HOLIDAY (LVE_003)` | High |
| TC-LVE-013 | Apply leave overlapping approved leave | Employee has approved leave on overlapping date | `LEAVE_DATE_CONFLICT (LVE_002)` | Critical |
| TC-LVE-014 | Reject leave | Admin rejects `pending` request | `status: 'rejected'`; balance unchanged (was not deducted); `leaveTransaction` NOT created | High |
| TC-LVE-015 | Revoke approved leave | Admin revokes `approved` request | Balance restored (`restoration-revocation`); `attendanceDays` reverted; notification sent | Critical |
| TC-LVE-016 | Cancel pending leave (employee) | Employee cancels own `pending` request | `status: 'cancelled'`; no balance change | High |
| TC-LVE-017 | Cancel approved leave (employee) | Employee tries to cancel `approved` | `LEAVE_CANCELLATION_NOT_ALLOWED (LVE_007)` | High |
| TC-LVE-018 | Carry-forward credit at year start | `paidLeave.currentYear` at year end = 3; max carry = 5 | `carriedForward += 3`; `leaveTransaction { type: 'carry-forward-credit' }` | Critical |
| TC-LVE-019 | Carry-forward expiry | `carriedForward = 5`, `carryForwardExpiry < today` | Balance zeroed for carry-forward; `leaveTransaction { type: 'carry-forward-expiry', days: -5 }` | Critical |
| TC-LVE-020 | Annual allocation at leave year start | Leave year begins | All active employees receive `annualAllocation` days; `leaveYearAllocation` doc created; `leaveTransaction { type: 'annual-allocation' }` | Critical |
| TC-LVE-021 | Pro-rated allocation — mid-year joiner | Employee joined 6 months into leave year | `allocatedDays = annualAllocation × (eligibleDays / totalLeaveDays)`; `isProRated: true` | High |
| TC-LVE-022 | Leave spanning fiscal year boundary (Apr start) | Leave from 2026-03-30 to 2026-04-02 with `leaveYearStartMonth: 4` | `leaveYear` set from `startDate` (2025 year); `affectedDates` excludes weekend; balance drawn from year 2025 | High |
| TC-LVE-023 | `leaveYear` computed correctly for April fiscal year | Apply on 2026-05-01, `leaveYearStartMonth: 4` | `leaveYear: 2026` | High |
| TC-LVE-024 | `leaveYear` computed correctly — before fiscal start | Apply on 2026-02-01, `leaveYearStartMonth: 4` | `leaveYear: 2025` (still in 2025–2026 year) | High |
| TC-LVE-025 | Double approval race (two admins) | Two admins approve same pending request simultaneously | One approval succeeds; second fails gracefully (status already changed) | Critical |

**Leave applied while employee is checked in (active session)**

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-LVE-026 | Apply leave for today while active session exists | Employee has `isActive: true` attendance session; applies sick leave for today | Leave request created `status: 'pending'`; no `LEAVE_DATE_CONFLICT` error (active session ≠ approved leave); `affectedDates = [today]` | High |
| TC-LVE-027 | Approve leave for today while session still active | Admin approves sick leave; employee still checked in | `AttendanceDay.status = 'leave'`; active session remains open (employee still physically present); `leaveTransaction { type: 'deduction-approval' }` created; leave status takes precedence over session status | Critical |
| TC-LVE-028 | Approve half-day leave today; session has 4+ hours already | Active session with `totalMinutes > halfDayThreshold`; admin approves 0.5-day sick leave | `AttendanceDay.status = 'half-day'` (leave-driven, not attendance-driven); payroll: `paidLeaveDays += 0.5`; session minutes do NOT contribute to `effectivePresentDays` for this day | Critical |
| TC-LVE-029 | Payroll: day with both attendance session and approved leave | `AttendanceDay.status = 'leave'`; session record exists | Payroll counts day as `paidLeaveDays`; day excluded from `presentDays`; `payableAmount` unaffected (paid leave is paid); approved leave status always overrides attendance status | Critical |
| TC-LVE-030 | Retroactive leave approval for past day that has a historical session | Employee worked on Day X; admin approves sick leave for Day X retroactively | `AttendanceDay.status` updated `'present'` → `'leave'`; session record preserved (not deleted); if month payroll is `'draft'` → recompute reflects change; if `'finalised'` → response includes warning about stale payroll | High |

---

## 5. Regularization Test Matrix

| TC-ID | Scenario | Precondition | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-REG-001 | Apply `forgotCheckIn` within lookback window | Date is within `regularizationLookbackDays` | Request created `status: 'pending'` | High |
| TC-REG-002 | Apply regularization beyond lookback window | Date is older than lookback | `REGULARIZATION_LOOKBACK_EXCEEDED (REG_001)` | High |
| TC-REG-003 | Apply duplicate regularization (same employee + date) | Request already exists for this date | `REGULARIZATION_DUPLICATE (REG_002)` | High |
| TC-REG-004 | Approve `forgotCheckIn` → creates session with requested time | Admin approves | `AttendanceSession` created with `requestedCheckIn`; `AttendanceDay` updated atomically | High |
| TC-REG-005 | Approve `forgotCheckOut` → sets checkout on existing session | Active session exists from real check-in | Session closed at `requestedCheckOut`; day recomputed | High |
| TC-REG-006 | Approve `workAwayFromOffice` → marks day as present | No session exists | `AttendanceDay.status = 'present'`; no session created | High |
| TC-REG-007 | Approve `officialTravel` → marks day as present | No session exists | Same as above | High |
| TC-REG-008 | Approve `clientVisit` → marks day as present | No session exists | Same as above | High |
| TC-REG-009 | Reject regularization | Admin rejects `pending` request | `status: 'rejected'`; no attendance changes | High |
| TC-REG-010 | Cancel pending regularization (employee) | Employee own pending request | `status: 'cancelled'` | Medium |
| TC-REG-011 | Approve `forgotCheckIn` when real session also exists | Employee has real check-in + regularization request | Regularization session added as additional session; cumulative minutes updated | High |
| TC-REG-012 | `attendanceDayId` populated on approval | Before approval `attendanceDayId` is null | After approval `attendanceDayId` is set | High |

---

## 6. Payroll Test Matrix

**Precondition: attendance data complete for the target month, no prior payroll for month (or `status: 'draft'`).**

| TC-ID | Scenario | Key Input | Expected Output | Severity if Fail |
|---|---|---|---|---|
| TC-PAY-001 | Full attendance, no leave, no absences | 22 working days, 22 present, salary ₹50,000 | `payableAmount = ₹50,000.00`, `deductions = 0` | Critical |
| TC-PAY-002 | 1 LWP full day in 22-day month | `lwpDays = 1`, salary ₹50,000 | `payableAmount = ₹47,727.27`, `perDaySalary = 2272.7273` | Critical |
| TC-PAY-003 | 1 half-day LWP | `halfDayLwpDays = 1`, `effectiveLwpDays = 0.5` | Deduction = `0.5 × perDaySalary` | Critical |
| TC-PAY-004 | Half-day attendance (present) | `halfDays = 5`, `presentDays = 17` | `effectivePresentDays = 17 + 2.5 = 19.5` | Critical |
| TC-PAY-005 | Mid-month joiner (joined day 15) | `dateOfJoining = 15th`, 10 working days from 15th | `effectiveWorkingDays = 10`, `payableAmount = salary × (10/10)` if fully present | Critical |
| TC-PAY-006 | Mid-month leaver (left day 20) | `dateOfLeaving = 20th`, 15 working days until 20th | `effectiveWorkingDays = 15` | Critical |
| TC-PAY-007 | Employee on approved paid leave | `paidLeaveDays = 3`, present rest of month | Leave days not deductible; `payableAmount = full salary` | Critical |
| TC-PAY-008 | Mix: 1 PL + 1 LWP + 1 absent + 2 half-day present | Combined | `effectivePresentDays = 2×0.5 + (remaining full present)`; PL not deducted; LWP + absent deducted | Critical |
| TC-PAY-009 | Payroll recomputation (draft) | Existing `status: 'draft'` payroll | Overwritten with fresh computation | High |
| TC-PAY-010 | Payroll recomputation (finalised) | `status: 'finalised'` | `PAYROLL_ALREADY_FINALISED (PAY_001)` | Critical |
| TC-PAY-011 | Rounding: 3 LWP days at ₹50,000/22 days | `deductibleDays = 3` | `payableAmount = Math.round(Math.max(0, 50000 - 3×(50000/22)) × 100)/100` = `₹43,181.82` | Critical |
| TC-PAY-012 | 100% absent — zero pay | All 22 days absent/LWP | `payableAmount = 0.00` (not negative) | Critical |
| TC-PAY-013 | `employeeSnapshot` does not include `passwordHash` | Any payroll computation | `employeeSnapshot` object has no `passwordHash` field | Critical |
| TC-PAY-014 | Finalise payroll | `status: 'draft'` | `status: 'finalised'`, `finalisedAt` set, `finalisedBy` set | High |
| TC-PAY-015 | `joiningDateSnapshot` and `leavingDateSnapshot` captured | Employee leaves next month | Snapshot stores dates as of computation time | Medium |

**Leave revocation after payroll finalisation**

> **Design decision (R-004):** A new admin-only `unfinalize` operation is required. `payrollSummaries.status` transitions: `draft` → `finalised` (via finalize) and `finalised` → `draft` (via unfinalize, admin-only, audit-logged). This enables the rework cycle: revoke leave → unfinalize → recompute → re-finalize.

| TC-ID | Scenario | Key Input | Expected Output | Severity if Fail |
|---|---|---|---|---|
| TC-PAY-016 | Revoke approved leave for a day in a finalised payroll month | Payroll `status: 'finalised'`; admin revokes 3-day approved leave | Balance restored; `leaveTransaction { type: 'restoration-revocation' }`; `AttendanceDay.status` updated; response body includes `warnings: ['Payroll for YYYY-MM is finalised. Recomputation required.']`; `payrollSummary` NOT auto-modified | Critical |
| TC-PAY-017 | Recompute blocked on finalised payroll | `status: 'finalised'`; admin calls compute endpoint | `PAYROLL_ALREADY_FINALISED (PAY_001)` — must explicitly unfinalize before recomputation | Critical |
| TC-PAY-018 | Unfinalize payroll (new admin operation) | Admin calls `PUT /api/v1/payroll/:yearMonth/unfinalize` | `status: 'finalised'` → `'draft'`; `unfinalisedAt` and `unfinalisedBy` set; audit log `PAYROLL_UNFINALISED` written; subsequent compute now succeeds | High |
| TC-PAY-019 | Recompute + re-finalize after unfinalize and leave revocation | After TC-PAY-018 workflow | Recompute succeeds; revoked leave day now categorized per attendance data (`'present'` if session exists, `'absent'` if not); `payableAmount` updated accordingly; re-finalize writes new `finalisedAt` | High |
| TC-PAY-020 | Audit trail completeness for full revoke → unfinalize → recompute → re-finalize flow | Complete workflow | `auditLogs` contains all 5 events in order: `LEAVE_REVOKED`, `ATTENDANCE_DAY_UPDATED`, `PAYROLL_UNFINALISED`, `PAYROLL_COMPUTED`, `PAYROLL_FINALISED`; each with `performedBy` and timestamp; no gaps | Critical |

---

## 7. Security Test Matrix

| TC-ID | Scenario | Method | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-SEC-001 | API call without JWT | `GET /api/v1/attendance/status` — no token | `401` from Edge Middleware | Critical |
| TC-SEC-002 | API call with expired JWT | Token `exp` in past | `401 TOKEN_EXPIRED (AUTH_002)` | Critical |
| TC-SEC-003 | API call with tampered JWT payload | Flip `role: 'employee'` → `role: 'admin'` in payload, valid signature | `401 TOKEN_INVALID (AUTH_003)` (signature check fails) | Critical |
| TC-SEC-004 | JWT signed with wrong secret | Forged token | `401 TOKEN_INVALID` | Critical |
| TC-SEC-005 | JWT rotation — old secret still valid during window | Rotate `JWT_SECRET`; use token signed with previous secret | `200` — fallback verification via `JWT_SECRET_PREVIOUS` succeeds | Critical |
| TC-SEC-006 | JWT rotation — old secret invalid after window | Remove `JWT_SECRET_PREVIOUS`; use old token | `401 TOKEN_INVALID` | Critical |
| TC-SEC-007 | Refresh token rotation | Valid refresh token used | New access token issued; `lastUsedAt` updated | High |
| TC-SEC-008 | Refresh with revoked session | Admin resets device → session `isRevoked: true` | `401 TOKEN_INVALID (AUTH_003)` | Critical |
| TC-SEC-009 | Employee accesses admin endpoint | Employee JWT calls `DELETE /api/v1/employees/:id` | `403 INSUFFICIENT_PERMISSIONS (AUTH_006)` | Critical |
| TC-SEC-010 | Admin accesses employee-only endpoint | None — admin has elevated access | `200` — admins can access all endpoints | High |
| TC-SEC-011 | Device fingerprint mismatch | Registered device hash ≠ request hash | `401 DEVICE_FINGERPRINT_MISMATCH (AUTH_005)` | Critical |
| TC-SEC-012 | Checkin nonce replay | Same nonce submitted twice | Second: `ATT_004 NONCE_REPLAYED`; session not created twice | Critical |
| TC-SEC-013 | CSRF — cross-origin POST to admin endpoint | Origin header set to attacker domain | `403 CSRF rejected` from Edge Middleware | Critical |
| TC-SEC-014 | CSRF — same-origin POST | Origin matches `NEXT_PUBLIC_APP_URL` | `200` — request proceeds | High |
| TC-SEC-015 | Password reset rate limit — 4th request | 3 requests already sent for same email | HTTP `200` returned (not 429) but no email sent; response indistinguishable from success | High |
| TC-SEC-016 | Password reset — email enumeration prevention | Request for nonexistent email | HTTP `200` with same message as valid email | High |
| TC-SEC-017 | Password reset token brute-force | Submit invalid token repeatedly | Fails on hash compare; no information about token structure returned | High |
| TC-SEC-018 | Auth rate limit exceeded | 11th login attempt in 1 minute | `429 RATE_LIMITED (GEN_003)` | High |
| TC-SEC-019 | Attendance rate limit | 61st attendance request in 1 minute | `429 RATE_LIMITED` | Medium |
| TC-SEC-020 | `passwordHash` not returned in API responses | `GET /api/v1/employees/:id` | Response body does not contain `passwordHash` field | Critical |

**Refresh token session policy (R-005 — Hybrid expiry)**

| TC-ID | Scenario | Method | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-SEC-021 | Refresh: 30-day inactivity exceeded | `expiresAt < now()`; `absoluteExpiresAt` still future | `401 TOKEN_EXPIRED (AUTH_002)` — inactivity window enforced | Critical |
| TC-SEC-022 | Refresh: 90-day absolute max exceeded | `absoluteExpiresAt < now()`; `expiresAt` recently extended | `401 TOKEN_EXPIRED (AUTH_002)` — hard limit enforced regardless of recent activity | Critical |
| TC-SEC-023 | Refresh after password reset — all sessions revoked | Employee resets password; old refresh token submitted | `401 TOKEN_INVALID (AUTH_003)` — `isRevoked: true` on all prior sessions | Critical |
| TC-SEC-024 | Refresh after employee deactivation | Admin deactivates employee; employee submits refresh | `401 TOKEN_INVALID (AUTH_003)` — all sessions revoked at deactivation time; no grace period | Critical |
| TC-SEC-025 | Re-activation does not restore old sessions | Employee re-activated; submits pre-deactivation refresh token | `401 TOKEN_INVALID (AUTH_003)` — must re-login fresh on each device | High |

---

## 8. Concurrency Test Matrix

**These tests require a real Atlas M10 test cluster. `mongodb-memory-server` cannot fully simulate concurrent write behaviour under replica set transactions.**

| TC-ID | Scenario | Setup | Expected Result | Severity if Fail |
|---|---|---|---|---|
| TC-CON-001 | Simultaneous check-in — same employee, 2 concurrent requests | Two parallel `POST /api/v1/attendance/checkin` with different nonces | Exactly one session created; one request returns `ATT_003`; DB has exactly one `isActive: true` session | Critical |
| TC-CON-002 | Simultaneous leave approval — same leave request | Two admin sessions approve same `pending` request | One approval succeeds; second finds `status` already changed → fails gracefully | Critical |
| TC-CON-003 | Simultaneous leave approval — two different requests, same employee, balance covers only one | Employee has 1 day balance; two 1-day leaves pending; both approved simultaneously | Exactly one approval succeeds; second fails `LVE_001` (atomic balance check prevents double deduction) | Critical |
| TC-CON-004 | Simultaneous payroll generation — same employee × month | Two compute requests for same `{ employeeId, yearMonth }` | One succeeds; second hits unique index (`PAY_003`) or overwrites draft idempotently | High |
| TC-CON-005 | Concurrent cron execution — leave-year-allocation fired twice | Delete `systemEvents` and fire cron twice simultaneously | Both read no `success` event → both insert `running` event; exactly one proceeds (second detects first's `running` and exits); no double allocation | Critical |
| TC-CON-006 | Simultaneous regularization approval for same employee+date | Two admins approve two different regularization requests for same date | Both succeed (different sessions on same day); `attendanceDayId` consistent | High |
| TC-CON-007 | Race — nonce reuse across two requests (attacker scenario) | Same nonce in two concurrent checkin requests | Both hit `usedNonces.create()` simultaneously; unique index ensures one gets `11000`; other proceeds; net: one session created | Critical |
| TC-CON-008 | `systemEvents` TTL expiry breaks idempotency guard — cron re-fires after doc expires | Leave-year-allocation `systemEvents` doc artificially deleted (simulates 90-day TTL expiry) | Cron re-fires → tries to insert `leaveYearAllocation` docs → unique compound index `{ employeeId, leaveYear, leaveType }` blocks duplicate insert → cron catches error → `systemEvent { status: 'failed', reason: 'duplicate-allocation' }` written; no balance double-credit | Critical |

---

## 9. Integration Testing

**Each test runs against `mongodb-memory-server` in replica set mode (supports transactions). Database wiped before each test suite.**

### 9.1 Attendance Lifecycle

| TC-ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-INT-ATT-01 | Full day attendance lifecycle | Seed employee → checkin → checkout → verify `AttendanceDay` | `status: 'present'`, `totalMinutes` correct, `overtimeMinutes` computed |
| TC-INT-ATT-02 | Multi-session day | checkin → checkout → checkin → checkout → verify day | `totalMinutes` = sum of both sessions; status derived from total |
| TC-INT-ATT-03 | Cron closes orphaned session | checkin (yesterday) → run midnight-session-close cron → verify session + day | Session `closedBySystem: true`; duration capped; `systemEvent` success recorded |
| TC-INT-ATT-04 | Attendance status endpoint after checkin | checkin → GET /status | `isCheckedIn: true`, `checkInTimestamp` present |
| TC-INT-ATT-05 | Nonce uniqueness enforced at DB layer | Create `usedNonces` doc → attempt checkin with same nonce | `11000` error caught → `ATT_004` returned |

### 9.2 Leave Lifecycle

| TC-ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-INT-LVE-01 | Apply → Approve → verify ledger | Seed employee (5 PL) → apply 3 PL → admin approves → verify | `leaveRequest.status = 'approved'`; `user.paidLeave.currentYear = 2`; `leaveTransaction` exists |
| TC-INT-LVE-02 | Apply → Reject → verify balance unchanged | Apply 3 PL → admin rejects → verify | Balance unchanged; no `leaveTransaction` for rejection |
| TC-INT-LVE-03 | Apply → Approve → Admin Revoke → verify restore | Apply 3 PL → approve → revoke → verify | Balance restored to 5; `leaveTransaction { type: 'restoration-revocation' }` |
| TC-INT-LVE-04 | Carry-forward expiry cron | Seed employee with `carriedForward: 5, carryForwardExpiry: yesterday` → run expiry cron | `carriedForward = 0`; `leaveTransaction { type: 'carry-forward-expiry', days: -5 }` |
| TC-INT-LVE-05 | Year-start allocation cron | Seed 3 employees → run leave-year-allocation → verify | Each employee gets correct allocation; `leaveYearAllocation` docs created; `leaveTransactions` created; `systemEvent` success |
| TC-INT-LVE-06 | Concurrent double approval of same leave (transaction integrity) | Apply leave → two simultaneous approval requests | One succeeds; balance deducted once; `leaveTransaction` written once |

### 9.3 Regularization Lifecycle

| TC-ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-INT-REG-01 | Apply `forgotCheckOut` → Approve | Seed employee with open session → apply regularization → admin approves | Session closed at requested time; `AttendanceDay` updated |
| TC-INT-REG-02 | Apply `workAwayFromOffice` → Approve | No session today → regularize → approve | `AttendanceDay.status = 'present'`, `isRegularized: true` |
| TC-INT-REG-03 | Duplicate regularization blocked at DB | Apply twice for same employee+date | Second application → `REG_002` |

### 9.4 Payroll Lifecycle

| TC-ID | Scenario | Steps | Expected |
|---|---|---|---|
| TC-INT-PAY-01 | Compute → Finalise | Seed attendance + leave data for month → compute → finalise | Draft created then finalised; recompute blocked |
| TC-INT-PAY-02 | Mid-month joiner payroll | Seed employee with `dateOfJoining = 15th` → compute | `effectiveWorkingDays` = working days from 15th; formula correct |
| TC-INT-PAY-03 | Recompute draft | Compute payroll → recompute → verify single draft record | Draft overwritten, not duplicated |
| TC-INT-PAY-04 | `employeeSnapshot` isolation | Compute payroll → rename employee → verify snapshot unchanged | Snapshot captures name at compute time |

---

## 10. UAT Plan

**Environment:** Staging instance with seed data. All UAT performed by a designated business stakeholder (HR Manager as Admin, a representative employee). Playwright-driven E2E scripts for reproducibility; manual sign-off required.**

### 10.1 Admin UAT Scenarios

| TC-ID | Feature | Steps | Pass Criterion |
|---|---|---|---|
| TC-UAT-A01 | First login | Log in with seed admin credentials → change password | Redirected to dashboard; old password no longer works |
| TC-UAT-A02 | Create employee | Fill employee form → submit | Employee appears in list; employee can log in with temporary password |
| TC-UAT-A03 | View live attendance | Open attendance dashboard during working hours | All checked-in employees listed with elapsed time |
| TC-UAT-A04 | View attendance history | Select employee → select date range → view | Attendance records correct; sessions listed |
| TC-UAT-A05 | Approve leave request | Employee applies leave → admin opens pending queue → approves | Leave status changes; employee notified; balance deducted |
| TC-UAT-A06 | Reject leave request | Admin rejects pending request with remarks | Status rejected; employee notified; balance unchanged |
| TC-UAT-A07 | Revoke approved leave | Locate approved leave → revoke with reason | Status revoked; balance restored; employee notified |
| TC-UAT-A08 | Approve regularization | Employee submits regularization → admin approves | Attendance record updated; regularization marked approved |
| TC-UAT-A09 | Compute monthly payroll | Select month → compute → review → finalise | All employees have payroll summaries; amounts correct |
| TC-UAT-A10 | Export attendance report | Select report type + date range → export Excel | File downloads; data matches portal display |
| TC-UAT-A11 | Export leave report | Same flow | Correct leave balances and history |
| TC-UAT-A12 | Export payroll report | Same flow | Payroll figures match computed values |
| TC-UAT-A13 | Update company settings | Change `workStartTime` → save | Settings updated; subsequent operations use new value |
| TC-UAT-A14 | Add public holiday | Add holiday for a future date → employee applies leave on that date | Leave application blocked with `LEAVE_ON_HOLIDAY` |
| TC-UAT-A15 | Deactivate employee | Deactivate employee → employee attempts login | Employee cannot log in; historical data intact |
| TC-UAT-A16 | Reset employee device | Reset device → employee logs in on new device | New device registered; old device sessions revoked |
| TC-UAT-A17 | View audit log | Navigate to audit log → filter by employee | All actions listed with actor, timestamp, before/after |

### 10.2 Employee UAT Scenarios

| TC-ID | Feature | Steps | Pass Criterion |
|---|---|---|---|
| TC-UAT-E01 | Employee first login (Flutter app) | Install app → log in with credentials | Dashboard shows today's attendance status |
| TC-UAT-E02 | Check-in at office | Tap check-in within geo-fence | Check-in confirmed; timer starts; timestamp displayed |
| TC-UAT-E03 | Check-out | Tap check-out | Checkout confirmed; duration shown; overtime calculated |
| TC-UAT-E04 | Timer resumes after app restart | Check in → kill app → reopen | Timer shows correct elapsed time (rebuilt from `checkInTimestamp`) |
| TC-UAT-E05 | View leave balance | Navigate to leave balance screen | Current + carry-forward balance shown per leave type |
| TC-UAT-E06 | Apply paid leave | Submit leave application for future dates | Request created `pending`; balance unchanged |
| TC-UAT-E07 | Receive leave approval push notification | Admin approves leave | Push notification received; balance updated in app |
| TC-UAT-E08 | Cancel pending leave | Cancel own pending request | Status cancelled; balance unchanged |
| TC-UAT-E09 | View leave history | Navigate to leave history | All requests with status shown |
| TC-UAT-E10 | Submit regularization | Submit `forgotCheckOut` request | Request submitted; admin notified |
| TC-UAT-E11 | View payslip | Navigate to payslip for last month | Payslip shows all computed values; amounts correct |
| TC-UAT-E12 | Password reset flow | Tap "Forgot Password" → enter email → receive email → reset | Password changed; can log in with new password |
| TC-UAT-E13 | Attempt check-in away from office | Move outside geo-fence → tap check-in | App displays "Outside office location" error |

---

## 11. Performance Testing

**Tool: k6. All tests run against a dedicated load-test Atlas M10 cluster pre-seeded with synthetic data.**

### 11.1 Test Scenarios

| TC-ID | Scenario | Load Profile | Pass Threshold |
|---|---|---|---|
| TC-PER-001 | 100 employees — morning checkin spike | 100 VUs, all check in within 5 minutes (ramping 0→100 over 30s) | P95 latency ≤ 300ms; zero errors; zero duplicate sessions |
| TC-PER-002 | 500 employees — morning checkin spike | 500 VUs, ramp 0→500 over 2 min | P95 ≤ 500ms; error rate ≤ 0.1%; no partial sessions |
| TC-PER-003 | 1000 employees — sustained load | 1000 VUs, constant rate over 10 min | P95 ≤ 800ms; P99 ≤ 2s; Vercel cold-start effect acceptable |
| TC-PER-004 | Leave application burst | 200 VUs, all applying leave simultaneously | P95 ≤ 500ms; no balance corruption (verify DB after test) |
| TC-PER-005 | Payroll computation — 500 employees | Single admin triggers payroll for 500 employees in batch | Total time ≤ 60s; all records created; no timeouts |
| TC-PER-006 | Excel report export — 500 employees × 1 month | Single export request | Response time ≤ 15s; complete Excel file; no timeout |
| TC-PER-007 | Admin attendance dashboard — 1000 employees | Single page load; fetches all today's status | P95 ≤ 2s (aggregation query over `attendanceDays`) |
| TC-PER-008 | Concurrent leave approvals — 50 admins approving 50 requests | 50 VUs each approving a different leave request | All 50 succeed; no balance double-deduction; P95 ≤ 500ms |

### 11.2 Load Test Tooling

```javascript
// k6 script skeleton — TC-PER-001
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    morning_checkin: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '4m30s', target: 100 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed:   ['rate<0.001'],
  },
};

export default function () {
  const payload = JSON.stringify({
    latitude: 19.0760,
    longitude: 72.8777,
    accuracy: 10,
    nonce: `nonce-${__VU}-${Date.now()}`,
    deviceFingerprint: `device-${__VU}`,
    timestamp: new Date().toISOString(),
  });
  const res = http.post('https://staging.company.app/api/v1/attendance/checkin', payload, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${__ENV.TOKEN_VU_${__VU}}` },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

## 12. Bug Severity Classification

### Severity Definitions

| Severity | Definition | Examples | SLA |
|---|---|---|---|
| **Critical** | Data corruption, security breach, system unusable, financial loss | Negative leave balance, duplicate salary payment, login bypass, nonce replay succeeds, session created twice, payroll wrong by >1%, audit log missing for state change | Fix before any other work; deploy hotfix within 24h |
| **High** | Core feature broken for some users; workaround exists but is painful | Employee cannot check in on some devices, leave approval fails intermittently, payroll computation wrong for mid-month joiners, notification not sent | Fix in current sprint; deploy within 72h |
| **Medium** | Feature partially broken; acceptable workaround | Report export timeout for large date ranges, overtime calculation off by 1 minute, regularization lookback off by 1 day, UI shows wrong status briefly | Fix in next sprint |
| **Low** | Minor UI/UX issue; cosmetic; edge case with no business impact | Wrong error message text, leave balance shows 5.00 instead of 5, timestamp shown in wrong timezone in UI only | Fix in backlog; next release |

### Automatic Critical Classification

The following are **automatically Critical** regardless of perceived severity:
- Any operation that produces a non-zero financial discrepancy in `payableAmount`
- Any write to a collection that bypasses `withTransaction` when transaction is required
- Any `leaveBalances` update that produces a value < 0
- Any `auditLog` missing for: leave approval/rejection/revocation, payroll finalisation, employee deactivation, settings change
- Any authentication endpoint that returns 200 for invalid credentials
- Any endpoint that returns `passwordHash` in its response body

---

## 13. Release Readiness Checklist

### Code Quality
- [ ] All unit tests pass (coverage ≥ 80% services, 100% engines)
- [ ] All integration tests pass against mongodb-memory-server
- [ ] All TC-SEC security tests pass
- [ ] All TC-CON concurrency tests pass (real Atlas test cluster)
- [ ] TypeScript `tsc --noEmit` zero errors
- [ ] ESLint zero errors
- [ ] No `TODO`, `FIXME`, `console.log`, or `any` type escapes in production code paths

### Database
- [ ] Atlas M10+ cluster provisioned and tested (replica set verified)
- [ ] Atlas RBAC configured: app service account has `insertOnly` on `auditLogs`, `leaveTransactions`, `leaveYearAllocations`
- [ ] All indexes created (verify via Atlas UI — 53 indexes across 17 collections)
- [ ] TTL indexes confirmed active (check Atlas index list for `expireAfterSeconds`)
- [ ] Seed script run and validated: `companySettings` exists, admin user active
- [ ] `deviceSessions.ipAddressHash` migration script run (if upgrading from pre-v1.2)

### Security
- [ ] All environment variables set in Vercel (no placeholder values in production)
- [ ] `JWT_SECRET` is 64+ random characters (not a word or phrase)
- [ ] `CRON_SECRET` is 32+ random characters
- [ ] `JWT_SECRET_PREVIOUS` is empty on first deploy
- [ ] Firebase service account JSON stored as base64 env var (not committed to repo)
- [ ] Vercel project not publicly accessible during setup (custom domain with auth)
- [ ] CORS configuration reviewed — only known origins allowed

### Operations
- [ ] Vercel cron jobs visible in dashboard — 4 crons scheduled
- [ ] Upstash Redis connected and rate limiter verified (test with rapid requests)
- [ ] Brevo sender identity verified (email sent and received in test)
- [ ] Firebase FCM push notification verified (test push received on real device)
- [ ] MongoDB Atlas monitoring alerts configured (CPU, connections, replication lag)
- [ ] Vercel deployment notifications configured (Slack/email on failure)

### UAT
- [ ] All TC-UAT-A01 through TC-UAT-A17 passed by designated admin stakeholder
- [ ] All TC-UAT-E01 through TC-UAT-E13 passed on physical Android and iOS devices
- [ ] UAT sign-off document signed

### Performance
- [ ] TC-PER-001 (100-employee checkin spike) passed with P95 ≤ 300ms
- [ ] TC-PER-002 (500-employee checkin spike) passed with P95 ≤ 500ms
- [ ] TC-PER-006 (report export) completes within 15s

---

## 14. Definition of Production Ready

The platform is **Production Ready** when ALL of the following are true:

**1. Zero known Critical or High bugs.**
Every reported bug at Critical or High severity has been fixed and verified. Medium and Low bugs are documented in the backlog with assigned owners.

**2. All automated tests pass.**
Unit (80%+/100% coverage), integration, security (TC-SEC), and concurrency (TC-CON) test suites pass on the final build artifact in CI.

**3. UAT complete.**
100% of TC-UAT scenarios approved and signed off by the client's designated HR admin and a representative employee on physical devices.

**4. Database hardened.**
Atlas M10+ with replica set. RBAC insert-only roles on audit collections. All 53 indexes verified. TTL indexes active. Seed data initialized and reviewed by admin.

**5. Security baseline confirmed.**
TC-SEC-001 through TC-SEC-025 all pass. No `passwordHash` in any API response (verified via response inspection). CSRF protection confirmed via browser test. Refresh token hybrid expiry verified (TC-SEC-021 through TC-SEC-025).

**6. Performance baseline acceptable.**
Morning checkin spike for the target company employee count (whichever tier applies) passes P95 threshold.

**7. Operational observability active.**
MongoDB Atlas alerts configured. Vercel deployment alerts configured. At least one successful run of each cron job verified via `systemEvents` collection.

**8. Client data handling agreement.**
Privacy policy for IP address storage documented and acknowledged by client. DPDP Act compliance position reviewed (for Indian deployments).

---

## Appendix A — Test Data Seed Specification

```typescript
// src/test/fixtures/seed.ts — test database seed for integration/UAT
export const TEST_COMPANY_SETTINGS = {
  _id: 'company-settings',
  companyName: 'Test Company',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  workStartTime: '09:00',
  workEndTime: '18:30',
  gracePeriodMinutes: 30,
  requiredDailyMinutes: 540,      // 9 hours
  halfDayThresholdMinutes: 270,   // 4.5 hours
  workingDays: ['monday','tuesday','wednesday','thursday','friday'],
  leaveYearStartMonth: 1,
  geoFence: { latitude: 19.0760, longitude: 72.8777, radiusMeters: 200, isEnabled: true },
  gpsAccuracyThresholdMeters: 100,
  regularizationLookbackDays: 7,
  checkinTimestampWindowMinutes: 2,
  leaveTypes: {
    paidLeave:   { annualAllocation: 15, carryForward: { enabled: true,  maxDays: 5,  expiryMonths: 3 }, encashable: false },
    sickLeave:   { annualAllocation: 10, carryForward: { enabled: false, maxDays: 0,  expiryMonths: 0 }, encashable: false },
    casualLeave: { annualAllocation: 5,  carryForward: { enabled: false, maxDays: 0,  expiryMonths: 0 }, encashable: false },
  },
  payrollCutoffDay: 1,
  attendanceReminderEnabled: false,  // disabled in test
  attendanceReminderTime: '09:30',
  updatedAt: new Date(),
};

export const TEST_ADMIN = {
  employeeId: 'ADMIN001', firstName: 'Test', lastName: 'Admin',
  email: 'admin@test.com', role: 'admin', monthlySalary: 0,
  dateOfJoining: new Date('2025-01-01'), isActive: true,
  leaveBalances: { paidLeave: { currentYear: 0, carriedForward: 0 }, sickLeave: { currentYear: 0, carriedForward: 0 }, casualLeave: { currentYear: 0, carriedForward: 0 } },
};

export const TEST_EMPLOYEE = {
  employeeId: 'EMP001', firstName: 'Test', lastName: 'Employee',
  email: 'emp@test.com', role: 'employee', monthlySalary: 50000,
  dateOfJoining: new Date('2025-01-01'), isActive: true,
  leaveBalances: {
    paidLeave:   { currentYear: 15, carriedForward: 5, carryForwardExpiry: new Date('2026-03-31') },
    sickLeave:   { currentYear: 10, carriedForward: 0 },
    casualLeave: { currentYear: 5,  carriedForward: 0 },
  },
};
```

---

## Appendix B — Test Scenario Count

| Category | Enumerated TC-IDs | Unit test scenarios (implied) | Total |
|---|---|---|---|
| Unit — authService (incl. session policy U-AUTH-15–20) | — | 20 | 20 |
| Unit — attendanceService | — | 14 | 14 |
| Unit — leaveService | — | 17 | 17 |
| Unit — regularizationService | — | 8 | 8 |
| Unit — payrollService (incl. unfinalize U-PAY-07–08) | — | 8 | 8 |
| Unit — notificationService | — | 5 | 5 |
| Unit — settingsService | — | 6 | 6 |
| Unit — payrollEngine (incl. E-PAY-12–13) | — | 13 | 13 |
| Unit — geoFenceEngine | — | 7 | 7 |
| Unit — dateUtils | — | 7 | 7 |
| TC-ATT (Attendance Matrix — incl. timezone TC-026–030, reactivation TC-031–035) | 35 | — | 35 |
| TC-LVE (Leave Matrix — incl. active-session TC-026–030) | 30 | — | 30 |
| TC-REG (Regularization Matrix) | 12 | — | 12 |
| TC-PAY (Payroll Matrix — incl. unfinalize workflow TC-016–020) | 20 | — | 20 |
| TC-SEC (Security Matrix — incl. session policy TC-021–025) | 25 | — | 25 |
| TC-CON (Concurrency Matrix — incl. TTL idempotency TC-008) | 8 | — | 8 |
| TC-INT (Integration) | 18 | — | 18 |
| TC-UAT-A (Admin UAT) | 17 | — | 17 |
| TC-UAT-E (Employee UAT) | 13 | — | 13 |
| TC-PER (Performance) | 8 | — | 8 |
| **Total** | **186** | **105** | **291** |
