import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/models/attendance.dart';

void main() {
  group('AttendanceSession.fromJson', () {
    test('parses check-in and check-out', () {
      final s = AttendanceSession.fromJson({
        'checkIn': '2026-06-20T09:00:00Z',
        'checkOut': '2026-06-20T18:00:00Z',
        'durationMinutes': 480,
      });
      expect(s.checkIn, '2026-06-20T09:00:00Z');
      expect(s.checkOut, '2026-06-20T18:00:00Z');
      expect(s.durationMinutes, 480);
    });

    test('nullable fields', () {
      final s = AttendanceSession.fromJson({'checkIn': '2026-06-20T09:00:00Z'});
      expect(s.checkOut, isNull);
      expect(s.durationMinutes, isNull);
    });
  });

  group('TodayAttendance.fromJson', () {
    test('parses isCheckedIn true with open session', () {
      final t = TodayAttendance.fromJson({
        'date': '2026-06-20',
        'status': 'present',
        'isCheckedIn': true,
        'currentSessionStart': '2026-06-20T09:00:00Z',
        'sessions': [],
        'totalMinutesToday': 120,
      });
      expect(t.isCheckedIn, isTrue);
      expect(t.currentSessionStart, '2026-06-20T09:00:00Z');
      expect(t.totalMinutesToday, 120);
    });

    test('parses sessions list', () {
      final t = TodayAttendance.fromJson({
        'date': '2026-06-20',
        'status': 'present',
        'isCheckedIn': false,
        'sessions': [
          {'checkIn': '2026-06-20T09:00:00Z', 'checkOut': '2026-06-20T13:00:00Z', 'durationMinutes': 240},
          {'checkIn': '2026-06-20T14:00:00Z', 'checkOut': '2026-06-20T18:00:00Z', 'durationMinutes': 240},
        ],
        'totalMinutesToday': 480,
      });
      expect(t.sessions.length, 2);
      expect(t.sessions[0].durationMinutes, 240);
    });

    test('defaults on missing fields', () {
      final t = TodayAttendance.fromJson({});
      expect(t.status, 'absent');
      expect(t.isCheckedIn, isFalse);
      expect(t.sessions, isEmpty);
      expect(t.totalMinutesToday, 0);
    });
  });

  group('AttendanceRecord.fromJson', () {
    test('parses basic record', () {
      final r = AttendanceRecord.fromJson({
        '_id': 'a1',
        'employeeId': 'e1',
        'date': '2026-06-20',
        'status': 'present',
        'workHours': 8.5,
        'isRegularized': false,
        'sessions': [],
      });
      expect(r.id, 'a1');
      expect(r.status, 'present');
      expect(r.workHours, 8.5);
      expect(r.isRegularized, isFalse);
    });

    test('handles nested employeeId', () {
      final r = AttendanceRecord.fromJson({
        '_id': 'a1',
        'employeeId': {'_id': 'e99'},
        'date': '2026-06-20',
        'status': 'absent',
        'isRegularized': false,
      });
      expect(r.employeeId, 'e99');
    });
  });

  group('MonthlySummary.fromJson', () {
    test('parses all counters', () {
      final s = MonthlySummary.fromJson({
        'presentDays': 18,
        'absentDays': 2,
        'leaveDays': 1,
        'halfDays': 1,
        'holidayDays': 2,
        'weekendDays': 8,
        'totalHours': 144.5,
      });
      expect(s.presentDays, 18);
      expect(s.totalHours, 144.5);
    });

    test('defaults to zeros', () {
      final s = MonthlySummary.fromJson({});
      expect(s.presentDays, 0);
      expect(s.totalHours, 0.0);
    });
  });
}
