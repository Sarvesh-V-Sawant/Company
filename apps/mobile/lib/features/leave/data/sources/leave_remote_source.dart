import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/models/leave.dart';

class LeaveRemoteSource {
  final Dio _dio;
  LeaveRemoteSource(this._dio);

  Future<List<LeaveBalance>> getBalance() async {
    final r = await _dio.get(ApiEndpoints.leaveBalance);
    final data = (r.data as Map<String, dynamic>)['data'] as List<dynamic>;
    return data.map((e) => LeaveBalance.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<LeaveRequest>> getHistory({String? status, int page = 1, int limit = 20}) async {
    final r = await _dio.get(ApiEndpoints.leaves, queryParameters: {'page': page, 'limit': limit, if (status != null) 'status': status});
    final data = (r.data as Map<String, dynamic>)['data'] as List<dynamic>;
    return data.map((e) => LeaveRequest.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<LeaveRequest> getById(String id) async {
    final r = await _dio.get(ApiEndpoints.leaveById(id));
    return LeaveRequest.fromJson((r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<LeaveRequest> apply({required String leaveType, required String startDate, required String endDate, required String reason}) async {
    final r = await _dio.post(ApiEndpoints.leaves, data: {'leaveType': leaveType, 'startDate': startDate, 'endDate': endDate, 'reason': reason});
    return LeaveRequest.fromJson((r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }

  Future<void> cancel(String id) async {
    await _dio.patch(ApiEndpoints.leaveCancel(id));
  }
}
