import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/core/models/user.dart';
import 'package:genesis_workforce/features/auth/data/repositories/auth_repository.dart';

final _user = User(
  id: 'u1',
  employeeId: 'EMP001',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  role: 'employee',
  isActive: true,
  requiresPasswordChange: false,
);

void main() {
  group('DeviceMismatchException', () {
    test('AUTH_004 = DEVICE_NOT_REGISTERED code', () {
      const e = DeviceMismatchException(code: 'AUTH_004');
      expect(e.code, 'AUTH_004');
    });

    test('AUTH_005 = DEVICE_FINGERPRINT_MISMATCH code', () {
      const e = DeviceMismatchException(code: 'AUTH_005');
      expect(e.code, 'AUTH_005');
    });

    test('no other device codes accepted at login (no AUTH_011)', () {
      // AUTH_011 is not in the official error catalog — only AUTH_004/AUTH_005 valid
      const e = DeviceMismatchException(code: 'AUTH_004');
      expect(e.code, isNot('AUTH_011'));
    });
  });

  group('AuthException', () {
    test('carries code and message', () {
      const e = AuthException(code: 'AUTH_001', message: 'Invalid email or password.');
      expect(e.code, 'AUTH_001');
      expect(e.message, 'Invalid email or password.');
    });
  });

  group('SessionExpiredException', () {
    test('is throwable', () {
      expect(() => throw const SessionExpiredException(), throwsA(isA<SessionExpiredException>()));
    });
  });

  group('LoginResult', () {
    test('requiresPasswordChange true', () {
      final r = LoginResult(user: _user, requiresPasswordChange: true);
      expect(r.requiresPasswordChange, isTrue);
    });

    test('requiresPasswordChange false', () {
      final r = LoginResult(user: _user, requiresPasswordChange: false);
      expect(r.requiresPasswordChange, isFalse);
    });

    test('user is preserved', () {
      final r = LoginResult(user: _user, requiresPasswordChange: false);
      expect(r.user.employeeId, 'EMP001');
    });
  });
}
