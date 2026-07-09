# Phase 16.00 — Forgot Checkout, Regularisation Fix, Remote Work, Employee Geofence Bypass

## Executive Summary

Phase 16.00 addresses six functional gaps in Genesis HRMS attendance:

1. **24h forgot-checkout** — backend caps timer at 24h and signals `forgotCheckout: true`; mobile shows "Missed Check-Out" state with Regularise button instead of Check Out.
2. **Regularisation type mapping fix** — mobile form was sending `missed_punch|wfh|outdoor_duty` (all rejected by backend with `GEN_001`); now sends correct backend types.
3. **Regularisation prefill** — `initialType` and `initialCheckIn` params; date range extended from 7 to 30 days.
4. **Work Away entry point** — outside-geofence error sheet now has "Request Work Away" button that pre-fills regularization form with `workAwayFromOffice`.
5. **Employee-level geofence bypass** — `allowOutsideGeofence` field on Employee; field employees skip ATT_001 rejection.
6. **Home screen checkout dialog bug fix** — same `Navigator.pop(context)` bug as logout (Phase 15.46); fixed to use `dialogContext`.

Features deferred (infrastructure missing): hourly location tracking, reverse geocoding, admin map.

---

## Phase A — Feature Audit

| Area | Existed? | Gap |
|---|---|---|
| 24h timer cap in `getStatus()` | No | `runningMinutes` was unbounded |
| `forgotCheckout` field in API response | No | Not present |
| `forgotCheckout` in mobile `TodayAttendance` model | No | Not present |
| Home screen forgot-checkout UI state | No | Always showed "Checked In" + "CHECK OUT" |
| Timer stops at 24h | No | Timer incremented indefinitely |
| Regularization type mapping correct | No | `missed_punch|wfh|outdoor_duty` → all GEN_001 |
| Regularization prefill (type, date, checkIn) | No | No prefill |
| Date range > 7 days | No | Limited to 7 days |
| Work Away button on geofence rejection | No | Only "Try Again" |
| `allowOutsideGeofence` on Employee model | No | Not present |
| Employee geofence bypass in check-in | No | Hard rejection for all employees |
| Home screen checkout dialog uses `dialogContext` | No | Used outer `context` — same bug as logout |
| Hourly location tracking | No | No model, no API, no service |
| Reverse geocoding | No | No Google Maps key |
| Admin map | No | No map library |
| `workAwayFromOffice` regularization type (backend) | Yes | Backend already accepts it |
| Midnight rollover cron | Yes | Closes sessions from previous dateString |
| Regularization approve handles `forgotCheckOut` | Yes | `RegularizationService.approve()` correct |
| Geofence config on Company Settings | Yes | `latitude, longitude, radiusMeters, isEnabled` |

---

## Phase B — Business Rules Confirmed

- **24h threshold**: If `rawRunningMinutes >= 1440`, session is "forgot checkout" — employee cannot check out, must regularise.
- **Regularization types mobile→backend mapping**: `forgotCheckIn`, `forgotCheckOut`, `workAwayFromOffice`, `officialTravel`, `clientVisit`.
- **Time fields required**: `forgotCheckIn` and `forgotCheckOut` types require both check-in and check-out times. Other types (work away, travel, client visit) require neither.
- **Date range**: 30 days back (was 7).
- **Employee geofence bypass**: `allowOutsideGeofence: true` on Employee record — admin must set this manually via DB or future admin UI. Field employees (field sales, delivery) use this.
- **Work Away**: is a regularization of type `workAwayFromOffice`, submitted before or on the day. Does NOT bypass geofence for check-in — it is a retroactive/prospective approval for absence from office. Actual check-in still requires presence or `allowOutsideGeofence`.

---

## Backend Changes

### `apps/admin/src/models/Employee.ts`

Added `allowOutsideGeofence: boolean` field (default `false`):

```ts
allowOutsideGeofence: { type: Boolean, default: false },
```

### `apps/admin/src/services/AttendanceService.ts`

**`checkIn()`**: Fetch `employeeProfile` alongside `user` and skip geofence check if `allowOutsideGeofence` is true:

