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

enum CheckInState { reconciling, idle, gpsRequesting, gpsAcquiring, submitting, checkedIn, checkoutSubmitting, checkedOutPartial, checkedOutComplete }

class AttendanceNotifier extends StateNotifier<AsyncValue<TodayAttendance?>> {
  final AttendanceRemoteSource _source;
  final CompanySettings settings;
  CheckInState _checkInState = CheckInState.reconciling;
  Timer? _timer;

  AttendanceNotifier(this._source, this.settings) : super(const AsyncValue.loading());

  CheckInState get checkInState => _checkInState;

  Future<void> reconcile() async {
    _checkInState = CheckInState.reconciling;
    try {
      final today = await _source.getToday();
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      _checkInState = CheckInState.idle;
    }
  }

  void _resolveState(TodayAttendance today) {
    if (today.isCheckedIn) {
      _checkInState = CheckInState.checkedIn;
      _startTimer();
    } else if (today.sessions.isNotEmpty) {
      final threshold = settings.requiredDailyMinutes - 30;
      _checkInState = today.totalMinutesToday >= threshold ? CheckInState.checkedOutComplete : CheckInState.checkedOutPartial;
    } else {
      _checkInState = CheckInState.idle;
    }
  }

  void setGpsRequesting() { _checkInState = CheckInState.gpsRequesting; state = state; }
  void setGpsAcquiring() { _checkInState = CheckInState.gpsAcquiring; state = state; }

  Future<void> checkIn({required double lat, required double lng, required double accuracy}) async {
    _checkInState = CheckInState.submitting;
    try {
      final nonce = const Uuid().v4();
      final today = await _source.checkIn(lat: lat, lng: lng, accuracy: accuracy, nonce: nonce);
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      _checkInState = CheckInState.idle;
      rethrow;
    }
  }

  Future<void> checkOut() async {
    _checkInState = CheckInState.checkoutSubmitting;
    try {
      final today = await _source.checkOut();
      _stopTimer();
      state = AsyncValue.data(today);
      _resolveState(today);
    } catch (e) {
      _checkInState = CheckInState.checkedIn;
      rethrow;
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => state = state);
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  void dispose() {
    _stopTimer();
    super.dispose();
  }
}

final attendanceProvider = StateNotifierProvider<AttendanceNotifier, AsyncValue<TodayAttendance?>>((ref) {
  final source = ref.watch(attendanceSourceProvider);
  return AttendanceNotifier(source, CompanySettings.defaults);
});

// History provider
final attendanceHistoryProvider = FutureProvider.family<List<AttendanceRecord>, ({String? startDate, String? endDate})>((ref, params) async {
  final source = ref.watch(attendanceSourceProvider);
  return source.getHistory(startDate: params.startDate, endDate: params.endDate);
});
