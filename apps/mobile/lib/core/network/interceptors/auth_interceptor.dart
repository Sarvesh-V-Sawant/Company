import 'dart:async';
import 'package:dio/dio.dart';
import '../../constants/api_endpoints.dart';
import '../../constants/storage_keys.dart';
import '../../storage/secure_storage.dart';

typedef SessionExpiredCallback = void Function();

class AuthInterceptor extends Interceptor {
  final Dio _dio;
  SessionExpiredCallback? onSessionExpired;

  Completer<String?>? _refreshCompleter;

  AuthInterceptor(this._dio);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    // Skip auth header for auth endpoints that don't need it
    final skipAuth = [ApiEndpoints.login, ApiEndpoints.refresh, ApiEndpoints.forgotPassword, ApiEndpoints.resetPassword];
    if (skipAuth.any((path) => options.path.endsWith(path))) {
      handler.next(options);
      return;
    }

    final token = await SecureStorageService.read(StorageKeys.accessToken);
    final fingerprint = await SecureStorageService.read(StorageKeys.deviceHash);
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    if (fingerprint != null) {
      options.headers['X-Device-Fingerprint'] = fingerprint;
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) {
      handler.next(err);
      return;
    }

    // Avoid refresh loop on refresh endpoint itself
    if (err.requestOptions.path.endsWith(ApiEndpoints.refresh)) {
      onSessionExpired?.call();
      handler.next(err);
      return;
    }

    // Deduplicate concurrent refresh calls
    if (_refreshCompleter != null) {
      final newToken = await _refreshCompleter!.future;
      if (newToken != null) {
        handler.resolve(await _retry(err.requestOptions, newToken));
      } else {
        handler.next(err);
      }
      return;
    }

    _refreshCompleter = Completer<String?>();
    try {
      final refreshToken = await SecureStorageService.read(StorageKeys.refreshToken);
      final sessionId = await SecureStorageService.read(StorageKeys.sessionId);
      if (refreshToken == null || sessionId == null) {
        _refreshCompleter!.complete(null);
        onSessionExpired?.call();
        handler.next(err);
        return;
      }

      final response = await _dio.post(ApiEndpoints.refresh, data: {
        'refreshToken': refreshToken,
        'sessionId': sessionId,
      });
      final newAccessToken = response.data['data']['accessToken'] as String?;
      final newRefreshToken = response.data['data']['refreshToken'] as String?;

      if (newAccessToken == null) {
        _refreshCompleter!.complete(null);
        onSessionExpired?.call();
        handler.next(err);
        return;
      }

      await SecureStorageService.saveTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken ?? refreshToken,
      );
      _refreshCompleter!.complete(newAccessToken);
      handler.resolve(await _retry(err.requestOptions, newAccessToken));
    } catch (_) {
      _refreshCompleter!.complete(null);
      await SecureStorageService.clearSession();
      onSessionExpired?.call();
      handler.next(err);
    } finally {
      _refreshCompleter = null;
    }
  }

  Future<Response<dynamic>> _retry(RequestOptions requestOptions, String token) {
    final opts = Options(
      method: requestOptions.method,
      headers: {...requestOptions.headers, 'Authorization': 'Bearer $token'},
    );
    return _dio.request<dynamic>(
      requestOptions.path,
      data: requestOptions.data,
      queryParameters: requestOptions.queryParameters,
      options: opts,
    );
  }
}