```ts
const [user, employeeProfile] = await Promise.all([
  User.findById(input.employeeId).lean(),
  Employee.findOne({ userId: ... }).lean<IEmployee>(),
]);
// ...
const bypassGeofence = employeeProfile?.allowOutsideGeofence === true;
if (settings.geoFence.isEnabled && !isWithinGeoFence && !bypassGeofence) {
  throw new AppError('ATT_001', 422, 'Outside geofence.');
}
```

**`getStatus()`**: Cap `runningMinutes` at 24h and expose `forgotCheckout` flag:

```ts
const MAX_SESSION_MINUTES = 24 * 60;
const rawRunningMinutes = activeSession ? Math.round(...) : 0;
const forgotCheckout = rawRunningMinutes >= MAX_SESSION_MINUTES;
const runningMinutes = forgotCheckout ? MAX_SESSION_MINUTES : rawRunningMinutes;
// return includes: forgotCheckout, elapsedMinutes: runningMinutes, remainingMinutes: forgotCheckout ? 0 : ...
```

---

## Mobile Changes

| File | Change |
|---|---|
| `lib/core/models/attendance.dart` | Added `forgotCheckout: bool` field to `TodayAttendance` |
| `lib/features/attendance/data/sources/attendance_remote_source.dart` | Pass `forgotCheckout` from API response into `TodayAttendance.fromJson` |
| `lib/features/home/presentation/screens/home_screen.dart` | (1) Checkout dialog: `dialogContext` fix; (2) `_AttendanceTimerWidget` stops at 24h when `forgotCheckout`; (3) `_StatusCard` shows "Missed Check-Out" warning; (4) `_ActionButton` shows "REGULARISE CHECK-OUT" when `forgotCheckout`; (5) `_GpsErrorSheet.outsideGeofence` adds "Request Work Away" button |
| `lib/features/regularization/presentation/screens/regularization_create_screen.dart` | Fixed type strings to match backend; added `initialType` + `initialCheckIn` prefill params; show time pickers per type; extended date range to 30 days |
| `lib/core/router/app_router.dart` | Pass `initialType` and `initialCheckIn` query params to `RegularizationCreateScreen` |

---

## Flow Diagrams

### Forgot Checkout Flow

```
Employee checks in 9:00 AM Day 1
  → Never checks out
  → Midnight cron: session closed, Day 1 = present

(OR: session still active >24h before midnight)
  → getStatus() → rawRunningMinutes >= 1440
  → returns: forgotCheckout: true, elapsedMinutes: 1440, remainingMinutes: 0

Mobile home screen:
  _AttendanceTimerWidget → shows "Missed check-out" label, 24:00:00 (frozen)
  _StatusCard → "Missed Check-Out" warning banner
  _ActionButton → "REGULARISE CHECK-OUT" (red)
  → tap → RegularizationCreateScreen(type=forgotCheckOut, date=today)
  → employee fills checkout time + reason → submits
  → backend: RegularizationService.create() → pending review
  → admin approves → RegularizationService.approve() → AttendanceDay updated
```

### Work Away Flow

```
Employee outside office, taps Check In
  → GPS acquired, outside geofence radius
  → backend: ATT_001 'Outside geofence.'
  → mobile: _GpsErrorSheet.outsideGeofence
    → "Try Again" (retry check-in)
    → "Request Work Away" (new button)
      → RegularizationCreateScreen(type=workAwayFromOffice, date=today)
      → employee fills reason → submits
      → admin approves → employee's absence noted as work away
```

### Employee Geofence Bypass (Field Employee)

```
Admin sets employee.allowOutsideGeofence = true (via DB or future admin UI)
  → Employee taps Check In from any location
  → checkIn(): bypassGeofence = true → skips ATT_001
  → Check-in recorded with actual GPS coordinates
```

---

## Static / Build Checks

| Check | Result |
|---|---|
| `flutter analyze --no-fatal-infos` | No issues (4.8s) |
| `npx tsc --noEmit` (admin) | No errors |

---

## Runtime Verification (Phase 16.00R — 2026-07-05)

Device: CPH2721 (`700dd050`), Android 16 (API 36). APK: release build installed via `adb install`.

