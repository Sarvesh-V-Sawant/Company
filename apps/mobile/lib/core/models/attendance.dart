class AttendanceSession {
  final String? checkIn;
  final String? checkOut;
  final int? durationMinutes;

  const AttendanceSession({this.checkIn, this.checkOut, this.durationMinutes});

  factory AttendanceSession.fromJson(Map<String, dynamic> json) {
    return AttendanceSession(
      checkIn: json['checkIn'] as String?,
      checkOut: json['checkOut'] as String?,
      durationMinutes: json['durationMinutes'] as int?,
    );
  }
}

class TodayAttendance {
  final String date;
  final String status;
  final bool isCheckedIn;
  final String? currentSessionStart;
  final List<AttendanceSession> sessions;
  final int totalMinutesToday;

  const TodayAttendance({
    required this.date,
    required this.status,
    required this.isCheckedIn,
    this.currentSessionStart,
    required this.sessions,
    required this.totalMinutesToday,
  });

  factory TodayAttendance.fromJson(Map<String, dynamic> json) {
    return TodayAttendance(
      date: json['date'] as String? ?? '',
      status: json['status'] as String? ?? 'absent',
      isCheckedIn: json['isCheckedIn'] as bool? ?? false,
      currentSessionStart: json['currentSessionStart'] as String?,
      sessions: (json['sessions'] as List<dynamic>?)
              ?.map((e) => AttendanceSession.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      totalMinutesToday: json['totalMinutesToday'] as int? ?? 0,
    );
  }
}

class AttendanceRecord {
  final String id;
  final String employeeId;
  final String date;
  final String status;
  final String? checkIn;
  final String? checkOut;
  final double? workHours;
  final bool isRegularized;
  final List<AttendanceSession> sessions;

  const AttendanceRecord({
    required this.id,
    required this.employeeId,
    required this.date,
    required this.status,
    this.checkIn,
    this.checkOut,
    this.workHours,
    required this.isRegularized,
    this.sessions = const [],
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['_id'] as String? ?? '',
      employeeId: _extractId(json['employeeId']),
      date: json['date'] as String? ?? '',
      status: json['status'] as String? ?? 'absent',
      checkIn: json['checkIn'] as String?,
      checkOut: json['checkOut'] as String?,
      workHours: (json['workHours'] as num?)?.toDouble(),
      isRegularized: json['isRegularized'] as bool? ?? false,
      sessions: (json['sessions'] as List<dynamic>?)
              ?.map((e) => AttendanceSession.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  static String _extractId(dynamic value) {
    if (value is String) return value;
    if (value is Map) return value['_id'] as String? ?? '';
    return '';
  }
}

class MonthlySummary {
  final int presentDays;
  final int absentDays;
  final int leaveDays;
  final int halfDays;
  final int holidayDays;
  final int weekendDays;
  final double totalHours;

  const MonthlySummary({
    required this.presentDays,
    required this.absentDays,
    required this.leaveDays,
    required this.halfDays,
    required this.holidayDays,
    required this.weekendDays,
    required this.totalHours,
  });

  factory MonthlySummary.fromJson(Map<String, dynamic> json) {
    return MonthlySummary(
      presentDays: json['presentDays'] as int? ?? 0,
      absentDays: json['absentDays'] as int? ?? 0,
      leaveDays: json['leaveDays'] as int? ?? 0,
      halfDays: json['halfDays'] as int? ?? 0,
      holidayDays: json['holidayDays'] as int? ?? 0,
      weekendDays: json['weekendDays'] as int? ?? 0,
      totalHours: (json['totalHours'] as num?)?.toDouble() ?? 0.0,
    );
  }
}
