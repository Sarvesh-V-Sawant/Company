# Phase 15.23 — Mobile Authentication Runtime Investigation & UX Stabilization

## Symptom

Login button pressed → app stays on Login screen. No loading indicator, no error message, no navigation. Affects all accounts (`saru.sawant03@gmail.com`, `worksbysarvesh@gmail.com`).

Runtime: `flutter run --dart-define=API_BASE_URL=http://192.168.1.3:3000`

---

## Root Cause

**`appRouterProvider` recreated a brand-new `GoRouter` on every `AuthState` change.**

```dart
// BEFORE (broken)
final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);  // ← watches → invalidates on every change
  return GoRouter(...);                        // ← new instance each time
});
```

`ref.watch(authProvider)` inside `Provider<GoRouter>` caused the provider to be invalidated every time `AuthState` changed. `MaterialApp.router` received a new `GoRouter` instance and rebuilt with `initialLocation: RouteNames.splash`.

### Exact failure sequence

1. User taps Sign In → `LoginScreen._submit()` runs
2. `_submit()` calls `setState({ _loading = true })` (schedules rebuild)
3. `authProvider.notifier.login()` executes `state = state.copyWith(isLoading: true)` — **`AuthState` changes**
4. `appRouterProvider` invalidated → new `GoRouter` created → `MaterialApp.router` rebuilds with new router → navigation stack resets to `/` (splash)
5. `LoginScreen` unmounted — its `_LoginScreenState` disposed
6. `SplashScreen._init()` runs: no access/refresh tokens in storage (fresh login) → `context.go('/login')` → fresh `LoginScreen` with `_loading = false`
7. Old `_submit()` coroutine still running in background. All `if (!mounted) return;` guards fire (old widget is disposed)
8. `login()` eventually throws `DeviceMismatchException(AUTH_004)`:
   - `catch` in `AuthNotifier`: `state = state.copyWith(isLoading: false, error: ...)` → **another router rebuild** → splash → login
   - `on DeviceMismatchException catch (e)` in old `_submit()`: `if (!mounted) return;` → exits without navigating
9. **Result**: user sees a fresh login screen with no error, no loading, no navigation

For **success** paths, the pattern was similar but slightly better: after 2–3 router rebuild cycles the user might eventually reach home via `SplashScreen → home`, but the experience was unpredictable.

### Why no other error path worked either

Every error case in `_submit()` has `if (!mounted) return;` before acting on UI. Since `LoginScreen` was remounted as a fresh instance, all guards fired and swallowed all feedback. The `finally { setState(_loading = false) }` was also swallowed.

---

## Fix — `apps/mobile/lib/core/router/app_router.dart`

Replaced the "recreate on every change" pattern with a single `GoRouter` instance that uses `refreshListenable` to re-evaluate the `redirect` function when auth state changes.

```dart
// AFTER (correct)
class _RouterRefreshNotifier extends ChangeNotifier {
  late final ProviderSubscription<AuthState> _authSub;
  late final ProviderSubscription<bool> _sessionSub;

  _RouterRefreshNotifier(Ref ref) {
    _authSub = ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
    _sessionSub = ref.listen<bool>(sessionExpiredProvider, (_, __) => notifyListeners());
  }

  @override
  void dispose() {
    _authSub.close();
    _sessionSub.close();
    super.dispose();
  }
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);

  final router = GoRouter(
    initialLocation: RouteNames.splash,
    refreshListenable: refreshNotifier,        // ← GoRouter re-runs redirect, does NOT recreate
    redirect: (context, state) {
      final authState = ref.read(authProvider);  // ← read, not watch
      final sessionExpired = ref.read(sessionExpiredProvider);
      ...
    },
    routes: [...],
  );

  ref.onDispose(() {
    refreshNotifier.dispose();
    router.dispose();
  });

  return router;
});
```

