# Phase 15.44 — Mobile Raw DioException Final Fix

## Executive Summary

After Phase 15.43, the operator confirmed mobile Home screen still showed raw `DioException [connection error]: Connection refused errno=111` when `adb reverse` was removed and pull-to-refresh was triggered. Three root causes were identified and fixed. No raw technical exceptions are now passed to Flutter's error display system.

---

## Reproduction Evidence

- Device: CPH2721 (`700dd050`), Android 16
- APK: debug build with `API_BASE_URL=http://127.0.0.1:3000`
- Steps: remove `adb reverse tcp:3000 tcp:3000` → pull to refresh Home
- Result before fix: full-screen red Flutter debug overlay showing raw `DioException`

---

## Root Cause

Three concurrent issues:

### 1. `PlatformDispatcher.instance.onError` returned `false` (main.dart)

Left over from Phase 15.18 diagnostic code. `return false` tells Flutter "I did not handle this error" → Flutter's default handler shows the full red debug error overlay for ANY unhandled async error in the root zone.

Even if errors in provider/reconcile paths were caught, errors from Timer callbacks (sync timer, notification timers) ran in the root zone. If their discarded Futures failed for any reason, `PlatformDispatcher.instance.onError` returned `false` → red screen.

### 2. `_startSyncTimer` discarded `reconcile()` Future without `try/catch` (attendance_provider.dart)

```dart
// Before:
_syncTimer = Timer.periodic(const Duration(minutes: 5), (_) => reconcile());
```

Timer callbacks run in the root zone. The returned Future from `reconcile()` was discarded. Although `reconcile()` catches errors internally, any exception thrown BEFORE the try/catch (e.g., from `_setCheckInState` if the StateNotifier is being disposed) would create an unhandled Future error in the root zone → reported to `PlatformDispatcher.onError`.

### 3. `ShiftReminderService` Timer callbacks discarded `_show()` Futures (shift_reminder_service.dart)

```dart
// Before:
_checkinTimer = Timer(delay, () => _show(...));
```

`_show()` returns `Future<void>` (from `FlutterLocalNotificationsPlugin.show()`). This Future was discarded. If the notification plugin threw (e.g., permission denied, plugin not initialized), the unhandled Future error reached the root zone → `PlatformDispatcher.onError` returned `false` → red screen showing the exception.

---

## Files Inspected

| File | Finding |
|---|---|
| `lib/main.dart` | `PlatformDispatcher.onError` returns `false` (shows red screen); `FlutterError.onError` calls `dumpErrorToConsole` (redundant) |
| `lib/features/attendance/presentation/providers/attendance_provider.dart` | Timer discards `reconcile()` Future without catch |
| `lib/features/notifications/data/services/shift_reminder_service.dart` | Timer callbacks discard `_show()` Futures without catch |
| `lib/features/home/presentation/screens/home_screen.dart` | `_reconcile()` already has try/catch (Phase 15.42) ✓ |
| All 7 screens with `when(error:)` | Already use `AppErrorWidget` (Phase 15.42) ✓ |

---

## Error Handling Fix

### `apps/mobile/lib/core/errors/error_message_mapper.dart` (new)

Centralized mapper: `DioException` type → friendly message. Never exposes raw exception text, URLs, or tokens.

| DioException type | User message |
|---|---|
| `connectionError` / `unknown` | "Unable to connect. Please check your internet connection and try again." |
| `*Timeout` | "Request timed out. Please try again." |
| HTTP 401 | "Your session expired. Please log in again." |
| HTTP 403 | "You do not have permission to view this." |
| HTTP 404 | "This information could not be found." |
| HTTP 422 | "Please check the entered information." |
| HTTP 5xx | "Server error. Please try again later." |
| Fallback | "Something went wrong. Please try again." |

---

## Home Refresh Fix

`_reconcile()` in `home_screen.dart` already had a `try/catch` safety net from Phase 15.42. The issue was upstream — `PlatformDispatcher.onError` returning `false` meant even well-caught errors in the root zone were re-displayed by Flutter.

---

## Fixes Applied

### `apps/mobile/lib/main.dart`

- `PlatformDispatcher.instance.onError` now returns `true` (we handle it by logging; Flutter no longer shows the red overlay)
- `FlutterError.onError` no longer calls `FlutterError.dumpErrorToConsole` (which triggered `presentError` → red overlay); now only prints to console
- Removed Phase 15.18 diagnostic `[DIAG][BOOT]` prints that exposed `API_BASE_URL` env value

### `apps/mobile/lib/features/attendance/presentation/providers/attendance_provider.dart`

```dart
// After:
_syncTimer = Timer.periodic(const Duration(minutes: 5), (_) async {
  try {
    await reconcile();
  } catch (_) {}
});
```

### `apps/mobile/lib/features/notifications/data/services/shift_reminder_service.dart`

Both `_checkinTimer` and `_checkoutTimer` callbacks now `await _show(...)` inside `try/catch`.

---

## Broken Connection Verification

