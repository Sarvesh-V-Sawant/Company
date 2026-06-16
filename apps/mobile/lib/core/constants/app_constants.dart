class AppConstants {
  static const String environment = String.fromEnvironment('ENVIRONMENT', defaultValue: 'production');
  static const int connectTimeoutMs = 15000;
  static const int receiveTimeoutMs = 15000;
  static const int idempotencyKeyTtlSeconds = 86400;
}