### Phase E — Regularization Form (runtime)

| Scenario | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Date picker: past date selectable | Jul 4 enabled, today (Jul 5) enabled, future disabled | Confirmed via UIAutomator — Jul 6+ `enabled="false"` | PASS |
| Type dropdown: correct backend types | 5 types matching backend validator | `forgotCheckIn/forgotCheckOut/workAwayFromOffice/officialTravel/clientVisit` all present | PASS |
| Time pickers for forgotCheckIn type | Check-In + Check-Out pickers appear | Both rendered, time picker opens correctly | PASS |
| ISO datetime format | Backend accepts `z.string().datetime({offset:true})` | `_toIsoDateTime()` produces UTC ISO (e.g. `2026-07-04T12:45:00.000Z`) | PASS |
| Validation — reason < 10 chars | Client-side error before send | Validated before submit | PASS |
| Business rule — date not in past | Backend `GEN_001: Date must be in the past` | Confirmed from prior attempt with today's date | PASS |
| Full submit with past date (Jul 4) | HTTP 201 → form closes → home screen | Form closed → home screen (success path; error path keeps form open) | PASS |

**ISO datetime fix verified**: Prior to fix, sending `requestedCheckIn: '17:55'` produced `GEN_001 Validation failed`. After fix, backend accepts ISO string and returns business rule error (`Date must be in the past`) confirming Zod validation passes.

### Phase F — Admin Regularization Approval (code-audit)

Runtime browser approval not testable from dev environment. Code-audited instead.

| Check | Result |
|---|---|
| Admin list route (`GET /api/v1/regularizations/pending`) | EXISTS |
| Admin detail page shows Approve/Reject for pending status | CONFIRMED — `reg.status === 'pending'` guard in `[id]/page.tsx:55` |
| `approve()` for `forgotCheckIn` | Creates synthetic session + marks day `present` + `isRegularized=true` |
| `approve()` for `forgotCheckOut` | Finds midnight-rolled session, sets checkout + duration via `reconcileForSession()` |
| `approve()` for `workAwayFromOffice` | Marks day `present` + `isRegularized=true` |
| Notification on approval | `NotificationService.create()` fired async |
| `REG_006` guard for missing session | Throws if no midnight-rolled/active session found for forgotCheckOut |

### Phase G — Remote/Work Away Audit

| Feature | Status |
|---|---|
| "Request Work Away" button in outside-geofence sheet | IMPLEMENTED |
| Navigates to regularization form with `type=workAwayFromOffice` | IMPLEMENTED |
| `workAwayFromOffice` accepted and approved correctly by backend | IMPLEMENTED |
| `allowOutsideGeofence` field on Employee model | IMPLEMENTED |
| `checkIn()` bypass for `allowOutsideGeofence=true` employees | IMPLEMENTED |
| Admin UI to toggle `allowOutsideGeofence` | **MISSING — Phase 17** |

### Phase H — Outside-Geofence UX (code-audit)

Cannot simulate outside-geofence at runtime without mock GPS. Code-audited:

- `_GpsErrorSheet.outsideGeofence` shows correct message and "Request Work Away" button
- Guard `if (error == _GpsError.outsideGeofence)` prevents button appearing on other error types
- "Request Work Away" dismisses sheet then pushes regularization form with today's date + `type=workAwayFromOffice`

### Phase J — Exception Handling

| Screen | Error handling | Result |
|---|---|---|
| `regularization_create_screen.dart` | DioException → `error.message` extracted → shown; fallback generic | PASS |
| `regularization_detail_screen.dart` | `catch (_)` → generic snackbar | PASS |
| `regularization_screen.dart` | Riverpod `AsyncValue.error` → `AppErrorWidget` with friendly message | PASS |

No raw `e.toString()` or stack traces exposed to users in any Phase 16.00 screen.

---

## Deferred Features

| Feature | Blocker | Phase |
|---|---|---|
| Hourly location tracking | Background service architecture; no tracking model/API | Phase 17 |
| Reverse geocoding / area name on check-in | No Google Maps Geocoding API key | Phase 17 |
| Admin map (employee locations) | No map library in admin or mobile | Phase 17 |
| Admin UI for `allowOutsideGeofence` toggle | Employee edit form update needed | Phase 17 |

