import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/router/route_names.dart';

void main() {
  group('RouteNames', () {
    test('notificationDetail builds correct path', () {
      expect(RouteNames.notificationDetail('abc123'), '/notifications/abc123');
    });

    test('notificationPermission path', () {
      expect(RouteNames.notificationPermission, '/notification-permission');
    });

    test('leaveDetail builds correct path', () {
      expect(RouteNames.leaveDetail('l1'), '/leave/l1');
    });

    test('regularizationDetail builds correct path', () {
      expect(RouteNames.regularizationDetail('r1'), '/regularization/r1');
    });

    test('attendanceDay builds correct path', () {
      expect(RouteNames.attendanceDay('2026-06-20'), '/attendance/day/2026-06-20');
    });
  });
}
