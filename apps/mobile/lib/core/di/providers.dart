import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../network/interceptors/auth_interceptor.dart';
import '../network/interceptors/idempotency_interceptor.dart';
import '../network/interceptors/logging_interceptor.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = createDioClient();
  dio.interceptors.addAll([
    AuthInterceptor(),
    IdempotencyInterceptor(),
    LoggingInterceptor(),
  ]);
  return dio;
});
