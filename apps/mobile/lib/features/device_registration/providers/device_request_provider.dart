import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../../core/constants/storage_keys.dart';
import '../../../core/storage/secure_storage.dart';

enum DeviceRequestStatus { idle, submitting, pending, approved, rejected, error }

class DeviceRequestState {
  final DeviceRequestStatus status;
  final String? errorMessage;

  const DeviceRequestState({
    this.status = DeviceRequestStatus.idle,
    this.errorMessage,
  });

  DeviceRequestState copyWith({DeviceRequestStatus? status, String? errorMessage}) {
    return DeviceRequestState(
      status: status ?? this.status,
      errorMessage: errorMessage,
    );
  }
}

class DeviceRequestNotifier extends StateNotifier<DeviceRequestState> {
  final Ref _ref;
  Timer? _pollTimer;

  DeviceRequestNotifier(this._ref) : super(const DeviceRequestState());

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> submitRequest({
    required String email,
    required String password,
    required String deviceFingerprint,
    required Map<String, dynamic> deviceInfo,
  }) async {
    state = state.copyWith(status: DeviceRequestStatus.submitting, errorMessage: null);
    try {
      final repo = _ref.read(authRepositoryProvider);
      final body = {
        'email': email,
        'password': password,
        'deviceFingerprint': deviceFingerprint,
        ...deviceInfo,
      };
      final result = await repo.submitDeviceRequest(body);
      final resultStatus = (result['data'] as Map<String, dynamic>?)?['status'] as String? ?? 'pending';

      if (resultStatus == 'already_approved') {
        state = state.copyWith(status: DeviceRequestStatus.approved);
      } else {
        state = state.copyWith(status: DeviceRequestStatus.pending);
        _startPolling(email: email, deviceFingerprint: deviceFingerprint);
      }
    } catch (e) {
      state = state.copyWith(
        status: DeviceRequestStatus.error,
        errorMessage: e.toString(),
      );
    }
  }

  void startPollingExisting({required String email, required String deviceFingerprint}) {
    state = state.copyWith(status: DeviceRequestStatus.pending);
    _startPolling(email: email, deviceFingerprint: deviceFingerprint);
  }

  void _startPolling({required String email, required String deviceFingerprint}) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      await _checkStatus(email: email, deviceFingerprint: deviceFingerprint);
    });
  }

  Future<void> _checkStatus({required String email, required String deviceFingerprint}) async {
    try {
      final repo = _ref.read(authRepositoryProvider);
      final status = await repo.checkDeviceRequestStatus(
        email: email,
        deviceFingerprint: deviceFingerprint,
      );
      if (status == 'approved') {
        _pollTimer?.cancel();
        state = state.copyWith(status: DeviceRequestStatus.approved);
      } else if (status == 'rejected') {
        _pollTimer?.cancel();
        state = state.copyWith(status: DeviceRequestStatus.rejected);
      }
    } catch (_) {
      // Polling errors are silent — will retry next tick
    }
  }

  Future<void> pollOnce({required String email}) async {
    final fingerprint = await SecureStorageService.read(StorageKeys.deviceHash);
    if (fingerprint == null) return;
    await _checkStatus(email: email, deviceFingerprint: fingerprint);
  }

  void reset() {
    _pollTimer?.cancel();
    state = const DeviceRequestState();
  }
}

final deviceRequestProvider =
    StateNotifierProvider.autoDispose<DeviceRequestNotifier, DeviceRequestState>(
  (ref) => DeviceRequestNotifier(ref),
);
