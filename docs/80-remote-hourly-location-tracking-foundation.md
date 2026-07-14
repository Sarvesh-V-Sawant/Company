# Phase 17.03 — Remote Hourly Location Tracking Foundation

**Date:** 2026-07-11
**Scope:** Hourly location snapshots for active remote sessions (foreground/app-open MVP)
**Rules:** No secrets printed. No commits/pushes/deploys. No reverse geocoding, admin map, or payroll.

---

## Phase A — Audit Findings

| Area | Finding |
|---|---|
| `pubspec.yaml` | `geolocator: ^13.0.0` already present |
| `AndroidManifest.xml` | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` present; **no** `ACCESS_BACKGROUND_LOCATION` |
| Foreground service | NOT configured — MVP is foreground/app-open only |
| WorkManager / background_fetch | NOT present |
| Location usage (existing) | `Geolocator.getCurrentPosition()` used only at check-in in `home_screen.dart` |
| `AttendanceNotifier` | Has `_syncTimer` (5-min periodic reconcile); `_ref` available for reading providers |
| Backend `LocationSnapshot` model | Did not exist |
| Backend snapshot API | Did not exist |
| `isRemote` exposure | `AttendanceSession.isRemote` present in backend + mobile model (Phase 17.02) |

**Background tracking decision:** Deferred. No foreground service configured. This phase tracks only while the app is in foreground (timer fires via Dart isolate; Android may throttle or kill when screen off for extended periods). Declared explicitly to employee in UI.

---

## Phase B — Backend Model

**File:** `apps/admin/src/models/LocationSnapshot.ts`

```typescript
interface ILocationSnapshot {
  employeeId: ObjectId;           // ref: User
  attendanceSessionId: ObjectId;  // ref: AttendanceSession
  dateString: string;             // YYYY-MM-DD
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: Date;               // server time at receipt
  source: 'mobile';
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:
- `{ employeeId: 1, capturedAt: -1 }`
- `{ attendanceSessionId: 1, capturedAt: -1 }`
- `{ dateString: 1, employeeId: 1 }`

---

## Phase C — Backend Validator + Service

**File:** `apps/admin/src/validators/locationSnapshot.ts`

- `CreateLocationSnapshotSchema`: `latitude`, `longitude`, `accuracy`
- `ListLocationSnapshotsSchema`: optional `employeeId`, `dateString`, `page`, `limit`

**File:** `apps/admin/src/services/LocationSnapshotService.ts`

- `create(employeeId, input)`:
  1. Find active session (`isActive: true`) for employee
  2. Reject with 409 if no active session
  3. Reject with 409 if session `isRemote !== true`
  4. Create snapshot with `capturedAt = server time`
  5. Return snapshot data
- `list(query)`: admin pagination with optional filters

---

## Phase D — Backend API Routes

**POST `/api/v1/attendance/location-snapshot`**
- Employee JWT auth (`getAuthUser`)
- No role restriction (any authenticated employee)
- Body: `{ latitude, longitude, accuracy }`
- Validates active remote session before write
- Returns 201 + snapshot id

**GET `/api/v1/attendance/location-snapshots`**
- Admin JWT auth + `assertRole('admin')`
- Query: `?employeeId=&dateString=&page=&limit=`
- Returns paginated snapshot list

---

## Phase E — Mobile Implementation

### `location_snapshot_source.dart`
**File:** `apps/mobile/lib/features/attendance/data/sources/location_snapshot_source.dart`

`post({ latitude, longitude, accuracy })` — POST to `/api/v1/attendance/location-snapshot`.

### `api_endpoints.dart`
Added `locationSnapshot = '/api/v1/attendance/location-snapshot'`.

### `providers.dart`
Added `locationSnapshotSourceProvider`.

### `attendance_provider.dart`
Added to `AttendanceNotifier`:
- `Timer? _locationTimer`
- `_startLocationTracking()` — idempotent (no-op if already running); sends immediate snapshot; starts 60-min timer
- `_stopLocationTracking()` — cancels timer
- `_sendLocationSnapshot()` — checks permission, acquires position, POSTs; all errors swallowed silently
- `_resolveState()` now calls `_startLocationTracking()` when `activeSession?.isRemote == true`, else `_stopLocationTracking()`
- `checkOut()` explicitly calls `_stopLocationTracking()` before `_resolveState()`
- `dispose()` calls `_stopLocationTracking()`

Timer fire cadence: immediate on remote check-in, then every 60 minutes while app runs.

### `home_screen.dart`
When `activeSession?.isRemote == true` in `CheckInState.checkedIn` arm, shows:

```
[location icon] Remote session active. Location will be recorded periodically while checked in.
```

Indigo-bordered info box, non-dismissable, visible only during active remote sessions.

---

## Phase F — Permission UX

| Scenario | Behaviour |
|---|---|
| Permission denied | `_sendLocationSnapshot()` returns silently — no crash, no toast |
| Permission denied forever | Same — no spam request, employee was already prompted at check-in |
| Location services off | `Geolocator.isLocationServiceEnabled()` check → returns silently |
| Snapshot POST fails (network) | Caught by `catch (_)` → silent |
| Non-remote session | Timer never starts, no location acquired |
| App backgrounded | Timer may or may not fire (Android discretion); **not** a guaranteed service |

---

## Phase G — Deferred Items

| Item | Reason deferred |
|---|---|
| Android foreground service (persistent notification) | Requires `FOREGROUND_SERVICE` permission, Android service scaffolding, significant scope |
| `ACCESS_BACKGROUND_LOCATION` | Not needed for foreground MVP; requires additional Play Store declaration |
| Reverse geocoding / address field | Deferred to Phase 17.04 |
| Admin map view | Deferred to Phase 17.05 |
| iOS background location | Not relevant until iOS build is targeted |
| Snapshot frequency config | Admin-configurable interval deferred; hardcoded 60 min for MVP |

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/models/LocationSnapshot.ts` | New — Mongoose model |
| `apps/admin/src/models/index.ts` | Export `LocationSnapshot` |
| `apps/admin/src/validators/locationSnapshot.ts` | New — Zod schemas |
| `apps/admin/src/services/LocationSnapshotService.ts` | New — create + list |
| `apps/admin/src/app/api/v1/attendance/location-snapshot/route.ts` | New — POST employee |
| `apps/admin/src/app/api/v1/attendance/location-snapshots/route.ts` | New — GET admin |
| `apps/mobile/lib/features/attendance/data/sources/location_snapshot_source.dart` | New — Dio source |
| `apps/mobile/lib/core/constants/api_endpoints.dart` | Added `locationSnapshot` endpoint |
| `apps/mobile/lib/core/di/providers.dart` | Added `locationSnapshotSourceProvider` |
| `apps/mobile/lib/features/attendance/presentation/providers/attendance_provider.dart` | Location timer in `AttendanceNotifier` |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | Remote tracking notice card |
| `docs/80-remote-hourly-location-tracking-foundation.md` | Created — this document |

---

## Runtime Smoke Test Procedure

1. Admin: set geofence to `lat=0,lng=0,radius=100m` + `allowOutsideGeofence=true` for test employee
2. Mobile: tap CHECK IN → verify `isRemote=true` in backend
3. Verify: Home shows "Remote session active. Location will be recorded periodically." notice
4. Verify: `/api/v1/attendance/location-snapshot` received POST within ~5 seconds of check-in
5. Verify: `GET /api/v1/attendance/location-snapshots?employeeId=<id>` returns snapshot
6. Tap CHECK OUT → verify notice disappears + backend rejects any post-checkout snapshot with 409
7. Test non-remote path: restore geofence to office coords → check in → no tracking notice, no snapshots
8. Restore: geofence `lat=19.201,lng=73.086,radius=200m`, `allowOutsideGeofence=false`

---

## Static / Build Results

| Check | Result |
|---|---|
| `tsc --noEmit` | PASS — 0 errors |
| `flutter analyze --no-fatal-infos` | PASS — No issues |
| `flutter build apk --debug` | PASS — `build/app/outputs/flutter-apk/app-debug.apk` |
| APK install (device 700dd050) | PASS — `adb install -r` Success |

---

## Runtime Smoke Test Results

**Test: Sat 11 Jul 2026, ~00:32 IST**
- Geofence: `lat=0,lng=0,radius=100m` (device ~8000km outside)
- `allowOutsideGeofence=true` for test user

| Verification | Expected | Result |
|---|---|---|
| Home shows "Remote" chip + "Checked In" | Visible | ✓ UIAutomator confirmed |
| Home shows tracking notice | "Remote session active. Location will be recorded periodically while checked in." | ✓ In content-desc |
| Immediate snapshot sent after check-in | 1 snapshot within ~5s | ✓ `lat=19.2019, lng=73.0866, acc=23.6m` in DB |
| Admin GET `/location-snapshots` returns data | `total: 1` | ✓ Confirmed |
| Checkout → notice disappears | No tracking card | ✓ UI shows "Partial Day" + "CHECK IN AGAIN" |
| Location timer stopped after checkout | Timer cancelled | ✓ `_stopLocationTracking()` called in `checkOut()` |
| POST snapshot with no active session → 409 | Rejected | ✓ HTTP 409 confirmed |
| Settings restored | `lat=19.201,lng=73.086,r=200m`, `allowOutsideGeofence=false` | ✓ API verified |
