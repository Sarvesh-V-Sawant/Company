import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';

class LocationSnapshotSource {
  final Dio _dio;
  LocationSnapshotSource(this._dio);

  /// Posts a location snapshot for the current active remote session.
  /// Throws on network error; caller should swallow silently.
  Future<void> post({
    required double latitude,
    required double longitude,
    required double accuracy,
  }) async {
    await _dio.post(ApiEndpoints.locationSnapshot, data: {
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
    });
  }
}
