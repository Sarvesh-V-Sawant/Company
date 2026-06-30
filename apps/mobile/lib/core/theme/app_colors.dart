import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFF2563EB);
  static const Color error = Color(0xFFDC2626);
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);
  static const Color surface = Color(0xFFF9FAFB);
  static const Color background = Color(0xFFF3F4F6);

  static const Color present = Color(0xFF16A34A);
  static const Color absent = Color(0xFFDC2626);
  static const Color leave = Color(0xFF2563EB);
  static const Color halfDay = Color(0xFFD97706);
  static const Color holiday = Color(0xFF7C3AED);
  static const Color weekend = Color(0xFF6B7280);
  static const Color pending = Color(0xFFD97706);
  static const Color approved = Color(0xFF16A34A);
  static const Color rejected = Color(0xFFDC2626);
}

@immutable
class AppSemanticColors extends ThemeExtension<AppSemanticColors> {
  const AppSemanticColors({
    required this.colorPresent,
    required this.colorAbsent,
    required this.colorLeave,
    required this.colorHalfDay,
    required this.colorHoliday,
    required this.colorWeekend,
    required this.colorPending,
    required this.colorApproved,
    required this.colorRejected,
    required this.colorWarning,
    required this.colorSurface,
  });

  final Color colorPresent;
  final Color colorAbsent;
  final Color colorLeave;
  final Color colorHalfDay;
  final Color colorHoliday;
  final Color colorWeekend;
  final Color colorPending;
  final Color colorApproved;
  final Color colorRejected;
  final Color colorWarning;
  final Color colorSurface;

  static const AppSemanticColors light = AppSemanticColors(
    colorPresent: AppColors.present,
    colorAbsent: AppColors.absent,
    colorLeave: AppColors.leave,
    colorHalfDay: AppColors.halfDay,
    colorHoliday: AppColors.holiday,
    colorWeekend: AppColors.weekend,
    colorPending: AppColors.pending,
    colorApproved: AppColors.approved,
    colorRejected: AppColors.rejected,
    colorWarning: AppColors.warning,
    colorSurface: AppColors.surface,
  );

  @override
  AppSemanticColors copyWith({
    Color? colorPresent,
    Color? colorAbsent,
    Color? colorLeave,
    Color? colorHalfDay,
    Color? colorHoliday,
    Color? colorWeekend,
    Color? colorPending,
    Color? colorApproved,
    Color? colorRejected,
    Color? colorWarning,
    Color? colorSurface,
  }) {
    return AppSemanticColors(
      colorPresent: colorPresent ?? this.colorPresent,
      colorAbsent: colorAbsent ?? this.colorAbsent,
      colorLeave: colorLeave ?? this.colorLeave,
      colorHalfDay: colorHalfDay ?? this.colorHalfDay,
      colorHoliday: colorHoliday ?? this.colorHoliday,
      colorWeekend: colorWeekend ?? this.colorWeekend,
      colorPending: colorPending ?? this.colorPending,
      colorApproved: colorApproved ?? this.colorApproved,
      colorRejected: colorRejected ?? this.colorRejected,
      colorWarning: colorWarning ?? this.colorWarning,
      colorSurface: colorSurface ?? this.colorSurface,
    );
  }

  @override
  AppSemanticColors lerp(AppSemanticColors? other, double t) {
    if (other is! AppSemanticColors) return this;
    return AppSemanticColors(
      colorPresent: Color.lerp(colorPresent, other.colorPresent, t)!,
      colorAbsent: Color.lerp(colorAbsent, other.colorAbsent, t)!,
      colorLeave: Color.lerp(colorLeave, other.colorLeave, t)!,
      colorHalfDay: Color.lerp(colorHalfDay, other.colorHalfDay, t)!,
      colorHoliday: Color.lerp(colorHoliday, other.colorHoliday, t)!,
      colorWeekend: Color.lerp(colorWeekend, other.colorWeekend, t)!,
      colorPending: Color.lerp(colorPending, other.colorPending, t)!,
      colorApproved: Color.lerp(colorApproved, other.colorApproved, t)!,
      colorRejected: Color.lerp(colorRejected, other.colorRejected, t)!,
      colorWarning: Color.lerp(colorWarning, other.colorWarning, t)!,
      colorSurface: Color.lerp(colorSurface, other.colorSurface, t)!,
    );
  }
}
