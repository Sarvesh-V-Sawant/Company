import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../providers/attendance_provider.dart';

class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends ConsumerState<AttendanceHistoryScreen> {
  late DateTime _selectedMonth;

  @override
  void initState() {
    super.initState();
    _selectedMonth = DateTime(DateTime.now().year, DateTime.now().month);
  }

  String get _startDate => DateFormat('yyyy-MM-dd').format(DateTime(_selectedMonth.year, _selectedMonth.month, 1));
  String get _endDate => DateFormat('yyyy-MM-dd').format(DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0));

  @override
  Widget build(BuildContext context) {
    final histAsync = ref.watch(attendanceHistoryProvider((startDate: _startDate, endDate: _endDate)));

    return Scaffold(
      appBar: AppBar(title: const Text('Attendance History')),
      body: Column(
        children: [
          // Month picker
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => setState(() => _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month - 1))),
                Expanded(child: Text(DateFormat('MMMM yyyy').format(_selectedMonth), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600))),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _selectedMonth.isBefore(DateTime(DateTime.now().year, DateTime.now().month)) ? () => setState(() => _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1)) : null,
                ),
              ],
            ),
          ),
          Expanded(
            child: histAsync.when(
              loading: () => ListView.builder(itemCount: 8, itemBuilder: (_, __) => const ShimmerListTile()),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (records) {
                if (records.isEmpty) return const Center(child: Text('No records for this month.'));
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(attendanceHistoryProvider((startDate: _startDate, endDate: _endDate)).future),
                  child: ListView.separated(
                    itemCount: records.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final r = records[i];
                      final date = DateTime.tryParse(r.date);
                      return ListTile(
                        onTap: () => context.push(RouteNames.attendanceDay(r.date.substring(0, 10))),
                        title: Text(date != null ? DateFormat('EEE d MMM').format(date) : r.date),
                        trailing: StatusChip(status: r.status),
                        subtitle: r.checkIn != null ? Text('${_fmt(r.checkIn)} · ${r.workHours != null ? '${r.workHours!.toStringAsFixed(1)}h' : ''}') : null,
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(String? iso) {
    if (iso == null) return '';
    try { final dt = DateTime.parse(iso).toLocal(); return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}'; }
    catch (_) { return iso; }
  }
}
