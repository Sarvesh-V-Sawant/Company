class PayslipRecord {
  final String id;
  final String employeeId;
  final String yearMonth;
  final String status;
  final int workingDays;
  final double presentDays;
  final double absentDays;
  final double leaveDays;
  final double halfDays;
  final double lopDays;
  final double grossSalary;
  final double netSalary;
  final double deductions;
  final Map<String, double> earnings;
  final Map<String, double> deductionBreakdown;
  final String createdAt;

  const PayslipRecord({
    required this.id,
    required this.employeeId,
    required this.yearMonth,
    required this.status,
    required this.workingDays,
    required this.presentDays,
    required this.absentDays,
    required this.leaveDays,
    required this.halfDays,
    required this.lopDays,
    required this.grossSalary,
    required this.netSalary,
    required this.deductions,
    required this.earnings,
    required this.deductionBreakdown,
    required this.createdAt,
  });

  double get payableDays => presentDays + leaveDays + (halfDays / 2);

  factory PayslipRecord.fromJson(Map<String, dynamic> json) {
    return PayslipRecord(
      id: json['_id'] as String? ?? '',
      employeeId: _extractId(json['employeeId']),
      yearMonth: json['yearMonth'] as String? ?? '',
      status: json['status'] as String? ?? 'draft',
      workingDays: json['workingDays'] as int? ?? 0,
      presentDays: (json['presentDays'] as num?)?.toDouble() ?? 0,
      absentDays: (json['absentDays'] as num?)?.toDouble() ?? 0,
      leaveDays: (json['leaveDays'] as num?)?.toDouble() ?? 0,
      halfDays: (json['halfDays'] as num?)?.toDouble() ?? 0,
      lopDays: (json['lopDays'] as num?)?.toDouble() ?? 0,
      grossSalary: (json['grossSalary'] as num?)?.toDouble() ?? 0,
      netSalary: (json['netSalary'] as num?)?.toDouble() ?? 0,
      deductions: (json['deductions'] as num?)?.toDouble() ?? 0,
      earnings: _toDoubleMap(json['earnings']),
      deductionBreakdown: _toDoubleMap(json['deductionBreakdown']),
      createdAt: json['createdAt'] as String? ?? '',
    );
  }

  static String _extractId(dynamic value) {
    if (value is String) return value;
    if (value is Map) return value['_id'] as String? ?? '';
    return '';
  }

  static Map<String, double> _toDoubleMap(dynamic value) {
    if (value is! Map) return {};
    return Map<String, double>.fromEntries(
      value.entries.map((e) => MapEntry(e.key as String, (e.value as num?)?.toDouble() ?? 0)),
    );
  }
}