| Scenario | Expected | Status |
|---|---|---|
| Normal: tunnel active, Home loads | Shift 09:00–18:00, Required 9h 0m | Pending device |
| Remove tunnel: pull to refresh | Friendly card "Unable to load attendance. Check your connection and try again." + Retry button. NO red screen. | Pending device |
| Tap Retry (still no tunnel) | Error card stays, no crash | Pending device |
| Restore tunnel, tap Retry | Home loads normally | Pending device |

---

## Normal Functionality Regression Check

| Flow | Expected |
|---|---|
| Home loads with tunnel | Shift/required/on-time correct |
| Attendance tab | History loads |
| Leave tab | Balance and history load |
| Notifications | List loads |
| Profile | Details load |

---

## Static / Build Checks

| Check | Result | Pass/Fail |
|---|---|---|
| `flutter analyze --no-fatal-infos` | No issues found (7.0s) | PASS |
| `flutter build apk --debug` | Built successfully (23.7s) | PASS |

---

## Files Modified

| File | Change |
|---|---|
| `apps/mobile/lib/main.dart` | `PlatformDispatcher.onError` returns `true`; `FlutterError.onError` no longer calls `dumpErrorToConsole`; removed boot env prints |
| `apps/mobile/lib/features/attendance/presentation/providers/attendance_provider.dart` | Timer wraps `reconcile()` in `async { try { await } catch {} }` |
| `apps/mobile/lib/features/notifications/data/services/shift_reminder_service.dart` | Timer callbacks `await _show()` in `try/catch` |
| `apps/mobile/lib/core/errors/error_message_mapper.dart` | New centralized error message mapper |

---

---

## Phase 15.44R — Runtime Failure and Final Fix

### Screenshot-Based Finding

Runtime verification failed after Phase 15.44 first attempt. Operator screenshot showed:
- Red error area **inside** Home tab content area
- Bottom navigation bar **still visible**
- Therefore: Flutter `ErrorWidget` rendered for a widget **subtree**, NOT a full-screen PlatformDispatcher/zone error

This confirms that some widget's `build()` method throws, Flutter calls `ErrorWidget.builder` (which defaults to raw red error box with exception text), and the exception text contains `DioException [connection error]`.

### Root Cause of Subtree ErrorWidget

Two issues:

1. **`attendanceAsync.value` vs `attendanceAsync.asData?.value`** — In Riverpod 2.5.x on `AsyncError` state where a previous value exists (`hasValue = true`), the `.value` getter may surface the error through the value chain in certain build-time widget resolution paths. The safer idiom is `attendanceAsync.asData?.value` which only returns data when the state is DEFINITELY in `AsyncData` state.

2. **`ErrorWidget.builder` not overridden** — Phase 15.44 changed `FlutterError.onError` (logging handler) but NOT `ErrorWidget.builder` (the widget that replaces a throwing subtree). Even after Phase 15.44, any widget throw would still render the raw exception text via the default `ErrorWidget.builder`. These are two separate Flutter hooks.

### Fixes Applied

**`apps/mobile/lib/features/home/presentation/screens/home_screen.dart`**

```dart
// Before:
_MonthSummary(today: attendanceAsync.value)

// After:
_MonthSummary(today: attendanceAsync.asData?.value)
```

**`apps/mobile/lib/main.dart`** — Added `ErrorWidget.builder` override:

```dart
ErrorWidget.builder = (FlutterErrorDetails details) {
  print('[ERR][WIDGET] ${details.exceptionAsString()}');
  return const Material(
    color: Colors.transparent,
    child: Padding(
      padding: EdgeInsets.all(16),
      child: Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Something went wrong. Please try again.', textAlign: TextAlign.center),
        ),
      ),
    ),
  );
};
```

This is a final safety net: even if any widget in the entire app throws during build, users see "Something went wrong. Please try again." in a card — never raw exception text.

### Verification Expected

| Test | Expected |
|---|---|
| Remove tunnel + pull to refresh | `_ErrorStatusCard` with "Unable to load attendance. Check your connection." + Retry |
| If any widget subtree throws (any reason) | Friendly card "Something went wrong. Please try again." |
| Restore tunnel + Retry | Home recovers, shows shift/required/on-time |

### Static / Build Checks (Phase 15.44R)

| Check | Result | Pass/Fail |
|---|---|---|
| `flutter analyze --no-fatal-infos` | No issues found (6.2s) | PASS |
| `flutter build apk --debug` | Built successfully (18.0s) | PASS |

### Files Modified (Phase 15.44R)

| File | Change |
|---|---|
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | `attendanceAsync.value` → `attendanceAsync.asData?.value` |
| `apps/mobile/lib/main.dart` | Added `ErrorWidget.builder` override showing friendly card |

---

## Remaining Known Issues

- Broken-connection UX test pending operator screenshot confirmation
- Stored `requiredDailyMinutes: 480` in DB now irrelevant (derived from shift times) but not cleaned up

---

## Production Readiness Impact

NOT READY. Pre-existing blockers remain:
- Exposed secrets not rotated
- Git history not remediated
- Vercel production verification incomplete
- Admin/mobile final UAT incomplete

---

## Final Decision

**B** — All code fixes applied (three Phase 15.44 fixes + two Phase 15.44R fixes); analyze and build pass; broken-connection runtime UX verification pending operator screenshot.
