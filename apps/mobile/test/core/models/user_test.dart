import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/models/user.dart';

void main() {
  group('User.fromJson', () {
    final json = {
      '_id': 'u1',
      'employeeId': 'EMP001',
      'firstName': 'John',
      'lastName': 'Doe',
      'email': 'john@example.com',
      'role': 'employee',
      'isActive': true,
      'requiresPasswordChange': false,
    };

    test('parses required fields', () {
      final user = User.fromJson(json);
      expect(user.id, 'u1');
      expect(user.employeeId, 'EMP001');
      expect(user.firstName, 'John');
      expect(user.lastName, 'Doe');
      expect(user.email, 'john@example.com');
    });

    test('fullName concatenates first and last', () {
      final user = User.fromJson(json);
      expect(user.fullName, 'John Doe');
    });

    test('initials uppercase first chars', () {
      final user = User.fromJson(json);
      expect(user.initials, 'JD');
    });

    test('falls back to id key if _id missing', () {
      final j = {...json, 'id': 'u2'}..remove('_id');
      expect(User.fromJson(j).id, 'u2');
    });

    test('optional fields nullable when absent', () {
      final user = User.fromJson(json);
      expect(user.phone, isNull);
      expect(user.department, isNull);
      expect(user.designation, isNull);
    });

    test('optional fields populated when present', () {
      final user = User.fromJson({...json, 'phone': '555-0100', 'department': 'Eng', 'designation': 'SWE'});
      expect(user.phone, '555-0100');
      expect(user.department, 'Eng');
      expect(user.designation, 'SWE');
    });

    test('defaults gracefully on empty json', () {
      final user = User.fromJson({});
      expect(user.id, '');
      expect(user.fullName, ' ');
      expect(user.initials, '');
    });
  });
}
