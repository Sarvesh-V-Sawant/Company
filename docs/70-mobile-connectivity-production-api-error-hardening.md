# Phase 15.42 — Mobile Connectivity and Production API Error Hardening

## Executive Summary

When the Android device USB cable was disconnected from the laptop (removing the ADB reverse tunnel), the Home/Dashboard screen showed a full-screen Flutter debug error (dark red, raw `DioException [connection error]: Connection refused errno=111`) instead of a friendly user-facing message. This phase hardened all network error paths across the mobile app so raw technical exceptions never reach users.

---

## Root Cause

- **ADB reverse tunnel** (`adb reverse tcp:3000 tcp:3000`) routes device `localhost:3000` → laptop port 3000 (Next.js dev server).
- USB removal kills the tunnel. `localhost:3000` becomes unreachable → `DioException: Connection refused`.
- Pull-to-refresh called `_reconcile()` which passed the error future upward. Even though `attendanceProvider.reconcile()` catches internally, Flutter's error boundary could still catch the exception in debug mode, producing the full red error screen.
- 8 screens had raw `Text('Error: $e')` rendering the raw exception object.

---

## Fixes Applied

### 1. `apps/mobile/lib/features/home/presentation/screens/home_screen.dart`

- `_reconcile()` wrapped in `try/catch` safety net — future returned to `RefreshIndicator.onRefresh` and `didChangeAppLifecycleState` never throws past Flutter's boundary
- `_ErrorStatusCard` upgraded: now accepts optional `onRetry` callback, shows "Unable to load attendance. Check your connection and try again." + Retry button

### 2. Raw error display hardening (8 locations across 7 files)

All `error: (e, _) => Center(child: Text('Error: $e'))` replaced with `AppErrorWidget(message: '...', onRetry: ...)`:

| File | Change |
|---|---|
| `apps/mobile/lib/features/notifications/presentation/screens/notifications_screen.dart` | `AppErrorWidget` + retry |
| `apps/mobile/lib/features/leave/presentation/screens/leave_balance_screen.dart` | `AppErrorWidget` + retry (balance + history tabs) |
| `apps/mobile/lib/features/regularization/presentation/screens/regularization_screen.dart` | `AppErrorWidget` + retry |
| `apps/mobile/lib/features/regularization/presentation/screens/regularization_detail_screen.dart` | `AppErrorWidget` (no retry — detail) |
| `apps/mobile/lib/features/leave/presentation/screens/leave_detail_screen.dart` | `AppErrorWidget` (no retry — detail) |
| `apps/mobile/lib/features/payroll/presentation/screens/payslip_list_screen.dart` | `AppErrorWidget` + retry |
| `apps/mobile/lib/features/payroll/presentation/screens/payslip_detail_screen.dart` | `AppErrorWidget` (no retry — detail) |

### 3. `apps/mobile/.env.example.json`

Fixed double `/api/v1` prefix in example `API_BASE_URL`. Was: `https://<domain>/api/v1` (would produce `/api/v1/api/v1/...` URLs). Now: `https://<your-production-domain>`.

---

## API Environment Configuration

No new environment switching UI implemented. `ApiEndpoints.baseUrl` already uses `String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000')`.

| Mode | Build command |
|---|---|
| Local USB (dev) | `flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000` |
| Local Wi-Fi | `flutter run --dart-define=API_BASE_URL=http://<laptop-wifi-ip>:3000` |
| Production | `flutter build apk --dart-define=API_BASE_URL=https://<domain>` |

---

## Runtime Verification

### Phase G — Local USB (tunnel active)

APK built with `API_BASE_URL=http://127.0.0.1:3000`, installed and launched on device CPH2721 (`700dd050`, Android 16).

### Phase H — Broken connection (tunnel removed)

Broken-connection scenario (`adb reverse --remove tcp:3000`):

| Scenario | Expected | Status |
|---|---|---|
| Pull-to-refresh with no tunnel | Friendly error card + Retry, no red screen | Pending operator screenshot confirmation |
| Tap Retry | Retries `reconcile()` | Pending |
| Restore tunnel + retry | App recovers normally | Pending |

**Code fix is in place** (`_reconcile()` catches all exceptions). Operator needs to screenshot the device to confirm no red screen appears.

---

## Static / Build Checks

| Check | Result |
|---|---|
| `flutter analyze --no-fatal-infos` | No issues found |
| `flutter build apk --debug` | Built successfully |

---

## Files Modified

| File | Change |
|---|---|
| `apps/mobile/lib/features/home/presentation/screens/home_screen.dart` | `_reconcile()` safety net; `_ErrorStatusCard` with retry |
| `apps/mobile/lib/features/notifications/presentation/screens/notifications_screen.dart` | `AppErrorWidget` |
| `apps/mobile/lib/features/leave/presentation/screens/leave_balance_screen.dart` | `AppErrorWidget` (2 tabs) |
| `apps/mobile/lib/features/regularization/presentation/screens/regularization_screen.dart` | `AppErrorWidget` |
| `apps/mobile/lib/features/regularization/presentation/screens/regularization_detail_screen.dart` | `AppErrorWidget` |
| `apps/mobile/lib/features/leave/presentation/screens/leave_detail_screen.dart` | `AppErrorWidget` |
| `apps/mobile/lib/features/payroll/presentation/screens/payslip_list_screen.dart` | `AppErrorWidget` |
| `apps/mobile/lib/features/payroll/presentation/screens/payslip_detail_screen.dart` | `AppErrorWidget` |
| `apps/mobile/.env.example.json` | Fixed double `/api/v1` prefix |

---

## Update — Phase 15.44

Raw `DioException` was still appearing after Phase 15.42/15.43 fixes. Three root causes identified and fixed in Phase 15.44:

1. `PlatformDispatcher.instance.onError` returning `false` (Phase 15.18 diagnostic code) → now returns `true`
2. Sync timer in `attendance_provider.dart` discarding `reconcile()` Future without try/catch → fixed
3. ShiftReminderService Timer callbacks discarding `_show()` Future → fixed

See `docs/72-mobile-raw-dioexception-final-fix.md` for full details.

---

## Final Decision

**B** — All code fixes applied and build-verified; broken-connection runtime UX verification pending operator screenshot.
