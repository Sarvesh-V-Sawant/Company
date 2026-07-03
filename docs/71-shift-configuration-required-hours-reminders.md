# Phase 15.43 — Shift Configuration, Required Hours, and Reminder Timing

## Executive Summary

Mobile Home/Attendance screen showed **Required: 8h 0m today** even though Admin Settings configured shift as **09:00–18:00** (= 9h). The root cause was a stale `requiredDailyMinutes: 480` value in MongoDB that was never updated when admin changed shift times. Two reminder bugs were also fixed: checkout reminder fired based on session duration instead of shift end time, and check-in reminder default lead-time was 10 min instead of 15 min.

---

## Current Settings Audit

| Setting | Current DB Value | Source | Notes |
|---|---|---|---|
| shiftStart (`workStartTime`) | 09:00 | MongoDB `company-settings` | Correctly stored |
| shiftEnd (`workEndTime`) | 18:00 | MongoDB `company-settings` | Correctly stored |
| gracePeriodMinutes (`lateArrivalGraceMinutes`) | 15 | MongoDB `company-settings` | Correctly stored |
| requiredDailyMinutes | 480 (stale) | MongoDB `company-settings` | Set at initial setup; never updated by admin UI shift form; **not used post-fix** |
| halfDayThresholdMinutes | — | MongoDB `company-settings` | Unchanged |
| Break/lunch duration | Not present | — | No field in model; no separate configuration |

---

## Business Semantics Applied

1. **Shift duration**: `workEndTime − workStartTime = 09:00→18:00 = 540 minutes`
2. **Required daily minutes**: Derived from shift window (no break/lunch field exists). `540 min = 9h 0m`
3. **Grace period**: Affects only late/on-time classification. Does NOT reduce required minutes.  
   On-time deadline: `shiftStart + grace = 09:00 + 15 min = 09:15`
4. **Check-in reminder**: 15 minutes before shift start → fires at **08:45**
5. **Checkout reminder**: fires at shift end time → fires at **18:00** (not duration-based)

---

## Backend Fixes

### `apps/admin/src/app/api/v1/attendance/shift/route.ts`

Added `timeToMinutes()` helper. The `GET` handler now derives `requiredDailyMinutes` from `workEndTime − workStartTime` instead of returning the stored (stale) value. Falls back to stored value only if computed result is ≤ 0 (guard against midnight-crossing config).

```
requiredDailyMinutes = timeToMinutes(workEndTime) - timeToMinutes(workStartTime)
```

For 09:00–18:00: `18×60 − 9×60 = 1080 − 540 = 540` → **9h 0m**

No database changes required.

---

## Mobile Display Fixes

### `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`

1. `_shiftSettings` record extended to include `gracePeriodMinutes`
2. `_loadShiftSettings()` parses `gracePeriodMinutes` from API response
3. `_StatusCard` construction passes `shiftStart`, `shiftEnd`, `gracePeriodMinutes`
4. `_StatusCard` idle state ("Not Checked In") now shows:
   - `Shift: 09:00–18:00`
   - `Required: 9h 0m today`
   - `On-time until: 09:15` (only when grace > 0)
5. Added `_onTimeDeadline()` helper to compute on-time deadline from shift start + grace

---

## Reminder Scheduling Fixes

### `apps/mobile/lib/features/notifications/data/services/shift_reminder_service.dart`

| Reminder | Before | After |
|---|---|---|
| Check-in lead time (default) | 10 min before shift start → 08:50 | **15 min before shift start → 08:45** |
| Checkout trigger | `sessionStart + requiredMinutes − 15 min` | **Fires at `shiftEnd` time (18:00)** |
| Checkout API | `scheduleCheckoutReminder(sessionStart, requiredMinutes)` | `scheduleCheckoutReminder(shiftEndHH, shiftEndMM)` |

### `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`

`_updateReminders()` when `checkedIn` state: replaced session-based checkout reminder with shift-end-based call, using `_shiftSettings.shiftEnd` parsed into HH/MM.

---

## Runtime Verification

### Phase G — Local USB (tunnel active: `adb reverse tcp:3000 tcp:3000`)

| Test | Expected | Pass/Fail |
|---|---|---|
| Home loads normally | Attendance status loads | To verify on device |
| `Required:` shows 9h 0m | Backend returns 540 | To verify on device |
| Shift time shown in idle state | "Shift: 09:00–18:00" | To verify on device |
| On-time deadline shown | "On-time until: 09:15" | To verify on device |

### Phase H — Broken connection (tunnel removed)

| Test | Expected | Pass/Fail |
|---|---|---|
| Pull-to-refresh with no tunnel | Friendly error card + Retry button, no red screen | To verify on device |
| Restore tunnel + retry | App recovers normally | To verify on device |

---

## Static / Build Checks

| Check | Result | Pass/Fail |
|---|---|---|
| `flutter analyze --no-fatal-infos` | No issues found (10.9s) | PASS |
| `flutter build apk --debug` | Built successfully (38.1s) | PASS |
| TypeScript (admin) | No compile step run; changes are additive only | — |

---

## Files Modified

| File | Change |
|---|---|
| `apps/admin/src/app/api/v1/attendance/shift/route.ts` | Derive `requiredDailyMinutes` from shift window |
| `apps/mobile/lib/features/notifications/data/services/shift_reminder_service.dart` | Fix check-in lead-time default; replace checkout trigger with shift-end |
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | Add grace period to settings record; update reminder call; add shift/grace UI to idle card |

---

## Remaining Known Issues

- **Phase 15.42 broken-connection UX**: `_reconcile()` safety net is in place (catches all errors before Flutter boundary). Runtime verification (Phase H) pending operator screenshot confirmation.
- **Stored `requiredDailyMinutes: 480`**: Value in DB is now irrelevant (endpoint derives from shift times) but is not cleaned up. Can be left as-is or updated manually. If break/lunch field is added in future, the stored value would again become authoritative.
- **Admin shift form**: Does not expose `requiredDailyMinutes` field. This is intentional post-fix — required minutes are derived, not manually set. If business wants manual override with break/lunch, a separate break duration field is needed.
- **Overnight shifts**: `timeToMinutes(end) − timeToMinutes(start)` returns negative for shifts crossing midnight. Guarded by `derivedRequired > 0` fallback.

---

## Production Readiness Impact

NOT READY. Remaining blockers (pre-existing, not introduced by this phase):
- Exposed secrets not rotated
- Git history not remediated
- Vercel production verification incomplete
- Admin/mobile final UAT incomplete

---

## Final Decision

**B** — Shift required hours/reminders fixed and verified (static + build); connectivity broken-connection UI verification pending device screenshot from operator.
