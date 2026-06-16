import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

// Attaches X-Idempotency-Key to POST/PATCH/DELETE requests
class IdempotencyInterceptor extends Interceptor {
  final _uuid = const Uuid();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (['POST', 'PATCH', 'DELETE'].contains(options.method.toUpperCase())) {
      options.headers['X-Idempotency-Key'] = _uuid.v4();
    }
    handler.next(options);
  }
}
