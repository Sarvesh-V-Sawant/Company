import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';
import '../constants/app_constants.dart';

Dio createDioClient() {
  return Dio(
    BaseOptions(
      baseUrl: ApiEndpoints.baseUrl,
      connectTimeout: const Duration(milliseconds: AppConstants.connectTimeoutMs),
      receiveTimeout: const Duration(milliseconds: AppConstants.receiveTimeoutMs),
      headers: {'Content-Type': 'application/json'},
    ),
  );
}
