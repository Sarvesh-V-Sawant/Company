import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/models/payroll.dart';

class PayrollRemoteSource {
  final Dio _dio;
  PayrollRemoteSource(this._dio);

  Future<List<PayslipRecord>> getMyPayslips({int page = 1, int limit = 12}) async {
    final r = await _dio.get(ApiEndpoints.payrollMe, queryParameters: {'page': page, 'limit': limit});
    final data = (r.data as Map<String, dynamic>)['data'] as List<dynamic>;
    return data.map((e) => PayslipRecord.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PayslipRecord> getById(String id) async {
    final r = await _dio.get(ApiEndpoints.payslipById(id));
    return PayslipRecord.fromJson((r.data as Map<String, dynamic>)['data'] as Map<String, dynamic>);
  }
}
