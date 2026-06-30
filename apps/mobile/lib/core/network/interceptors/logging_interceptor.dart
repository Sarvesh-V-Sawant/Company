// PHASE 15.18 DIAGNOSTIC — remove after runtime trace captured
import 'package:dio/dio.dart';

class LoggingInterceptor extends Interceptor {
  static Map<String, dynamic> _maskBody(dynamic data) {
    if (data is Map<String, dynamic>) {
      return Map.fromEntries(data.entries.map((e) {
        final v = (e.key == 'password' || e.key == 'currentPassword' || e.key == 'newPassword')
            ? '***MASKED***'
            : e.value;
        return MapEntry(e.key, v);
      }));
    }
    return {'raw': data.toString()};
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // ignore: avoid_print
    print('[DIAG][REQ] ▶ ${options.method} ${options.baseUrl}${options.path}');
    // ignore: avoid_print
    print('[DIAG][REQ]   baseUrl   = ${options.baseUrl}');
    // ignore: avoid_print
    print('[DIAG][REQ]   path      = ${options.path}');
    // ignore: avoid_print
    print('[DIAG][REQ]   headers   = ${options.headers.keys.toList()}');
    // ignore: avoid_print
    print('[DIAG][REQ]   payload   = ${_maskBody(options.data)}');
    // ignore: avoid_print
    print('[DIAG][REQ]   connect   = ${options.connectTimeout?.inMilliseconds}ms  receive = ${options.receiveTimeout?.inMilliseconds}ms');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    // ignore: avoid_print
    print('[DIAG][RES] ◀ HTTP ${response.statusCode} ${response.requestOptions.path}');
    // ignore: avoid_print
    print('[DIAG][RES]   body = ${response.data}');
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // ignore: avoid_print
    print('[DIAG][ERR] ✖ ${err.type} on ${err.requestOptions.path}');
    // ignore: avoid_print
    print('[DIAG][ERR]   message  = ${err.message}');
    // ignore: avoid_print
    print('[DIAG][ERR]   status   = ${err.response?.statusCode}');
    // ignore: avoid_print
    print('[DIAG][ERR]   body     = ${err.response?.data}');
    // ignore: avoid_print
    print('[DIAG][ERR]   error    = ${err.error}');
    // ignore: avoid_print
    print('[DIAG][ERR]   stack    =\n${err.stackTrace}');
    handler.next(err);
  }
}
