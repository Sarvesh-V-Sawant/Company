import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:convert';
import '../../../../core/constants/storage_keys.dart';
import '../../../../core/models/user.dart';
import '../../../../core/storage/secure_storage.dart';
import '../sources/auth_remote_source.dart';

class LoginResult {
  final User user;
  final bool requiresPasswordChange;
  final String? deviceMismatchCode;

  const LoginResult({required this.user, required this.requiresPasswordChange, this.deviceMismatchCode});
}

class AuthRepository {
  final AuthRemoteSource _source;
  AuthRepository(this._source);

  Future<String> getOrCreateDeviceFingerprint() async {
    var existing = await SecureStorageService.read(StorageKeys.deviceHash);
    if (existing != null) return existing;

    final info = DeviceInfoPlugin();
    final android = await info.androidInfo;
    // SHA-256(deviceId|model|brand|serialNumber) per approved spec formula
    // serialNumber is the closest stable 4th identifier in device_info_plus 10.x
    final raw = '${android.id}|${android.model}|${android.brand}|${android.serialNumber}';
    final hash = sha256.convert(utf8.encode(raw)).toString();
    await SecureStorageService.write(StorageKeys.deviceHash, hash);
    return hash;
  }

  Future<LoginResult> login({required String email, required String password}) async {
    // PHASE 15.18 DIAGNOSTIC
    // ignore: avoid_print
    print('[DIAG][REPO] login() entry');
    final fingerprint = await getOrCreateDeviceFingerprint();
    // ignore: avoid_print
    print('[DIAG][REPO] fingerprint obtained: ${fingerprint.substring(0, 8)}... (${fingerprint.length} chars)');

    // ignore: avoid_print
    print('[DIAG][REPO] calling _source.login()');
    final result = await _source.login(email: email, password: password, deviceFingerprint: fingerprint);
    // ignore: avoid_print
    print('[DIAG][REPO] _source.login() returned. success=${result['success']}  keys=${result.keys.toList()}');

    if (result['success'] != true) {
      final error = result['error'] as Map<String, dynamic>? ?? {};
      final code = error['code'] as String? ?? 'UNKNOWN';
      // ignore: avoid_print
      print('[DIAG][REPO] login failed: code=$code  message=${error['message']}');
      // AUTH_004 = DEVICE_NOT_REGISTERED; AUTH_005 = DEVICE_FINGERPRINT_MISMATCH
      if (code == 'AUTH_004' || code == 'AUTH_005') {
        throw DeviceMismatchException(code: code);
      }
      throw AuthException(code: code, message: error['message'] as String? ?? 'Login failed');
    }

    final data = result['data'] as Map<String, dynamic>;
    final accessToken = data['accessToken'] as String;
    final refreshToken = data['refreshToken'] as String;
    final sessionId = data['sessionId'] as String? ?? '';
    final requiresPasswordChange = data['requiresPasswordChange'] as bool? ??
        (data['employee'] as Map<String, dynamic>?)?['requiresPasswordChange'] as bool? ?? false;
    // ignore: avoid_print
    print('[DIAG][REPO] login success. requiresPasswordChange=$requiresPasswordChange  sessionId=${sessionId.substring(0, 8)}...');

    // ignore: avoid_print
    print('[DIAG][REPO] writing tokens to SecureStorage');
    await SecureStorageService.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      sessionId: sessionId,
    );
    // ignore: avoid_print
    print('[DIAG][REPO] tokens saved');

    final employee = data['employee'] as Map<String, dynamic>? ?? data['user'] as Map<String, dynamic>? ?? {};
    final user = User.fromJson(employee);
    // ignore: avoid_print
    print('[DIAG][REPO] LoginResult built. user.id=${user.id}');
    return LoginResult(user: user, requiresPasswordChange: requiresPasswordChange);
  }

  Future<({User user, bool requiresPasswordChange})> tryRefreshSession() async {
    final refreshToken = await SecureStorageService.read(StorageKeys.refreshToken);
    final sessionId = await SecureStorageService.read(StorageKeys.sessionId);
    if (refreshToken == null || sessionId == null) throw const SessionExpiredException();

    final result = await _source.refresh(refreshToken, sessionId);
    if (result['success'] != true) throw const SessionExpiredException();

    final data = result['data'] as Map<String, dynamic>;
    final newAccessToken = data['accessToken'] as String;
    await SecureStorageService.saveTokens(
      accessToken: newAccessToken,
      refreshToken: data['refreshToken'] as String? ?? refreshToken,
      // sessionId unchanged on refresh — server returns only new accessToken
    );

    // Refresh only returns accessToken; decode user from token or fetch via getMe
    final user = await _source.getMe();
    return (user: user, requiresPasswordChange: user.requiresPasswordChange);
  }

  Future<void> logout() async {
    final sessionId = await SecureStorageService.read(StorageKeys.sessionId) ?? '';
    await _source.logout(sessionId);
    await SecureStorageService.clearSession();
  }

  Future<User> getMe() => _source.getMe();

  Future<String> changePassword(String currentPassword, String newPassword) async {
    final result = await _source.changePassword(currentPassword: currentPassword, newPassword: newPassword);
    final data = result['data'] as Map<String, dynamic>?;
    final newToken = data?['accessToken'] as String?;
    if (newToken != null) {
      final refresh = await SecureStorageService.read(StorageKeys.refreshToken) ?? '';
      await SecureStorageService.saveTokens(accessToken: newToken, refreshToken: refresh);
    }
    return newToken ?? '';
  }

  Future<void> forgotPassword(String email) => _source.forgotPassword(email);

  Future<void> resetPassword({
    required String token,
    required String email,
    required String newPassword,
  }) => _source.resetPassword(token: token, email: email, newPassword: newPassword);

  Future<void> updateFcmToken(String token) => _source.updateFcmToken(token);

  Future<Map<String, dynamic>> submitDeviceRequest(Map<String, dynamic> body) =>
      _source.submitDeviceRequest(body);

  Future<String> checkDeviceRequestStatus({
    required String email,
    required String deviceFingerprint,
  }) async {
    final result = await _source.checkDeviceRequestStatus(
      email: email,
      deviceFingerprint: deviceFingerprint,
    );
    final data = result['data'] as Map<String, dynamic>? ?? {};
    return data['status'] as String? ?? 'not_found';
  }
}

class AuthException implements Exception {
  final String code;
  final String message;
  const AuthException({required this.code, required this.message});
}

class DeviceMismatchException implements Exception {
  final String code;
  const DeviceMismatchException({required this.code});
}

class SessionExpiredException implements Exception {
  const SessionExpiredException();
}
