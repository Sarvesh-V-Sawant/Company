import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/attendance.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../../../attendance/presentation/providers/attendance_provider.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _reconcile();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _reconcile() => ref.read(attendanceProvider.notifier).reconcile();

  Future<void> _handleCheckIn() async {
    final notifier = ref.read(attendanceProvider.notifier);
    notifier.setGpsRequesting();

    LocationPermission permission;
    try {
      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
    } catch (_) {
      notifier.setGpsRequesting();
      if (mounted) _showGpsSheet(_GpsError.permissionDenied);
      return;
    }

    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      if (mounted) _showGpsSheet(_GpsError.permissionDenied, permanent: permission == LocationPermission.deniedForever);
      return;
    }

    final isEnabled = await Geolocator.isLocationServiceEnabled();
    if (!isEnabled) {
      if (mounted) _showGpsSheet(_GpsError.disabled);
      return;
    }

    notifier.setGpsAcquiring();

    Position pos;
    try {
      pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      ).timeout(const Duration(seconds: 15));
    } catch (_) {
      if (mounted) _showGpsSheet(_GpsError.noNetwork);
      return;
    }

    if (pos.accuracy > 100) {
      if (mounted) _showGpsSheet(_GpsError.lowAccuracy, accuracy: pos.accuracy);
      return;
    }

    try {
      await notifier.checkIn(lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Check-in failed. Please try again.')));
      }
    }
  }

  Future<void> _handleCheckOut() async {
    final today = ref.read(attendanceProvider).value;
    if (today?.isCheckedIn == true) {
      final elapsed = _calcElapsedMinutes(today);
      final remaining = 540 - elapsed; // default 9h
      if (remaining > 120) {
        final confirm = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Checking Out Early?'),
            content: Text('You have ${_formatMinutes(remaining)} remaining today.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep Working')),
              TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Check Out')),
            ],
          ),
        );
        if (confirm != true) return;
      }
    }

    try {
      await ref.read(attendanceProvider.notifier).checkOut();
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Check-out failed. Please try again.')));
    }
  }

  int _calcElapsedMinutes(TodayAttendance? today) {
    if (today?.currentSessionStart == null) return today?.totalMinutesToday ?? 0;
    final start = DateTime.tryParse(today!.currentSessionStart!)?.toLocal();
    if (start == null) return today.totalMinutesToday;
    return today.totalMinutesToday + DateTime.now().difference(start).inMinutes;
  }

  String _formatMinutes(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }

  void _showGpsSheet(_GpsError error, {bool permanent = false, double? accuracy}) {
    showModalBottomSheet(
      context: context,
      builder: (_) => _GpsErrorSheet(error: error, permanent: permanent, accuracy: accuracy),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final notifier = ref.read(attendanceProvider.notifier);
    final now = DateTime.now();
    final hour = now.hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Genesis Workforce'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.go(RouteNames.notifications),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reconcile,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('$greeting, ${authState.user?.firstName ?? ''}!', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
              Text(_formatDate(now), style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600])),
              const SizedBox(height: 20),

              // Status card
              attendanceAsync.when(
                loading: () => const _ShimmerStatusCard(),
                error: (_, __) => const _ErrorStatusCard(),
                data: (today) => _StatusCard(today: today, checkInState: notifier.checkInState, elapsedMinutes: _calcElapsedMinutes(today)),
              ),
              const SizedBox(height: 12),

              // Action button
              attendanceAsync.when(
                loading: () => ElevatedButton(onPressed: null, child: const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))),
                error: (_, __) => const SizedBox.shrink(),
                data: (today) => _ActionButton(
                  checkInState: notifier.checkInState,
                  onCheckIn: _handleCheckIn,
                  onCheckOut: _handleCheckOut,
                ),
              ),
              const SizedBox(height: 20),

              // Today's sessions
              attendanceAsync.when(
                loading: () => const ShimmerListTile(),
                error: (_, __) => const SizedBox.shrink(),
                data: (today) {
                  if (today == null || today.sessions.isEmpty) return const SizedBox.shrink();
                  return _TodaysSessions(sessions: today.sessions);
                },
              ),

              const SizedBox(height: 20),
              // Quick actions
              Text('Quick Actions', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => context.push(RouteNames.leaveApply), child: const Text('Apply Leave'))),
                const SizedBox(width: 12),
                Expanded(child: OutlinedButton(onPressed: () => context.push(RouteNames.regularizationCreate), child: const Text('New Reg.'))),
              ]),

              const SizedBox(height: 20),
              // This month summary
              _MonthSummary(today: attendanceAsync.value),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime d) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return '${days[d.weekday - 1]}, ${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.today, required this.checkInState, required this.elapsedMinutes});
  final TodayAttendance? today;
  final CheckInState checkInState;
  final int elapsedMinutes;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: switch (checkInState) {
          CheckInState.reconciling => const Center(child: CircularProgressIndicator()),
          CheckInState.checkedIn => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFF16A34A), shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  const Text('Checked In', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF16A34A))),
                ]),
                if (today?.currentSessionStart != null) ...[
                  const SizedBox(height: 4),
                  Text('Since ${_formatTime(today!.currentSessionStart!)}', style: const TextStyle(color: Colors.grey)),
                ],
                const Divider(height: 16),
                Text('${_fmtMin(elapsedMinutes)} elapsed', style: const TextStyle(fontSize: 15)),
                Text('${_fmtMin(540 - elapsedMinutes)} remaining', style: TextStyle(fontSize: 14, color: elapsedMinutes >= 510 ? const Color(0xFF16A34A) : const Color(0xFFD97706))),
              ],
            ),
          CheckInState.checkedOutComplete => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 18),
                  const SizedBox(width: 8),
                  const Text('Day Complete', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF16A34A))),
                ]),
                Text('${_fmtMin(today?.totalMinutesToday ?? 0)} recorded today'),
              ],
            ),
          CheckInState.checkedOutPartial => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.circle_outlined, color: Color(0xFFD97706), size: 18),
                  const SizedBox(width: 8),
                  const Text('Partial Day', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFFD97706))),
                ]),
                Text('${_fmtMin(today?.totalMinutesToday ?? 0)} recorded'),
                Text('${_fmtMin(540 - (today?.totalMinutesToday ?? 0))} remaining', style: const TextStyle(color: Color(0xFFD97706))),
              ],
            ),
          _ => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: Colors.grey[300], shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text('Not Checked In', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey[600])),
                ]),
                Text('Required: 9h 0m today', style: TextStyle(color: Colors.grey[500])),
              ],
            ),
        },
      ),
    );
  }

  String _fmtMin(int m) => '${m ~/ 60}h ${m % 60}m';
  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m';
    } catch (_) { return iso; }
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.checkInState, required this.onCheckIn, required this.onCheckOut});
  final CheckInState checkInState;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;

  @override
  Widget build(BuildContext context) {
    return switch (checkInState) {
      CheckInState.gpsRequesting || CheckInState.gpsAcquiring || CheckInState.submitting =>
        ElevatedButton(onPressed: null, child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)), const SizedBox(width: 10), Text(checkInState == CheckInState.submitting ? 'CHECKING IN…' : 'GETTING LOCATION…')])),
      CheckInState.checkoutSubmitting =>
        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.red), onPressed: null, child: const Text('CHECKING OUT…')),
      CheckInState.checkedIn =>
        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.red), onPressed: onCheckOut, child: const Text('CHECK OUT')),
      CheckInState.checkedOutPartial =>
        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFD97706)), onPressed: onCheckIn, child: const Text('CHECK IN AGAIN')),
      CheckInState.checkedOutComplete =>
        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.grey), onPressed: null, child: const Text('DAILY HOURS COMPLETE')),
      _ =>
        ElevatedButton(onPressed: onCheckIn, child: const Text('CHECK IN')),
    };
  }
}

