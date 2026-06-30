import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/models/user.dart';

class AuthRemoteSource {
  final Dio _dio;
  AuthRemoteSource(this._dio);

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String deviceFingerprint,
  }) async {
    // PHASE 15.18 DIAGNOSTIC
    // ignore: avoid_print
    print('[DIAG][SRC] login() called  email=${email.substring(0, email.indexOf('@'))}@***  fp=${deviceFingerprint.substring(0, 8)}...');
    // ignore: avoid_print
    print('[DIAG][SRC] baseUrl resolves to: ${_dio.options.baseUrl}');
    // ignore: avoid_print
    print('[DIAG][SRC] full URL: ${_dio.options.baseUrl}${ApiEndpoints.login}');
    try {
      final response = await _dio.post(ApiEndpoints.login, data: {
        'email': email,
        'password': password,
        'deviceFingerprint': deviceFingerprint,
      });
      // ignore: avoid_print
      print('[DIAG][SRC] login() response status=${response.statusCode}');
      return response.data as Map<String, dynamic>;
    } catch (e, stack) {
      // ignore: avoid_print
      print('[DIAG][SRC] login() threw: ${e.runtimeType} $e');
      // ignore: avoid_print
      print('[DIAG][SRC] login() stack:\n$stack');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> refresh(String refreshToken, String sessionId) async {
    final response = await _dio.post(ApiEndpoints.refresh, data: {
      'refreshToken': refreshToken,
      'sessionId': sessionId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> logout(String sessionId) async {
    try {
      await _dio.post(ApiEndpoints.logout, data: {'sessionId': sessionId});
    } catch (_) {
      // Best-effort — clear local regardless
    }
  }

  Future<User> getMe() async {
    final response = await _dio.get(ApiEndpoints.me);
    final data = response.data as Map<String, dynamic>;
    return User.fromJson(data['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await _dio.patch(ApiEndpoints.changePassword, data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> forgotPassword(String email) async {
    // PHASE 15.19 DIAGNOSTIC
    // ignore: avoid_print
    print('[DIAG][FP-SRC] forgotPassword() called  email=${email.substring(0, email.indexOf('@'))}@***');
    // ignore: avoid_print
    print('[DIAG][FP-SRC] POST ${_dio.options.baseUrl}${ApiEndpoints.forgotPassword}');
    try {
      final response = await _dio.post(ApiEndpoints.forgotPassword, data: {'email': email});
      // ignore: avoid_print
      print('[DIAG][FP-SRC] forgotPassword() response status=${response.statusCode}  body=${response.data}');
    } catch (e, stack) {
      // ignore: avoid_print
      print('[DIAG][FP-SRC] forgotPassword() threw: ${e.runtimeType} $e');
      // ignore: avoid_print
      print('[DIAG][FP-SRC] stack:\n$stack');
      rethrow;
    }
  }

  Future<void> resetPassword({
    required String token,
    required String email,
    required String newPassword,
  }) async {
    await _dio.post(ApiEndpoints.resetPassword, data: {
      'token': token,
      'email': email,
      'newPassword': newPassword,
    });
  }

  Future<void> updateFcmToken(String fcmToken) async {
    await _dio.patch(ApiEndpoints.fcmToken, data: {'fcmToken': fcmToken});
  }

  Future<Map<String, dynamic>> submitDeviceRequest(Map<String, dynamic> body) async {
    final response = await _dio.post(ApiEndpoints.deviceRequest, data: body);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> checkDeviceRequestStatus({
    required String email,
    required String deviceFingerprint,
  }) async {
    final response = await _dio.get(
      ApiEndpoints.deviceRequestStatus,
      queryParameters: {'email': email, 'deviceFingerprint': deviceFingerprint},
    );
    return response.data as Map<String, dynamic>;
  }
}
