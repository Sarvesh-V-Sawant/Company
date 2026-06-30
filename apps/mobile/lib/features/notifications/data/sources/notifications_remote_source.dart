import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/models/notification.dart';

class NotificationsRemoteSource {
  final Dio _dio;
  NotificationsRemoteSource(this._dio);

  Future<List<AppNotification>> getAll({int page = 1, int limit = 30}) async {
    final r = await _dio.get(ApiEndpoints.notifications, queryParameters: {'page': page, 'limit': limit});
    final data = (r.data as Map<String, dynamic>)['data'] as List<dynamic>;
    return data.map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markRead(String id) async {
    await _dio.patch(ApiEndpoints.notificationRead(id));
  }

  Future<void> markAllRead() async {
    await _dio.patch(ApiEndpoints.notificationsReadAll);
  }
}
