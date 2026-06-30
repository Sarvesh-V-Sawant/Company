import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/models/regularization.dart';

void main() {
  RegularizationRequest make({String status = 'pending', String type = 'missed_punch'}) =>
      RegularizationRequest(
        id: 'r1',
        employeeId: 'e1',
        date: '2026-06-18',
        type: type,
        reason: 'Forgot to punch',
        status: status,
        createdAt: '2026-06-19T00:00:00Z',
      );

  group('RegularizationRequest getters', () {
    test('pending is cancellable', () => expect(make().isCancellable, isTrue));
    test('approved not cancellable', () => expect(make(status: 'approved').isCancellable, isFalse));
    test('isWfh true for wfh type', () => expect(make(type: 'wfh').isWfh, isTrue));
    test('isWfh false for missed_punch', () => expect(make().isWfh, isFalse));
    test('isMissedPunch true', () => expect(make(type: 'missed_punch').isMissedPunch, isTrue));
    test('isMissedPunch false for wfh', () => expect(make(type: 'wfh').isMissedPunch, isFalse));
  });

  group('RegularizationRequest.fromJson', () {
    final json = {
      '_id': 'r1',
      'employeeId': 'e1',
      'date': '2026-06-18',
      'type': 'missed_punch',
      'reason': 'Forgot to punch',
      'status': 'pending',
      'requestedCheckIn': '09:00',
      'requestedCheckOut': '18:00',
      'createdAt': '2026-06-19T00:00:00Z',
    };

    test('parses all fields', () {
      final r = RegularizationRequest.fromJson(json);
      expect(r.id, 'r1');
      expect(r.type, 'missed_punch');
      expect(r.requestedCheckIn, '09:00');
      expect(r.requestedCheckOut, '18:00');
    });

    test('handles nested employeeId', () {
      final j = {...json, 'employeeId': {'_id': 'e99'}};
      expect(RegularizationRequest.fromJson(j).employeeId, 'e99');
    });

    test('defaults on empty json', () {
      final r = RegularizationRequest.fromJson({});
      expect(r.status, 'pending');
      expect(r.isCancellable, isTrue);
    });
  });
}
