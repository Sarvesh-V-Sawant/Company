import 'dart:async';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Schedules app-lifecycle-based local notifications for shift start/end reminders.
/// Reminders fire as Timers while the app is in foreground or background (not killed).
/// Timers are cancelled and rescheduled on each attendance state change.
class ShiftReminderService {
  static final _notifications = FlutterLocalNotificationsPlugin();

  static const _channelId = 'high_importance_channel';
  static const _checkinNotifId = 1001;
  static const _checkoutNotifId = 1002;

  static const _notifDetails = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      'High Importance Notifications',
      importance: Importance.high,
      priority: Priority.high,
    ),
  );

  Timer? _checkinTimer;
  Timer? _checkoutTimer;

  /// Schedule a check-in reminder [minutesBefore] minutes before [shiftStartHH]:[shiftStartMM].
  /// No-ops if that time has already passed today.
  void scheduleCheckinReminder({
    required int shiftStartHH,
    required int shiftStartMM,
    int minutesBefore = 15,
  }) {
    _checkinTimer?.cancel();
    final now = DateTime.now();
    final target = DateTime(now.year, now.month, now.day, shiftStartHH, shiftStartMM)
        .subtract(Duration(minutes: minutesBefore));
    final delay = target.difference(now);
    if (delay.isNegative) return;
    _checkinTimer = Timer(delay, () async {
      try {
        await _show(_checkinNotifId, 'Attendance Reminder', "Don't forget to check in.");
      } catch (_) {}
    });
  }

  /// Schedule a check-out reminder at [shiftEndHH]:[shiftEndMM] today.
  /// No-ops if shift end has already passed.
  void scheduleCheckoutReminder({
    required int shiftEndHH,
    required int shiftEndMM,
  }) {
    _checkoutTimer?.cancel();
    final now = DateTime.now();
    final target = DateTime(now.year, now.month, now.day, shiftEndHH, shiftEndMM);
    final delay = target.difference(now);
    if (delay.isNegative) return;
    _checkoutTimer = Timer(delay, () async {
      try {
        await _show(_checkoutNotifId, 'Attendance Reminder', "Don't forget to check out.");
      } catch (_) {}
    });
  }

  void cancelCheckinReminder() {
    _checkinTimer?.cancel();
    _checkinTimer = null;
    _notifications.cancel(_checkinNotifId);
  }

  void cancelCheckoutReminder() {
    _checkoutTimer?.cancel();
    _checkoutTimer = null;
    _notifications.cancel(_checkoutNotifId);
  }

  void cancelAll() {
    cancelCheckinReminder();
    cancelCheckoutReminder();
  }

  void dispose() => cancelAll();

  Future<void> _show(int id, String title, String body) =>
      _notifications.show(id, title, body, _notifDetails);
}
