class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String body;
  final bool isRead;
  final String type;
  final String? referenceId;
  final String createdAt;

  const AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    required this.isRead,
    required this.type,
    this.referenceId,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['_id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      isRead: json['isRead'] as bool? ?? false,
      type: json['type'] as String? ?? '',
      referenceId: json['referenceId'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

class CompanySettings {
  final int requiredDailyMinutes;
  final int gracePeriodMinutes;
  final bool geofenceEnabled;
  final double? officeLat;
  final double? officeLng;
  final int? geofenceRadiusMeters;
  final List<String> workingDays;
  final int regularizationLookbackDays;

  const CompanySettings({
    required this.requiredDailyMinutes,
    required this.gracePeriodMinutes,
    required this.geofenceEnabled,
    this.officeLat,
    this.officeLng,
    this.geofenceRadiusMeters,
    required this.workingDays,
    required this.regularizationLookbackDays,
  });

  factory CompanySettings.fromJson(Map<String, dynamic> json) {
    final shift = json['shift'] as Map<String, dynamic>?;
    final geofence = json['geofence'] as Map<String, dynamic>?;

    int requiredMinutes = 540; // 9h default
    if (shift != null) {
      final start = shift['startTime'] as String?;
      final end = shift['endTime'] as String?;
      if (start != null && end != null) {
        try {
          final s = start.split(':');
          final e = end.split(':');
          final startMin = int.parse(s[0]) * 60 + int.parse(s[1]);
          final endMin = int.parse(e[0]) * 60 + int.parse(e[1]);
          requiredMinutes = endMin - startMin;
        } catch (_) {}
      }
    }

    return CompanySettings(
      requiredDailyMinutes: requiredMinutes,
      gracePeriodMinutes: shift?['gracePeriodMinutes'] as int? ?? 15,
      geofenceEnabled: geofence?['enabled'] as bool? ?? false,
      officeLat: (geofence?['lat'] as num?)?.toDouble(),
      officeLng: (geofence?['lng'] as num?)?.toDouble(),
      geofenceRadiusMeters: geofence?['radiusMeters'] as int?,
      workingDays: (json['workingDays'] as List<dynamic>?)?.map((e) => e as String).toList() ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      regularizationLookbackDays: json['regularizationLookbackDays'] as int? ?? 7,
    );
  }

  static CompanySettings get defaults => const CompanySettings(
    requiredDailyMinutes: 540,
    gracePeriodMinutes: 15,
    geofenceEnabled: false,
    workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    regularizationLookbackDays: 7,
  );
}
