import 'package:dio/dio.dart';

/// Maps network/server exceptions to user-friendly messages.
/// Never exposes raw exception text, URLs, or tokens.
class ErrorMessageMapper {
  ErrorMessageMapper._();

  static String from(Object error) {
    if (error is DioException) return _fromDio(error);
    return 'Something went wrong. Please try again.';
  }

  static String _fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return 'Unable to connect. Please check your internet connection and try again.';
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Request timed out. Please try again.';
      case DioExceptionType.badResponse:
        return _fromStatus(e.response?.statusCode);
      case DioExceptionType.cancel:
        return 'Request cancelled. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  static String _fromStatus(int? code) {
    if (code == null) return 'Something went wrong. Please try again.';
    if (code == 401) return 'Your session expired. Please log in again.';
    if (code == 403) return 'You do not have permission to view this.';
    if (code == 404) return 'This information could not be found.';
    if (code == 422) return 'Please check the entered information.';
    if (code >= 500) return 'Server error. Please try again later.';
    return 'Something went wrong. Please try again.';
  }
}
