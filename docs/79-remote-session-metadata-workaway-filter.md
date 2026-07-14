# Phase 17.02 — Remote Session Metadata and Work Away Admin Filter

**Date:** 2026-07-09
**Scope:** Remote session tracking, WHY geofence was bypassed, Work Away type filter in admin
**Rules:** No secrets printed. No commits/pushes. No hourly tracking, reverse geocoding, admin map, or payroll.

---

## Problem

Before this phase, `AttendanceSession.flags.outsideGeoFence` recorded THAT an employee checked in outside the geofence, but not WHY. The `Employee.allowOutsideGeofence` flag is used both for:
- Permanent admin-granted bypass (e.g. "field employee")
- Temporary same-day Work Away approval (any of: `workAwayFromOffice`, `officialTravel`, `clientVisit`)

No link existed from the resulting check-in session back to the regularization approval that granted the bypass.

Additionally, the admin regularization list had no type filter — no way to quickly view all "Work Away from Office" requests.

---

## Phase A — Audit Findings

| Gap | Detail |
|---|---|
| `AttendanceSession` missing remote metadata | No `isRemote`, `remoteSource`, `remoteApprovalId` |
| `bypassGeofence` merges two reasons | `employeeProfile?.allowOutsideGeofence === true` — no distinction |
| No link from session to approval | `RegularizationService.approve()` sets flag but `checkIn()` doesn't query for which approval |
| `RegularizationListQuerySchema` missing `type` | Admin can't filter by type |
| `RegularizationService.list()` missing `type` filter | Filter object not applied |
| Admin `/regularization` page | No type dropdown |
| Mobile `AttendanceSession` model | No `isRemote`, `remoteSource` |
| Mobile home/history UI | No "Remote" label on sessions |

---

## Phase B — AttendanceSession Model

**File:** `apps/admin/src/models/AttendanceSession.ts`

Added to `IAttendanceSession` interface and Mongoose schema:
- `isRemote: boolean` — true if employee checked in outside geofence with bypass
- `remoteSource?: 'employeeOverride' | 'workAwayApproval'` — why bypass was allowed
- `remoteApprovalId?: ObjectId` — reference to the Regularization doc that granted the bypass

Schema fields:
```typescript
isRemote:        { type: Boolean, required: true, default: false },
remoteSource:    { type: String, enum: ['employeeOverride', 'workAwayApproval'] },
remoteApprovalId: { type: Schema.Types.ObjectId, ref: 'Regularization' },
```

No new index needed — `remoteSource` is stored per-session; queries are driven by existing `{employeeId, dateString}` index.

---

## Phase C — checkIn() Remote Source Detection

**File:** `apps/admin/src/services/AttendanceService.ts`

Added import: `Regularization`, `IRegularization` from `@models/Regularization`.

After `dateString` is computed and `bypassGeofence` is known, before the MongoDB transaction:

```typescript
let isRemote = false;
let remoteSource: 'employeeOverride' | 'workAwayApproval' | undefined;
let remoteApprovalId: mongoose.Types.ObjectId | undefined;

if (!isWithinGeoFence && bypassGeofence) {
  isRemote = true;
  const workAwayReg = await Regularization.findOne({
    employeeId: ..., dateString,
    type: { $in: ['workAwayFromOffice', 'officialTravel', 'clientVisit'] },
    status: 'approved',
  }).lean() as ...;
  if (workAwayReg) {
    remoteSource = 'workAwayApproval';
    remoteApprovalId = workAwayReg._id;
  } else {
    remoteSource = 'employeeOverride';
  }
}
```

Remote metadata stored in session creation alongside `flags`.

---

## Phase D — API Response Exposure

**File:** `apps/admin/src/services/AttendanceService.ts`

Three response paths updated:

1. **`formatSession()`** helper — added `isRemote: boolean`, `remoteSource?: string` to parameter type and return object. Used by `getHistory()`.
2. **`getStatus()` inline sessions map** — added `isRemote`, `remoteSource` to each session entry.
3. **`getStatus()` `currentSession`** — added `isRemote`, `remoteSource` to the active session object.

---

## Phase E — Mobile UI

### attendance.dart
**File:** `apps/mobile/lib/core/models/attendance.dart`

Added to `AttendanceSession`:
- `isRemote: bool` (default `false`)
- `remoteSource: String?`
- Parsed from JSON in `fromJson()`

### attendance_remote_source.dart
**File:** `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart`

`getToday()` session mapping now passes through `isRemote` and `remoteSource` from the API response.

### home_screen.dart
**File:** `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`

- `_StatusCard.build()`: computes `activeSession` before switch expression; adds "Remote" chip (indigo) next to "Checked In" label when `activeSession?.isRemote == true`.
- `_TodaysSessions`: adds "Remote" chip to each session header row when `session.isRemote`.

### daily_detail_screen.dart
**File:** `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart`

Session cards now show a "Remote" chip next to "Session N" when `session.isRemote`.

---

## Phase F — Admin Regularization Type Filter

### Validator
**File:** `apps/admin/src/validators/regularization.ts`

Added `type: z.enum(REGULARIZATION_TYPES).optional()` to `RegularizationListQuerySchema`. Type is inferred into `RegularizationListQuery`.

### Service
**File:** `apps/admin/src/services/RegularizationService.ts`

Added `if (query.type) filter.type = query.type;` in `list()`.

### Admin Page
**File:** `apps/admin/src/app/(portal)/regularization/page.tsx`

