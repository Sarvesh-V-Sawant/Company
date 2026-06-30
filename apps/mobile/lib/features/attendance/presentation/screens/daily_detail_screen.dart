import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../providers/attendance_provider.dart';

class DailyDetailScreen extends ConsumerWidget {
  const DailyDetailScreen({super.key, required this.dateStr});
  final String dateStr;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final histAsync = ref.watch(attendanceHistoryProvider((startDate: dateStr, endDate: dateStr)));
    DateTime? date;
    try { date = DateTime.parse(dateStr); } catch (_) {}

    return Scaffold(
      appBar: AppBar(title: Text(date != null ? DateFormat('EEE, d MMMM yyyy').format(date) : dateStr)),
      body: histAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (records) {
          final rec = records.isNotEmpty ? records.first : null;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (rec != null) ...[
                  StatusChip(status: rec.status),
                  const SizedBox(height: 8),
                  if (rec.workHours != null)
                    Text('${(rec.workHours! * 60).toInt() ~/ 60} hours ${(rec.workHours! * 60).toInt() % 60} minutes',
                        style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 16),
                  if (rec.sessions.isNotEmpty) ...[
                    Text('Sessions', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    ...rec.sessions.asMap().entries.map((e) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Session ${e.key + 1}', style: const TextStyle(fontWeight: FontWeight.w500)),
                          if (e.value.checkIn != null) Text('In:  ${_fmtFull(e.value.checkIn)}'),
                          if (e.value.checkOut != null) Text('Out: ${_fmtFull(e.value.checkOut)}'),
                          if (e.value.durationMinutes != null) Text('Duration: ${e.value.durationMinutes! ~/ 60}h ${e.value.durationMinutes! % 60}m', style: const TextStyle(color: Colors.grey)),
                        ]),
                      ),
                    )),
                  ],
                  const SizedBox(height: 16),
                  if (rec.isRegularized)
                    const Card(child: Padding(padding: EdgeInsets.all(12), child: Text('Regularization applied for this date.')))
                  else
                    Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Regularization', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      const Text('No regularization for this date.', style: TextStyle(color: Colors.grey)),
                    ]))),
                  const SizedBox(height: 16),
                  if (_canRegularize(dateStr))
                    OutlinedButton(
                      onPressed: () => context.push('${RouteNames.regularizationCreate}?date=$dateStr'),
                      child: const Text('Apply Regularization'),
                    ),
                ] else
                  const Center(child: Text('No attendance record for this date.')),
              ],
            ),
          );
        },
      ),
    );
  }

  bool _canRegularize(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return DateTime.now().difference(date).inDays <= 7;
    } catch (_) { return false; }
  }

  String _fmtFull(String? iso) {
    if (iso == null) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return DateFormat('hh:mm:ss a').format(dt);
    } catch (_) { return iso; }
  }
}
