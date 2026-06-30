import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/di/providers.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/auth/presentation/screens/change_password_screen.dart';
import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/reset_password_screen.dart';
import '../../features/auth/presentation/screens/session_expired_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/attendance/presentation/screens/attendance_history_screen.dart';
import '../../features/attendance/presentation/screens/daily_detail_screen.dart';
import '../../features/attendance/presentation/screens/weekly_attendance_screen.dart';
import '../../features/device_registration/presentation/screens/device_awaiting_registration_screen.dart';
import '../../features/device_registration/presentation/screens/device_mismatch_screen.dart';
import '../../features/device_registration/presentation/screens/device_not_registered_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/leave/presentation/screens/leave_apply_screen.dart';
import '../../features/leave/presentation/screens/leave_balance_screen.dart';
import '../../features/leave/presentation/screens/leave_detail_screen.dart';
import '../../features/notifications/presentation/screens/notification_detail_screen.dart';
import '../../features/notifications/presentation/screens/notification_permission_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/payroll/presentation/screens/payslip_detail_screen.dart';
import '../../features/payroll/presentation/screens/payslip_list_screen.dart';
import '../../features/profile/presentation/screens/device_info_screen.dart';
import '../../features/profile/presentation/screens/profile_change_password_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/regularization/presentation/screens/regularization_create_screen.dart';
import '../../features/regularization/presentation/screens/regularization_detail_screen.dart';
import '../../features/regularization/presentation/screens/regularization_screen.dart';
import '../../shared/widgets/main_shell.dart';
import 'route_names.dart';

// Bridges Riverpod auth/session state into GoRouter's refreshListenable so the
// router re-evaluates its redirect on auth changes without being recreated.
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
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final sessionExpired = ref.read(sessionExpiredProvider);
      final loc = state.uri.toString();

      // Session expired always wins — redirect from anywhere except the screen itself
      if (sessionExpired && loc != RouteNames.sessionExpired) {
        return RouteNames.sessionExpired;
      }

      // Not yet initialized — splash handles routing imperatively
      if (!authState.isInitialized) return null;

      // Not authenticated: allow public and device routes; push everything else to login
      if (!authState.isAuthenticated) {
        final isPublic = loc == RouteNames.splash ||
            loc.startsWith('/login') ||
            loc.startsWith('/forgot') ||
            loc.startsWith('/reset') ||
            loc.startsWith('/session') ||
            loc.startsWith('/device');
        if (!isPublic) return RouteNames.login;
      }

      return null;
    },
    routes: [
      // Splash
      GoRoute(path: RouteNames.splash, builder: (_, __) => const SplashScreen()),

      // Auth routes
      GoRoute(path: RouteNames.login, builder: (_, __) => const LoginScreen()),
      GoRoute(path: RouteNames.forgotPassword, builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(path: '/reset-password', builder: (_, state) => ResetPasswordScreen(
        token: state.uri.queryParameters['token'] ?? '',
        email: state.uri.queryParameters['email'] ?? '',
      )),
      GoRoute(path: RouteNames.changePassword, builder: (_, __) => const ChangePasswordScreen()),
      GoRoute(path: RouteNames.sessionExpired, builder: (_, __) => const SessionExpiredScreen()),
      GoRoute(path: RouteNames.notificationPermission, builder: (_, __) => const NotificationPermissionScreen()),

      // Device routes
      GoRoute(path: RouteNames.deviceNotRegistered, builder: (_, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return DeviceNotRegisteredScreen(email: extra?['email'] as String?);
      }),
      GoRoute(path: RouteNames.deviceAwaitingRegistration, builder: (_, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return DeviceAwaitingRegistrationScreen(email: extra?['email'] as String?);
      }),
      GoRoute(path: RouteNames.deviceMismatch, builder: (_, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return DeviceMismatchScreen(email: extra?['email'] as String?);
      }),
      GoRoute(path: RouteNames.deviceResetRequired, builder: (_, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return DeviceMismatchScreen(isReset: true, email: extra?['email'] as String?);
      }),

      // Main shell with bottom nav
      ShellRoute(
        builder: (_, __, child) => MainShell(child: child),
        routes: [
          GoRoute(path: RouteNames.home, builder: (_, __) => const HomeScreen()),

          // Attendance
          GoRoute(path: RouteNames.attendanceWeek, builder: (_, __) => const WeeklyAttendanceScreen()),
          GoRoute(path: RouteNames.attendanceHistory, builder: (_, __) => const AttendanceHistoryScreen()),
          GoRoute(path: '/attendance/day/:date', builder: (_, state) => DailyDetailScreen(dateStr: state.pathParameters['date'] ?? '')),
          GoRoute(path: RouteNames.attendance, redirect: (_, __) => RouteNames.attendanceWeek),

          // Leave
          GoRoute(path: RouteNames.leave, builder: (_, __) => const LeaveScreen()),
          GoRoute(path: RouteNames.leaveApply, builder: (_, __) => const LeaveApplyScreen()),
          GoRoute(path: '/leave/:id', builder: (_, state) => LeaveDetailScreen(id: state.pathParameters['id'] ?? '')),

          // Notifications
          GoRoute(path: RouteNames.notifications, builder: (_, __) => const NotificationsScreen()),
          GoRoute(path: '/notifications/:id', builder: (_, state) => NotificationDetailScreen(id: state.pathParameters['id'] ?? '')),

          // Profile
          GoRoute(path: RouteNames.profile, builder: (_, __) => const ProfileScreen()),
          GoRoute(path: RouteNames.profileChangePassword, builder: (_, __) => const ProfileChangePasswordScreen()),
          GoRoute(path: RouteNames.profileDevice, builder: (_, __) => const DeviceInfoScreen()),
        ],
      ),

      // Regularization (outside shell — no bottom nav)
      GoRoute(path: RouteNames.regularization, builder: (_, __) => const RegularizationScreen()),
      GoRoute(path: RouteNames.regularizationCreate, builder: (_, state) => RegularizationCreateScreen(initialDate: state.uri.queryParameters['date'])),
      GoRoute(path: '/regularization/:id', builder: (_, state) => RegularizationDetailScreen(id: state.pathParameters['id'] ?? '')),

      // Payslips (outside shell)
      GoRoute(path: RouteNames.payslip, builder: (_, __) => const PayslipListScreen()),
      GoRoute(path: '/payslip/:id', builder: (_, state) => PayslipDetailScreen(id: state.pathParameters['id'] ?? '')),
    ],
  );

  ref.onDispose(() {
    refreshNotifier.dispose();
    router.dispose();
  });

  return router;
});