- Reads `type` from URL search params.
- Passes `type` to `buildQuery()`.
- Added Type `<Select>` dropdown (all 5 type labels from existing `TYPE_LABELS`).
- `EmptyState filtered` prop updated to `!!status || !!type`.

---

## Phase G — Static Analysis

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `flutter analyze --no-fatal-infos` | PASS — No issues |

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/models/AttendanceSession.ts` | Added `isRemote`, `remoteSource`, `remoteApprovalId` to interface + schema |
| `apps/admin/src/services/AttendanceService.ts` | Import Regularization; remote detection in `checkIn()`; expose in `formatSession()`, `getStatus()` sessions + `currentSession` |
| `apps/admin/src/validators/regularization.ts` | Added `type` to `RegularizationListQuerySchema` |
| `apps/admin/src/services/RegularizationService.ts` | Apply `query.type` filter in `list()` |
| `apps/admin/src/app/(portal)/regularization/page.tsx` | Added type filter dropdown; updated `buildQuery`; updated `EmptyState` |
| `apps/mobile/lib/core/models/attendance.dart` | Added `isRemote`, `remoteSource` to `AttendanceSession` |
| `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart` | Pass `isRemote`, `remoteSource` in session mapping |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | "Remote" chip in `_StatusCard` and `_TodaysSessions` |
| `apps/mobile/lib/features/attendance/presentation/screens/daily_detail_screen.dart` | "Remote" chip in session cards |
| `docs/79-remote-session-metadata-workaway-filter.md` | Created — this document |

---

## Behaviour

| Scenario | `isRemote` | `remoteSource` | `remoteApprovalId` |
|---|---|---|---|
| Check-in inside geofence | `false` | — | — |
| Check-in outside, no approval, `allowOutsideGeofence` set by admin permanently | `true` | `'employeeOverride'` | — |
| Check-in outside, same-day WFH/officialTravel/clientVisit approved | `true` | `'workAwayApproval'` | `<reg._id>` |
| Geofence disabled globally | `false` (employee is "inside" effectively) | — | — |

---

## Phase G — Static and Build Results

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — 0 errors |
| `flutter analyze --no-fatal-infos` | PASS — No issues (3.6s) |
| `flutter build apk --debug` | PASS — `build/app/outputs/flutter-apk/app-debug.apk` |
| APK install (device 700dd050) | PASS — `adb install -r` Success |

---

## Phase E — Runtime Smoke Test Results

**Test environment:**
- Device: Android (700dd050), ADB port forward `tcp:3000` active (phone → PC localhost:3000)
- Geofence temporarily moved to `lat=0, lng=0, radius=100m` (device in India is ~8000km outside)
- `allowOutsideGeofence=true` set for test user (ID: `6a415e76abc350dc4e6080e3`)

**Check-in result (Fri 10 Jul 2026, 00:22 IST):**

```json
{
  "sessionId": "6a4feddf9c6cb00bf93e607a",
  "isRemote": true,
  "remoteSource": "employeeOverride",
  "checkIn": "2026-07-09T18:52:XX.XXXZ"
}
```

**Mobile UI verified (via UIAutomator content-desc):**

| Screen | Element | Result |
|---|---|---|
| Home `_StatusCard` | `"Checked In\nRemote\nSince 00:22"` | ✓ Remote chip visible |
| Home `_TodaysSessions` | `"Session 1\nRemote\nIn: 00:22 · Out: —"` | ✓ Remote chip visible |
| DailyDetailScreen | `"Session 1\nRemote\nIn: 12:22:13 AM\n19.20194, 73.08663"` | ✓ Remote chip visible |

**Check-out result:**
- Confirmation dialog shown ("Checking Out Early?") → confirmed
- Home transitions to `"Partial Day · 0h 6m recorded"` + `"CHECK IN AGAIN"` button
- Session 1 shows `"In: 00:22 · Out: 00:28 · Duration: 0h 6m"` with Remote chip ✓

**Settings restored after test:**
- Geofence: `lat=19.201, lng=73.086, radiusMeters=200, isEnabled=true` ✓ (verified via API)
- `allowOutsideGeofence=false` for test user ✓ (verified via API)

**Backend scenarios confirmed:**

| Scenario | Expected | Result |
|---|---|---|
| Outside + `allowOutsideGeofence=true`, no WFH reg | `isRemote=true, remoteSource='employeeOverride'` | ✓ CONFIRMED live |
| Outside + approved WFH/officialTravel/clientVisit reg | `isRemote=true, remoteSource='workAwayApproval'` | Code path confirmed (static) |
| Inside geofence | `isRemote=false` | Code path confirmed (static) |
| Geofence disabled globally | `isRemote=false` (bypass irrelevant) | Code path confirmed (static) |

---

## Admin Regularization Type Filter

Type filter dropdown implemented in `/regularization` admin page:
- `forgotCheckIn`, `forgotCheckOut`, `workAwayFromOffice`, `officialTravel`, `clientVisit`
- Updates URL param `?type=<value>` on change
- `EmptyState` shows "clear filters" when `!!status || !!type`
- Backend: `RegularizationListQuerySchema` validates `type`; `RegularizationService.list()` applies filter

---

## Remaining Blockers

| Blocker | Severity | Blocking deploy? |
|---|---|---|
| P0 secret rotation not done | CRITICAL | YES |
| `.env.example` sanitized but not committed | HIGH | YES |
| `.gitignore` hardened but not committed | HIGH | YES |
| Git history exposed secrets in commit `9b941a9` | HIGH | Acknowledged |