Key differences:
- `ref.watch` → `ref.read` inside the redirect callback (read current value, don't subscribe)
- `_RouterRefreshNotifier` subscribes to both `authProvider` and `sessionExpiredProvider` via `ref.listen`, fires `notifyListeners()` on any change
- GoRouter's `refreshListenable` re-evaluates `redirect` without recreating the router or resetting the navigation stack
- `ref.onDispose` properly cleans up both the notifier and the router

### Redirect rules (rewritten)

```dart
redirect: (context, state) {
  // Session expired always wins
  if (sessionExpired && loc != RouteNames.sessionExpired) {
    return RouteNames.sessionExpired;
  }

  // Still initializing — splash handles routing imperatively
  if (!authState.isInitialized) return null;

  // Not authenticated: allow public/device routes, block everything else
  if (!authState.isAuthenticated) {
    final isPublic = loc == RouteNames.splash ||
        loc.startsWith('/login') || loc.startsWith('/forgot') ||
        loc.startsWith('/reset') || loc.startsWith('/session') ||
        loc.startsWith('/device');
    if (!isPublic) return RouteNames.login;
  }

  return null;
},
```

Added the `sessionExpiredProvider` rule that was previously wired up in `AuthInterceptor` but never acted upon in routing.

---

## Fixed Auth Flow (post-fix)

### Login → AUTH_004 (device not registered)

1. `_submit()` calls `authProvider.notifier.login()`
2. `login()` sets `isLoading: true` → `_RouterRefreshNotifier.notifyListeners()` → redirect re-evaluated
3. Redirect: `isInitialized=true`, `!isAuthenticated`, `loc='/login'` → login is public → `null` → **no navigation**
4. `LoginScreen` stays mounted, `_loading=true` spinner visible
5. Backend returns AUTH_004 → `DeviceMismatchException` thrown
6. `login()` catch: `state = state.copyWith(isLoading: false)` → redirect re-eval → same result → no nav
7. `on DeviceMismatchException catch (e)` in `_submit()`: `mounted = true` → `context.go(deviceNotRegistered, extra: {'email': ...})` ✓
8. `DeviceNotRegisteredScreen` shown with email pre-filled

### Login → success

1–4. Same as above, `_loading=true`, `LoginScreen` stays mounted
5. Backend returns 200 → `AuthState(user: ..., isInitialized: true)` set
6. Redirect: `isAuthenticated=true`, `loc='/login'` → `null` (public) → no forced redirect
7. `_submit()` `if (!mounted)` → mounted → `context.go(home)` ✓

### Login → wrong password (AUTH_001)

1–4. Same
5. Backend returns AUTH_001 → `AuthException` thrown
6. `on AuthException catch (e)` in `_submit()`: `setState(() => _errorMessage = 'Invalid email or password.')` ✓

### Session expired (token refresh fails mid-session)

1. `AuthInterceptor.onSessionExpired()` → `sessionExpiredProvider.state = true`
2. `_RouterRefreshNotifier.notifyListeners()` → redirect fires: `sessionExpired=true`, `loc != '/session-expired'` → `return RouteNames.sessionExpired` ✓
3. User goes to session-expired screen; tapping "Sign In Again" clears storage + resets `sessionExpiredProvider` → redirect fires again → no longer expired → login screen

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mobile/lib/core/router/app_router.dart` | Added `_RouterRefreshNotifier`; replaced `ref.watch` + `GoRouter()` recreation pattern with `refreshListenable` singleton; rewrote redirect with session-expired + auth guard rules |

---

## Quality Gates

| Gate | Result |
|------|--------|
| `flutter analyze` | ✅ No issues |
| `flutter test` | ✅ 97/97 passed |

---

## End-to-End Verification Checklist

Run with: `flutter run --dart-define=API_BASE_URL=http://192.168.1.3:3000`

- [ ] **Wrong password**: error "Invalid email or password." shown inline, loading stops, form stays
- [ ] **No network**: error "No connection. Check your network." shown inline
- [ ] **AUTH_004 (no device)**: navigates to `DeviceNotRegisteredScreen` with email pre-filled
- [ ] **AUTH_005 (device mismatch)**: navigates to `DeviceMismatchScreen`
- [ ] **Correct credentials, device registered**: navigates to `HomeScreen`
- [ ] **Session expiry mid-session**: navigates to `SessionExpiredScreen` without user action
- [ ] **Password change required**: navigates to `ChangePasswordScreen` after login
- [ ] **Back from DeviceNotRegisteredScreen → Login**: form is blank, button is enabled
