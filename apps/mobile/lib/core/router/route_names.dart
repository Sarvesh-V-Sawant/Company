class RouteNames {
  // Auth
  static const String splash = '/';
  static const String login = '/login';
  static const String forgotPassword = '/forgot-password';
  static const String resetPassword = '/reset-password';
  static const String changePassword = '/change-password';
  static const String sessionExpired = '/session-expired';

  // Device
  static const String deviceNotRegistered = '/device-not-registered';
  static const String deviceAwaitingRegistration = '/device-awaiting-registration';
  static const String deviceMismatch = '/device-mismatch';
  static const String deviceResetRequired = '/device-reset-required';

  // Main shell (bottom nav)
  static const String home = '/home';
  static const String attendance = '/attendance';
  static const String attendanceWeek = '/attendance/week';
  static const String attendanceHistory = '/attendance/history';
  static String attendanceDay(String date) => '/attendance/day/$date';

  static const String leave = '/leave';
  static const String leaveBalance = '/leave/balance';
  static const String leaveHistory = '/leave/history';
  static const String leaveApply = '/leave/apply';
  static String leaveDetail(String id) => '/leave/$id';

  static const String regularization = '/regularization';
  static const String regularizationCreate = '/regularization/create';
  static const String regularizationHistory = '/regularization/history';
  static String regularizationDetail(String id) => '/regularization/$id';

  static const String notifications = '/notifications';
  static String notificationDetail(String id) => '/notifications/$id';
  static const String notificationPermission = '/notification-permission';

  static const String profile = '/profile';
  static const String profileChangePassword = '/profile/change-password';
  static const String profileDevice = '/profile/device';

  static const String payslip = '/payslip';
  static String payslipDetail(String yearMonth) => '/payslip/$yearMonth';
}
