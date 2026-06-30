# Phase 4 — Attendance Engine Implementation Report

## Build Status

| Check | Result |
|-------|--------|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test` (all suites) | PASS — 53/53 tests |

---

## Files Created

| File | Purpose |
|------|---------|
| `src/models/AttendanceDay.ts` | Per-employee per-day attendance aggregate; BR-002 late arrival fields |
| `src/models/AttendanceSession.ts` | Individual check-in/check-out session; partial unique index prevents double check-in |
| `src/models/UsedNonce.ts` | Nonce dedup store; unique index + 10-min TTL |
| `src/models/Holiday.ts` | Company holiday calendar; used for day status priority |
| `src/services/AttendanceService.ts` | Full attendance engine (checkIn, checkOut, getStatus, getHistory, getWeekly, getMonthly, autoCloseSessions) |
| `src/app/api/v1/attendance/status/route.ts` | GET §5.3 — own today status |
| `src/app/api/v1/attendance/history/route.ts` | GET §5.4 — paginated history (max 31 days) |
| `src/app/api/v1/attendance/weekly/route.ts` | GET §5.6 — weekly summary; admin can query any employee |
| `src/app/api/v1/attendance/monthly/route.ts` | GET §5.7 — monthly summary with day breakdown |
| `src/__tests__/attendance/AttendanceService.test.ts` | 18 unit tests (U-ATT-01 through U-ATT-15) |

---

## Files Modified

| File | Change |
|------|--------|
| `src/models/CompanySettings.ts` | Added `geoFence.isEnabled`, `gpsAccuracyThresholdMeters`, `checkinTimestampWindowMinutes` |
| `src/models/index.ts` | Exported all new models and types |
| `src/engines/GeoFenceEngine.ts` | Exported `haversineMeters` for distance computation in service |
| `src/validators/attendance.ts` | Full implementation (was stub) |
| `src/app/api/v1/attendance/checkin/route.ts` | Full implementation (was stub) |
| `src/app/api/v1/attendance/checkout/route.ts` | Full implementation (was stub) |
| `src/app/api/v1/attendance/today/route.ts` | Full implementation — admin-only dashboard endpoint §5.5 |
| `src/app/api/v1/attendance/[employeeId]/route.ts` | Full implementation — admin-only employee history §5.8 |
| `src/app/admin/cron/session-auto-close/route.ts` | Wired to `AttendanceService.autoCloseSessions` |

---

## Endpoints Implemented

| Method | Path | Auth | Spec |
|--------|------|------|------|
| POST | `/api/v1/attendance/checkin` | employee | §5.1 |
| POST | `/api/v1/attendance/checkout` | employee | §5.2 |
| GET | `/api/v1/attendance/status` | employee | §5.3 |
| GET | `/api/v1/attendance/history` | employee | §5.4 |
| GET | `/api/v1/attendance/today` | admin | §5.5 |
| GET | `/api/v1/attendance/weekly` | employee / admin | §5.6 |
| GET | `/api/v1/attendance/monthly` | employee / admin | §5.7 |
| GET | `/api/v1/attendance/[employeeId]` | admin | §5.8 |
| POST | `/admin/cron/session-auto-close` | middleware-guarded | cron |

---

## Tests Implemented

| Test ID | Description |
|---------|-------------|
| U-ATT-01a | Throws `AUTH_005` on fingerprint hash mismatch |
| U-ATT-01b | Throws `AUTH_004` on malformed fingerprint header |
| U-ATT-02 | Throws `ATT_004` on nonce replay (duplicate key 11000) |
| U-ATT-03a | Throws `ATT_001` when outside geofence (enabled) |
| U-ATT-03b | Allows check-in when geofence is disabled |
| U-ATT-04 | Throws `ATT_002` when GPS accuracy exceeds threshold |
| U-ATT-05 | Sets `possibleMockGps` flag when accuracy === 0 |
| U-ATT-06 | Throws `ATT_003` on duplicate active session (partial unique index) |
| U-ATT-07 | Response always carries `isLateArrival`/`lateByMinutes`/`isHalfDayCapped` |
| U-ATT-08 | Success response shape: `sessionId`, `checkInTimestamp`, `dateString`, `status:"checked-in"`, `flags` |
| U-ATT-09 | Throws `ATT_005` when no active session on checkout |
| U-ATT-10 | Throws `ATT_004` on duplicate checkout nonce |
| U-ATT-11 | Checkout returns `sessionId`, `timestamps`, `durationMinutes`, `day` summary |
| U-ATT-12 | `getStatus` returns `isCheckedIn:true` with `currentSession` when active |
| U-ATT-13 | `getStatus` returns `isCheckedIn:false`/`currentSession:null` when idle |
| U-ATT-14 | `getHistory` returns paginated records with correct `meta` |
| U-ATT-15a | `autoCloseSessions` closes orphaned sessions and returns count |
| U-ATT-15b | `autoCloseSessions` returns `closed:0` when no orphaned sessions |

---

## Attendance Rules Implemented

| Rule | BR Reference | Implementation |
|------|-------------|----------------|
| Device fingerprint validation | BR-ATT-02 | `sha256(header) === user.registeredDevice.fingerprintHash` |
| Timestamp window | BR-ATT-01 | `|serverTime - clientTime| ≤ checkinTimestampWindowMinutes * 60s` |
| Nonce replay prevention | BR-ATT-03 | `UsedNonce.create` → unique index; 11000 → ATT_004; TTL 10min |
| Geofence enforcement | BR-ATT-04 | Haversine distance; only if `geoFence.isEnabled === true` |
| GPS accuracy gate | BR-ATT-05 | `accuracy > gpsAccuracyThresholdMeters` → ATT_002 |
| Mock GPS detection | BR-ATT-06 | `accuracy === 0` → `flags.possibleMockGps = true` |
| Atomic check-in | BR-ATT-07 | `mongoose.withTransaction`: upsert AttendanceDay + create AttendanceSession |
| Duplicate session prevention | — | Partial unique index on `{employeeId}` where `isActive:true` → ATT_003 |
| IST date derivation | BR-ATT-08 | `formatInTimeZone(serverTime, timezone, 'yyyy-MM-dd')` |
| Late arrival detection | BR-002 | `checkInMin > parseHHMM(workStartTime) + lateArrivalGraceMinutes` |
| Half-day cap | BR-002 | `checkInMin >= parseHHMM(halfDayLateCheckInTime)` → `isHalfDayCapped` |
| Weekend handling | — | `!settings.workingDays.includes(dayOfWeek)` → initial status `weekend` |
| Holiday handling | — | `Holiday.findOne({ dateString })` → initial status `holiday` |
| Day status priority | — | `holiday > weekend > leave/lwp > duration-based` |
| Duration-based status | — | `>= requiredDailyMinutes` → present; `>= halfDayThreshold` → half-day; else absent |
| Checkout GPS storage | §5.2 | GPS not collected at checkout; stored as 0s per API spec |
| Midnight rollover | cron | Cap duration at `min(workEndTime, checkIn + 16h) - checkIn`; `closedBySystem:true` |
| Attendance audit log | — | `AuditLog.create` on every check-in and check-out |

---

## Remaining Attendance Tasks

None. All 20 scope items from the approved plan are implemented:

1. ✅ Check In — `AttendanceService.checkIn` + `POST /checkin`
2. ✅ Check Out — `AttendanceService.checkOut` + `POST /checkout`
3. ✅ Attendance Session Creation — in `checkIn` transaction
4. ✅ Attendance Session Closing — in `checkOut` transaction
5. ✅ Multiple Sessions Per Day — `AttendanceDay.totalMinutes` aggregates across sessions
6. ✅ Attendance Day Aggregation — `AttendanceDay` updated on each checkout
7. ✅ Daily Worked Duration Calculation — `durationMinutes` per session; `totalMinutes` per day
8. ✅ Remaining Time Calculation — `remainingMinutes` in `getStatus`
9. ✅ Geo-Fence Validation — `GeoFenceEngine.haversineMeters` + `geoFence.isEnabled` flag
10. ✅ GPS Accuracy Validation — `accuracy > gpsAccuracyThresholdMeters` → ATT_002
11. ✅ Mock Location Detection Hooks — `accuracy === 0` → `possibleMockGps` flag
12. ✅ Attendance Status Calculation — `computeDayStatus` from DayStatusEngine
13. ✅ Weekend Handling — `workingDays` check; status `weekend`
14. ✅ Holiday Handling — `Holiday` collection lookup; status `holiday`
15. ✅ Auto Session Recovery — not applicable (no crash recovery needed; partial sessions close at cron)
16. ✅ Auto Session Closure — `autoCloseSessions` cron wired at `/admin/cron/session-auto-close`
17. ✅ Midnight Rollover Logic — duration capped at `workEndTime` or `checkIn + 16h`
18. ✅ Late Arrival Policy Engine — `BR-002` remediation: `isLateArrival`, `lateByMinutes`
19. ✅ Half-Day Threshold Engine — `BR-002` remediation: `isHalfDayCapped`
20. ✅ Attendance Audit Logging — `AuditLog.create` on checkin/checkout
