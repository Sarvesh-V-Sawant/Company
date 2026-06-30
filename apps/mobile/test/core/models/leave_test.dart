import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/models/leave.dart';

void main() {
  group('LeaveBalance.fromJson', () {
    final json = {
      'leaveType': 'casual',
      'leaveTypeName': 'Casual Leave',
      'entitled': 12,
      'used': 3,
      'remaining': 9,
      'carriedForward': 0,
    };

    test('parses all fields', () {
      final b = LeaveBalance.fromJson(json);
      expect(b.leaveType, 'casual');
      expect(b.entitled, 12);
      expect(b.used, 3);
      expect(b.remaining, 9);
      expect(b.carriedForward, 0);
    });

    test('cfExpiryDate nullable', () {
      expect(LeaveBalance.fromJson(json).cfExpiryDate, isNull);
      final b2 = LeaveBalance.fromJson({...json, 'cfExpiryDate': '2027-03-31'});
      expect(b2.cfExpiryDate, '2027-03-31');
    });
  });

  group('LeaveRequest.isCancellable', () {
    LeaveRequest make(String status) => LeaveRequest(
          id: 'l1',
          employeeId: 'e1',
          leaveType: 'casual',
          startDate: '2026-06-20',
          endDate: '2026-06-20',
          days: 1,
          reason: 'Personal',
          status: status,
          createdAt: '2026-06-18T00:00:00Z',
        );

    test('pending is cancellable', () => expect(make('pending').isCancellable, isTrue));
    test('approved not cancellable', () => expect(make('approved').isCancellable, isFalse));
    test('rejected not cancellable', () => expect(make('rejected').isCancellable, isFalse));
    test('cancelled not cancellable', () => expect(make('cancelled').isCancellable, isFalse));
  });

  group('LeaveRequest.fromJson', () {
    final json = {
      '_id': 'l1',
      'employeeId': 'e1',
      'leaveType': 'casual',
      'startDate': '2026-06-20',
      'endDate': '2026-06-20',
      'days': 1,
      'reason': 'Personal',
      'status': 'pending',
      'createdAt': '2026-06-18T00:00:00Z',
    };

    test('parses correctly', () {
      final r = LeaveRequest.fromJson(json);
      expect(r.id, 'l1');
      expect(r.status, 'pending');
      expect(r.isCancellable, isTrue);
    });

    test('handles nested employeeId', () {
      final j = {...json, 'employeeId': {'_id': 'e99'}};
      expect(LeaveRequest.fromJson(j).employeeId, 'e99');
    });
  });
}
