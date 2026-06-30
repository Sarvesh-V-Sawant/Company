import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/models/user.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/sources/auth_remote_source.dart';
import '../../../notifications/data/services/fcm_service.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return AuthRepository(AuthRemoteSource(dio));
});

final _fcmServiceProvider = Provider<FcmService>((ref) => ref.watch(fcmServiceProvider));

class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;
  final bool isInitialized;

  const AuthState({
    this.user,
    this.isLoading = false,
    this.error,
    this.isInitialized = false,
  });

  AuthState copyWith({User? user, bool? isLoading, String? error, bool? isInitialized, bool clearUser = false}) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isInitialized: isInitialized ?? this.isInitialized,
    );
  }

  bool get isAuthenticated => user != null;
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repo;
  final FcmService _fcm;

  AuthNotifier(this._repo, this._fcm) : super(const AuthState());

  Future<bool> initialize() async {
    state = state.copyWith(isLoading: true);
    try {
      final result = await _repo.tryRefreshSession();
      state = AuthState(user: result.user, isInitialized: true);
      return result.requiresPasswordChange;
    } catch (_) {
      state = const AuthState(isInitialized: true);
      return false;
    }
  }

  Future<LoginResult> login({required String email, required String password}) async {
    // PHASE 15.18 DIAGNOSTIC
    // ignore: avoid_print
    print('[DIAG][NOTIF] login() called  state.isLoading=${state.isLoading}');
    state = state.copyWith(isLoading: true, error: null);
    // ignore: avoid_print
    print('[DIAG][NOTIF] state → isLoading=true, calling _repo.login()');
    try {
      final result = await _repo.login(email: email, password: password);
      // ignore: avoid_print
      print('[DIAG][NOTIF] _repo.login() success. requiresPasswordChange=${result.requiresPasswordChange}');
      state = AuthState(user: result.user, isInitialized: true);
      // ignore: avoid_print
      print('[DIAG][NOTIF] state → user set, isAuthenticated=${state.isAuthenticated}');
      // Register FCM token after successful login (non-blocking)
      _fcm.registerToken();
      return result;
    } catch (e, stack) {
      // ignore: avoid_print
      print('[DIAG][NOTIF] login() caught: ${e.runtimeType} $e');
      // ignore: avoid_print
      print('[DIAG][NOTIF] stack:\n$stack');
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> logout() async {
    // Clear FCM token before clearing session
    await _fcm.clearToken();
    await _repo.logout();
    state = const AuthState(isInitialized: true);
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await _repo.changePassword(currentPassword, newPassword);
    final user = await _repo.getMe();
    state = state.copyWith(user: user);
  }

  void setUser(User user) {
    state = state.copyWith(user: user);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  final fcm = ref.watch(_fcmServiceProvider);
  return AuthNotifier(repo, fcm);
});
