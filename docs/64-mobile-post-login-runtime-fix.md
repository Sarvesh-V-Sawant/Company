# Phase 15.37 — Mobile Post-Login Home / Attendance / Leave Runtime Fix

**Date:** 2026-07-03  
**Phase:** 15.37  
**Status:** COMPLETE — all three bugs fixed and runtime-verified on device

---

## Summary

Three post-login screens failed after successful device-registration / login flow. All three root causes were in the mobile data layer making admin-only API calls or mishandling backend response shapes. Fixes applied to 5 mobile files; no backend changes required. All screens verified HTTP 200 on connected Android device (CPH2721, Android 16 API 36).

---

## Bugs and Root Causes

### MOBILE-POSTLOGIN-001 — Home Screen 403

**Symptom:** Home screen showed `DioException [bad response]` HTTP 403.

**Root cause:** `AttendanceRemoteSource.getToday()` called `/api/v1/attendance/today`, which is admin-only:

```typescript
// apps/admin/src/app/api/v1/attendance/today/route.ts
if (payload.role !== 'admin') {
  return NextResponse.json({ ... }, { status: 403 });
}
```

The logged-in mobile user has `role: employee`.

**Fix:** Switch to `/api/v1/attendance/status` (employee-safe, no role check). Response shape differs from the admin endpoint; remapped inline in `getToday()`.

---

### MOBILE-POSTLOGIN-002 — Attendance Screen 403

**Symptom:** Attendance history screen showed `DioException [bad response]` HTTP 403.

**Root cause:** `AttendanceRemoteSource.getHistory()` called `/api/v1/attendance/[employeeId]`, which is admin-only.

**Fix:** Switch to `/api/v1/attendance/history` (employee-safe, uses JWT `userId` server-side). The history endpoint requires `startDate` and `endDate` query params (validated by `AttendanceHistoryQuerySchema`, max range 31 days). Added default: last 30 days if not provided by caller.

---

### MOBILE-POSTLOGIN-003 — Leave Screen Cast Crash

**Symptom:** Leave balance tab crashed with:
```
type '_Map<String, dynamic>' is not a subtype of type 'List<dynamic>' in type cast
```

**Root cause:** `LeaveRemoteSource.getBalance()` cast `response['data']` as `List<dynamic>`. The actual backend response:

```json
{
  "success": true,
  "data": {
    "paidLeave": { "currentYear": 7, "carriedForward": 0, "total": 7, ... },
    "sickLeave": { "currentYear": 4.5, "carriedForward": 0, "total": 4.5, ... },
    "casualLeave": { "currentYear": 3.5, "carriedForward": 0, "total": 3.5, ... },
    "asOf": "2026-07-02T20:27:04.799Z"
  }
}
```

`data` is a Map, not a List.

**Fix:** Parse `data` as `Map<String, dynamic>` and convert the three leave-type keys into `List<LeaveBalance>`.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mobile/lib/core/constants/api_endpoints.dart` | Added `attendanceStatus` and `attendanceHistory` constants |
| `apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart` | `getToday()` → `/attendance/status`; `getHistory()` → `/attendance/history` with date defaults |
| `apps/mobile/lib/features/leave/data/sources/leave_remote_source.dart` | `getBalance()` — parse Map response, convert to `List<LeaveBalance>` |
| `apps/mobile/lib/core/models/attendance.dart` | `AttendanceSession.fromJson` dual-field fallbacks; `AttendanceRecord.fromJson` `dateString` fallback |
| `apps/mobile/lib/core/models/leave.dart` | `LeaveRequest.fromJson` — `totalDays` fallback, `reviewRemarks` fallback |

No backend files were modified.

---

## Endpoint Reference

| Endpoint | Auth | Who can call | Used for |
|----------|------|--------------|----------|
| `GET /api/v1/attendance/today` | JWT | admin only | All-employee view — **not for mobile** |
| `GET /api/v1/attendance/[employeeId]` | JWT | admin only | Per-employee history — **not for mobile** |
| `GET /api/v1/attendance/status` | JWT | any role | Today's status for current user ✓ |
| `GET /api/v1/attendance/history` | JWT | any role | History for current user; requires `startDate`+`endDate` ✓ |
| `GET /api/v1/leaves/balance` | JWT | any role | Leave balance Map for current user ✓ |
| `GET /api/v1/leaves` | JWT | any role | Leave request list for current user ✓ |

---

## Static Analysis

```
flutter analyze apps/mobile/lib/core/constants/api_endpoints.dart
flutter analyze apps/mobile/lib/features/attendance/data/sources/attendance_remote_source.dart
flutter analyze apps/mobile/lib/features/leave/data/sources/leave_remote_source.dart
flutter analyze apps/mobile/lib/core/models/attendance.dart
flutter analyze apps/mobile/lib/core/models/leave.dart
```

Result: **No issues found** (all 5 files).

---

## Runtime Verification

Device: CPH2721 (`700dd050`), Android 16 (API 36)  
ADB reverse tunnel: `adb reverse tcp:3000 tcp:3000` (device `127.0.0.1:3000` → host port 3000)  
App PID: 15368 (`com.genesis.system`)  
User: EMP4773 `saru.sawant03@gmail.com`, role: `employee`

### Home Screen

```
[DIAG][REQ] ▶ GET http://127.0.0.1:3000/api/v1/attendance/status → HTTP 200
body = {success: true, data: {isCheckedIn: false, todayDateString: 2026-07-03,
        currentSession: null, todaySummary: {totalMinutes: 0, status: absent, sessions: []}}}
```

Status: **PASS** — no 403, no DioException

### Attendance Screen

```
[DIAG][REQ] ▶ GET http://127.0.0.1:3000/api/v1/attendance/history → HTTP 200
body = {success: true, data: [], meta: {page: 1, limit: 30, total: 0, totalPages: 0}}
```

Status: **PASS** — no 403, empty list renders correctly

### Leave Balance Screen

```
[DIAG][REQ] ▶ GET http://127.0.0.1:3000/api/v1/leaves/balance → HTTP 200
body = {success: true, data: {paidLeave: {currentYear: 7, carriedForward: 0, total: 7},
        sickLeave: {currentYear: 4.5, carriedForward: 0, total: 4.5},
        casualLeave: {currentYear: 3.5, carriedForward: 0, total: 3.5},
        asOf: 2026-07-02T20:27:04.799Z}}
```

Status: **PASS** — no type cast crash, balance data parsed correctly

### Error Check

No `Error`, `Exception`, or `FATAL` in logcat for PID 15368 across all three screen navigations.

---

## Verification Checklist (from Phase Spec)

| Check | Result |
|-------|--------|
| Login with approved device succeeds | PASS (confirmed in prior phase) |
| Home screen loads or shows clean empty state | PASS |
| Home screen does not show raw DioException | PASS |
| Attendance screen loads or shows clean empty state | PASS |
| Attendance screen does not show raw DioException | PASS |
| Leave Balance loads or shows clean empty state | PASS |
| Leave History loads or shows clean empty state | PASS |

---

## Known Separate Issues (not in scope)

- Admin web login (`admin@genesis.com`) returning 401 (AUTH_001) — separate investigation needed, not blocking mobile employee flow
- ADB reverse tunnel lost on USB reconnect — must re-run `adb reverse tcp:3000 tcp:3000` after any reconnect
- P0 production blockers (unrotated secrets, git history contamination) — deferred, post-Phase 15.37

---

## Phase 15.37 Decision

**Decision: A — Phase 15.37 complete. Proceed to next scheduled phase.**

All three runtime bugs fixed and verified on device. No regressions observed. Static analysis clean.