class _TodaysSessions extends StatelessWidget {
  const _TodaysSessions({required this.sessions});
  final List<AttendanceSession> sessions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Today's Sessions", style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        ...sessions.asMap().entries.map((e) => Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Session ${e.key + 1}', style: const TextStyle(fontWeight: FontWeight.w500)),
                Text('In: ${_fmt(e.value.checkIn)} · Out: ${e.value.checkOut != null ? _fmt(e.value.checkOut) : '—'}'),
                if (e.value.durationMinutes != null) Text('Duration: ${e.value.durationMinutes! ~/ 60}h ${e.value.durationMinutes! % 60}m', style: const TextStyle(color: Colors.grey)),
              ],
            ),
          ),
        )),
      ],
    );
  }

  String _fmt(String? iso) {
    if (iso == null) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) { return iso; }
  }
}

class _MonthSummary extends StatelessWidget {
  const _MonthSummary({this.today});
  final TodayAttendance? today;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('This Month', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: const [
                _SummaryItem(label: 'Present', value: '—'),
                _SummaryItem(label: 'Leave', value: '—'),
                _SummaryItem(label: 'Absent', value: '—'),
                _SummaryItem(label: 'WFH', value: '0'),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
    ]);
  }
}

class _ShimmerStatusCard extends StatelessWidget {
  const _ShimmerStatusCard();
  @override
  Widget build(BuildContext context) => const Card(child: Padding(padding: EdgeInsets.all(16), child: Column(children: [ShimmerBox(width: double.infinity, height: 16), SizedBox(height: 8), ShimmerBox(width: 160, height: 14)])));
}

