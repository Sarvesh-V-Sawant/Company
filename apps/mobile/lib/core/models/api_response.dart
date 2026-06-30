class ApiResponse<T> {
  final bool success;
  final T? data;
  final ApiError? error;

  const ApiResponse({required this.success, this.data, this.error});

  factory ApiResponse.fromJson(Map<String, dynamic> json, T Function(dynamic) fromData) {
    return ApiResponse(
      success: json['success'] as bool? ?? false,
      data: json['data'] != null ? fromData(json['data']) : null,
      error: json['error'] != null ? ApiError.fromJson(json['error'] as Map<String, dynamic>) : null,
    );
  }

  bool get isSuccess => success && error == null;
}

class ApiError {
  final String code;
  final String message;

  const ApiError({required this.code, required this.message});

  factory ApiError.fromJson(Map<String, dynamic> json) {
    return ApiError(
      code: json['code'] as String? ?? 'UNKNOWN',
      message: json['message'] as String? ?? 'An error occurred',
    );
  }
}

class PaginatedResponse<T> {
  final bool success;
  final List<T> data;
  final Pagination pagination;

  const PaginatedResponse({required this.success, required this.data, required this.pagination});

  factory PaginatedResponse.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) fromItem) {
    return PaginatedResponse(
      success: json['success'] as bool? ?? false,
      data: (json['data'] as List<dynamic>?)?.map((e) => fromItem(e as Map<String, dynamic>)).toList() ?? [],
      pagination: Pagination.fromJson(json['pagination'] as Map<String, dynamic>? ?? {}),
    );
  }
}

class Pagination {
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const Pagination({required this.page, required this.limit, required this.total, required this.totalPages});

  factory Pagination.fromJson(Map<String, dynamic> json) {
    return Pagination(
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
      totalPages: json['totalPages'] as int? ?? 0,
    );
  }
}
