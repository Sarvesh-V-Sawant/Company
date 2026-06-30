// PHASE 15.18 DIAGNOSTIC — remove after runtime trace captured
import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';
import '../constants/app_constants.dart';

Dio createDioClient() {
  // ignore: avoid_print
  print('[DIAG][DIO] createDioClient() baseUrl = ${ApiEndpoints.baseUrl}');
  // ignore: avoid_print
  print('[DIAG][DIO] connectTimeout = ${AppConstants.connectTimeoutMs}ms  receiveTimeout = ${AppConstants.receiveTimeoutMs}ms');
  return Dio(
    BaseOptions(
      baseUrl: ApiEndpoints.baseUrl,
      connectTimeout: const Duration(milliseconds: AppConstants.connectTimeoutMs),
      receiveTimeout: const Duration(milliseconds: AppConstants.receiveTimeoutMs),
      headers: {'Content-Type': 'application/json'},
    ),
  );
}