class _ErrorStatusCard extends StatelessWidget {
  const _ErrorStatusCard();
  @override
  Widget build(BuildContext context) => const Card(child: Padding(padding: EdgeInsets.all(16), child: Text("Couldn't load data. Pull to retry.", textAlign: TextAlign.center)));
}

enum _GpsError { permissionDenied, disabled, lowAccuracy, outsideGeofence, noNetwork }

class _GpsErrorSheet extends StatelessWidget {
  const _GpsErrorSheet({required this.error, this.permanent = false, this.accuracy});
  final _GpsError error;
  final bool permanent;
  final double? accuracy;

  @override
  Widget build(BuildContext context) {
    final (title, body, primary, onPrimary) = switch (error) {
      _GpsError.permissionDenied => ('Location Permission Required', permanent ? "Go to Settings → Permissions → Location and select 'Allow while using app'." : 'This app needs location access to verify your workplace for check-in.', 'Open Settings', () async { await Geolocator.openAppSettings(); if (context.mounted) Navigator.pop(context); }),
      _GpsError.disabled => ('Location Services Disabled', 'Enable Location Services in your Android settings to check in.', 'Open Location Settings', () async { await Geolocator.openLocationSettings(); if (context.mounted) Navigator.pop(context); }),
      _GpsError.lowAccuracy => ('Poor GPS Signal', 'GPS accuracy: ${accuracy?.toStringAsFixed(0) ?? '?'}m (need < 100m)\n\nTry: Move near a window, enable Wi-Fi for network location, or wait for GPS signal.', 'Try Again', () => Navigator.pop(context)),
      _GpsError.outsideGeofence => ('Outside Office Location', "You're outside the required office radius. If working remotely, submit a regularization request instead.", 'Try Again', () => Navigator.pop(context)),
      _GpsError.noNetwork => ('No Internet Connection', 'Check-in requires an internet connection to verify your location.', 'Retry', () => Navigator.pop(context)),
    };

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(body),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
            const SizedBox(width: 12),
            Expanded(child: ElevatedButton(onPressed: onPrimary, child: Text(primary))),
          ]),
        ],
      ),
    );
  }
}