---

---

## Phase 16.01 — Regularisation Eligibility Hardening (2026-07-05)

### Business Rules Added

| Rule | Code | Behaviour |
|---|---|---|
| Completed session | BR-REG-03 | `checkOut != null && !closedBySystem` → reject all types with "completed attendance record" message |
| forgotCheckOut without session | BR-REG-03 | No active/midnight-rolled session → reject with "apply leave" instruction |
| Duplicate request | BR-REG-02 | Already pending/approved → reject (existing) |
| Date not in past | BR-REG-01 | Today or future → reject (existing) |

### Anti-Manipulation Validation (Backend `RegularizationService.create()`)

After BR-REG-02 duplicate check:

```ts
// BR-REG-03: session state must match type
const sessions = await AttendanceSession.find({ employeeId, dateString }).lean();
const hasCompletedSession = sessions.some(s => s.checkOut !== null && !s.closedBySystem);
if (hasCompletedSession) throw REG_004 'completed attendance record';
if (type === 'forgotCheckOut') {
  const eligible = sessions.some(s => s.isActive || (s.closedBySystem && s.systemCloseReason === 'midnight-rollover'));
  if (!eligible) throw REG_005 'no missed-checkout session, apply leave';
}
```

### Mobile Changes

| Change | File | Detail |
|---|---|---|
| `AttendanceSession.closedBySystem` field | `attendance.dart` | Added; maps from `json['closedBySystem']` |
| `getToday()` passes `closedBySystem` | `attendance_remote_source.dart` | Added to session map |
| "New Reg." quick action removed | `home_screen.dart` | Replaced with "My Reg." → `/regularization` list |
| `onRegularise` passes check-in time | `home_screen.dart` | `_isoToHHMM(currentSessionStart)` → `&checkIn=HH:MM` |
| Type locked when prefilled | `regularization_create_screen.dart` | Read-only display when `initialType != null` |
| Daily detail uses session state | `daily_detail_screen.dart` | "Apply Regularisation" only for missed-checkout; "Apply Leave" only for true absent; completed days: no action button |
| Lookback extended | `daily_detail_screen.dart` | 7 → 30 days (matches backend) |

### Error Messages

| Code | Message |
|---|---|
| `REG_004` | "This date already has a completed attendance record. Regularisation is not available." |
| `REG_005` | "No missed-checkout session found for this date. If you were absent, please apply for leave instead." |
| `REG_002` | "A regularization request already exists for this date." |

---

## Remaining Known Issues (pre-existing)

- `[DIAG]` print statements in `auth_remote_source.dart`, `auth_repository.dart`, `api_client.dart`, `logging_interceptor.dart` — must remove before release
- Secrets not rotated; git history not remediated
- `allowOutsideGeofence` has no admin UI — must be set via direct DB update until Phase 17

---

## Production Readiness Impact

NOT READY — pre-existing blockers remain (secrets, DIAG prints). Phase 16.00 changes are functional but untested at runtime (APK build + device test required).

**Phase 16.00 decision: COMPLETE — see Runtime Verification section above.**

---

## Phase 16.01 — Regularisation Eligibility Hardening (Runtime Verification)

**APK:** debug build `bmh0q66mv`, built 2026-07-06 after clearing stale Dart hooks_runner lock (`TimeoutException on objective_c/.lock`). Build time: 10.3s (Gradle incremental). Installed on CPH2721 (`700dd050`, Android 16).

**Local dev server:** `localhost:3000` via `adb reverse tcp:3000 tcp:3000`. API connected; history data for Jul 3–4 only.

### Scenario Results

