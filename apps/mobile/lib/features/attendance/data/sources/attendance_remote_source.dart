import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/models/attendance.dart';

class AttendanceRemoteSource {
  final Dio _dio;
  AttendanceRemoteSource(this._dio);

  Future<TodayAttendance> getToday() async {
    final r = await _dio.get(ApiEndpoints.attendanceToday);
    final data = (r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
    return TodayAttendance.fromJson(data);
  }

  Future<TodayAttendance> checkIn({required double lat, required double lng, required double accuracy, required String nonce}) async {
    final r = await _dio.post(ApiEndpoints.checkIn, data: {
      'latitude': lat,
      'longitude': lng,
      'accuracy': accuracy,
      'nonce': nonce,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    });
    final data = (r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
    return TodayAttendance.fromJson(data);
  }

  Future<TodayAttendance> checkOut() async {
    final r = await _dio.post(ApiEndpoints.checkOut, data: {
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    });
    final data = (r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>;
    return TodayAttendance.fromJson(data);
  }

  Future<List<AttendanceRecord>> getHistory({String? startDate, String? endDate, int page = 1, int limit = 30}) async {
    final params = <String, dynamic>{'page': page, 'limit': limit};
    if (startDate != null) params['startDate'] = startDate;
    if (endDate != null) params['endDate'] = endDate;
    final r = await _dio.get(ApiEndpoints.attendanceEmployee('me'), queryParameters: params);
    final raw = (r.data as Map<String, dynamic>)['data'] as List<dynamic>;
    return raw.map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<MonthlySummary?> getMonthlySummary(String yearMonth) async {
    try {
      final r = await _dio.get('${ApiEndpoints.attendanceEmployee('me')}/summary', queryParameters: {'yearMonth': yearMonth});
      final data = (r.data as Map<String, dynamic>)['data'];
      if (data == null) return null;
      return MonthlySummary.fromJson(data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}
