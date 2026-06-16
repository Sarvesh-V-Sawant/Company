class ApiEndpoints {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL');

  static const String login = '/auth/login';
  static const String logout = '/auth/logout';
  static const String refresh = '/auth/refresh';
  static const String me = '/auth/me';
  static const String changePassword = '/auth/me/password';
  static const String fcmToken = '/auth/me/fcm-token';

  static const String checkIn = '/attendance/checkin';
  static const String checkOut = '/attendance/checkout';
  static const String attendanceToday = '/attendance/today';

  static const String leaves = '/leaves';
  static const String leaveBalance = '/leaves/balance';

  static const String regularizations = '/regularizations';

  static const String notifications = '/notifications';

  static const String payrollMe = '/payroll/me';
}
