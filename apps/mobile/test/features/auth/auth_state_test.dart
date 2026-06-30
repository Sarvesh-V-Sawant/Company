import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/features/auth/presentation/providers/auth_provider.dart';
import 'package:genesis_workforce/core/models/user.dart';

final _user = User(
  id: 'u1',
  employeeId: 'EMP001',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  role: 'employee',
  isActive: true,
  requiresPasswordChange: false,
);

void main() {
  group('AuthState', () {
    test('initial state — not authenticated, not initialized', () {
      const state = AuthState();
      expect(state.isAuthenticated, isFalse);
      expect(state.isInitialized, isFalse);
      expect(state.user, isNull);
    });

    test('authenticated when user present', () {
      final state = AuthState(user: _user, isInitialized: true);
      expect(state.isAuthenticated, isTrue);
    });

    test('copyWith preserves existing user', () {
      final base = AuthState(user: _user, isInitialized: true);
      final next = base.copyWith(isLoading: true);
      expect(next.user, _user);
      expect(next.isLoading, isTrue);
    });

    test('copyWith clearUser removes user', () {
      final base = AuthState(user: _user, isInitialized: true);
      final next = base.copyWith(clearUser: true);
      expect(next.user, isNull);
      expect(next.isAuthenticated, isFalse);
    });

    test('copyWith sets error', () {
      const base = AuthState();
      final next = base.copyWith(error: 'Invalid password');
      expect(next.error, 'Invalid password');
    });

    test('copyWith clears error when null passed', () {
      final base = const AuthState().copyWith(error: 'err');
      final next = base.copyWith(isLoading: false);
      expect(next.error, isNull);
    });
  });
}