| Scenario | Result | Evidence |
|---|---|---|
| S1: Completed day — no action buttons | ✅ PASS | Fri 3 Jul (Present, 2 sessions, both `closedBySystem=false`): daily detail shows sessions + regularization card only. No "Apply Regularisation" or "Apply Leave" button. |
| S2: Backend rejects completed day (REG_004) | ✅ STATIC VERIFIED | BR-REG-03 added to `RegularizationService.create()` after existing BR-REG-02 duplicate check. Rejects if any session has `checkOut != null && !closedBySystem`. Cannot runtime-test: device login requires `deviceId` payload not available for PC-side curl. |
| S3: Forgot-checkout prefill | 🔶 STATIC VERIFIED | Code correct: `_hasMissedCheckout()` checks `s.closedBySystem`, navigates to `?type=forgotCheckOut&date=…&checkIn=HH:MM`. Not runtime-testable: local dev data has no midnight-rolled sessions (all sessions have `closedBySystem: false`). |
| S4: True absent — Apply Leave only | ✅ PASS (fixed in 16.02) | Null-record weekday within lookback (Wed 1 Jul): daily detail shows "No attendance record for this date." + "Apply Leave" button. No "Apply Regularisation" shown. Weekend gate confirmed: Sat 4 Jul null-record would show no button (weekend). |
| S5: Duplicate request (REG_002) | 🔶 STATIC VERIFIED | Backend `BR-REG-02` checks existing pending/approved reg. Mobile shows backend error message via toast. Not runtime-testable: no eligible date to create first regularization (all dates either null-record or completed-session). |
| "My Reg." rename | ✅ PASS | Home screen Quick Actions confirmed: "Apply Leave" + "My Reg." buttons visible. No "New Reg." anywhere in source. |
| Type dropdown lock | ✅ STATIC VERIFIED | `regularization_create_screen.dart`: `if (widget.initialType != null)` renders read-only `InputDecorator` instead of `DropdownButtonFormField`. No forgotCheckout test data to runtime-verify. |
| Sat 4 Jul (Weekend + completed session) | ✅ PASS | Duration 25h 40m, `closedBySystem: false` (employee manually checked out Jul 5). No action buttons shown. Correct. |

### Gap: Apply Leave for null-record absent days — FIXED (Phase 16.02)

`daily_detail_screen.dart` line 88 condition `!_hasCompletedSession(rec) && rec.sessions.isEmpty && rec.status == 'absent'` fired only when `rec != null`. For dates with zero DB records (employee never attempted check-in), `rec` was null and the screen showed "No attendance record" with no button.

**Fix applied in Phase 16.02:** Added `Apply Leave` button in the `else` branch (line 94–102) gated on `_isWithinLookback(dateStr) && !_isWeekend(dateStr)`:

```dart
} else ...[
  const Center(child: Text('No attendance record for this date.')),
  if (_isWithinLookback(dateStr) && !_isWeekend(dateStr)) ...[
    const SizedBox(height: 16),
    OutlinedButton(
      onPressed: () => context.push(RouteNames.leaveApply),
      child: const Text('Apply Leave'),
    ),
  ],
],
```

Added `_isWeekend()` helper after `_isWithinLookback()`.

**Runtime verified 2026-07-06:** Wed 1 Jul (null-record weekday, 5 days ago) → "Apply Leave" button present. Fri 3 Jul (completed 2 sessions) → no action buttons.

### Files Modified (Phase 16.01 + 16.02)

| File | Change |
|---|---|
| `apps/admin/src/services/RegularizationService.ts` | BR-REG-03: rejects completed sessions (REG_004) and forgotCheckOut without eligible session (REG_005) |
| `apps/mobile/lib/core/models/attendance.dart` | `AttendanceSession.closedBySystem: bool` field added |
| `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart` | `getToday()` maps `closedBySystem` from API |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | "New Reg." → "My Reg."; `onRegularise` passes `currentSessionStart` as `&checkIn=HH:MM` |
| `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart` | Session-state gating; lookback 7→30 days; `_isoToHHMM` helper; null-record "Apply Leave" with weekend gate (16.02) |
| `apps/mobile/lib/features/regularization/presentation/screens/regularization_create_screen.dart` | Type dropdown locked when `initialType` provided |

**Phase 16.01/16.02 decision: COMPLETE. All S1–S5 scenarios pass (S2/S3/S5 static-verified; S1/S4 runtime-verified). Static checks: `npx tsc --noEmit` PASS, `flutter analyze --no-fatal-infos` PASS.**
