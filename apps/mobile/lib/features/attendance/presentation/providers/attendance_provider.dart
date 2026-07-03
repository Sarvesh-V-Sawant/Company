import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/models/attendance.dart';
import '../../../../core/models/notification.dart';
import '../../data/sources/attendance_remote_source.dart';

final attendanceSourceProvider = Provider<AttendanceRemoteSource>((ref) {
  return AttendanceRemoteSource(ref.watch(dioProvider));
});

// Separate StateProvider so every checkInState transition triggers a reactive rebuild,
// independently of whether TodayAttendance data itself changed.
final checkInStateProvider = StateProvider<CheckInState>((ref) => CheckInState.reconciling);

enum CheckInState { reconciling, idle, gpsRequesting, gpsAcquiring, submitting, checkedIn, checkoutSubmitting, checkedOutPartial, checkedOutComplete }

class AttendanceNotifier extends StateNotifier<AsyncValue<TodayAttendance?>> {
  final AttendanceRemoteSource _source;
  final CompanySettings settings;
  final Ref _ref;
  CheckInState _checkInState = CheckInState.reconciling;
  Timer? _syncTimer;

  AttendanceNotifier(this._source, this.settings, this._ref) : super(const AsyncValue.loading());

  CheckInState get checkInState => _checkInState;

  void _setCheckInState(CheckInState s) {
    _checkInState = s;
    _ref.read(checkInStateProvider.notifier).state = s;
  }

  Future<void> reconcile() async {
    _setCheckInState(CheckInState.reconciling);
    try {
      final today = await _source.getToday();
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      _setCheckInState(CheckInState.idle);
    }
  }

  void _resolveState(TodayAttendance today) {
    if (today.isCheckedIn) {
      _setCheckInState(CheckInState.checkedIn);
      _startSyncTimer();
    } else {
      _stopSyncTimer();
      if (today.sessions.isNotEmpty) {
        final threshold = settings.requiredDailyMinutes - 30;
        _setCheckInState(today.totalMinutesToday >= threshold
            ? CheckInState.checkedOutComplete
            : CheckInState.checkedOutPartial);
      } else {
        _setCheckInState(CheckInState.idle);
      }
    }
  }

  void setGpsRequesting() => _setCheckInState(CheckInState.gpsRequesting);
  void setGpsAcquiring() => _setCheckInState(CheckInState.gpsAcquiring);

  Future<void> checkIn({required double lat, required double lng, required double accuracy}) async {
    _setCheckInState(CheckInState.submitting);
    try {
      final nonce = const Uuid().v4();
      final today = await _source.checkIn(lat: lat, lng: lng, accuracy: accuracy, nonce: nonce);
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      _setCheckInState(CheckInState.idle);
      rethrow;
    }
  }

  Future<void> checkOut() async {
    _setCheckInState(CheckInState.checkoutSubmitting);
    try {
      final today = await _source.checkOut();
      _stopSyncTimer();
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      _setCheckInState(CheckInState.checkedIn);
      rethrow;
    }
  }

  // Periodic background sync while checked in — keeps backend state fresh.
  void _startSyncTimer() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(minutes: 5), (_) async {
      try {
        await reconcile();
      } catch (_) {
        // reconcile() catches internally; this guards the discarded Timer Future
      }
    });
  }

  void _stopSyncTimer() {
    _syncTimer?.cancel();
    _syncTimer = null;
  }

  @override
  void dispose() {
    _stopSyncTimer();
    super.dispose();
  }
}

final attendanceProvider = StateNotifierProvider<AttendanceNotifier, AsyncValue<TodayAttendance?>>((ref) {
  final source = ref.watch(attendanceSourceProvider);
  return AttendanceNotifier(source, CompanySettings.defaults, ref);
});

final attendanceHistoryProvider = FutureProvider.family<List<AttendanceRecord>, ({String? startDate, String? endDate})>((ref, params) async {
  final source = ref.watch(attendanceSourceProvider);
  return source.getHistory(startDate: params.startDate, endDate: params.endDate);
});
