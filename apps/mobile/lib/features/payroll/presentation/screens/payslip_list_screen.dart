import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/error_widget.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../providers/payroll_provider.dart';

class PayslipListScreen extends ConsumerWidget {
  const PayslipListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(payslipListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payslips')),
      body: async.when(
        loading: () => ListView.builder(itemCount: 6, itemBuilder: (_, __) => const ShimmerListTile()),
        error: (_, __) => AppErrorWidget(message: 'Could not load payslips. Check your connection.', onRetry: () => ref.refresh(payslipListProvider.future)),
        data: (payslips) {
          if (payslips.isEmpty) return const Center(child: Text('No payslips available.'));
          return RefreshIndicator(
            onRefresh: () => ref.refresh(payslipListProvider.future),
            child: ListView.separated(
              itemCount: payslips.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final p = payslips[i];
                return ListTile(
                  onTap: () => context.push(RouteNames.payslipDetail(p.yearMonth)),
                  title: Text(_fmtYearMonth(p.yearMonth)),
                  subtitle: Text('Net: ₹${p.netSalary.toStringAsFixed(2)}'),
                  trailing: StatusChip(status: p.status),
                );
              },
            ),
          );
        },
      ),
    );
  }

  String _fmtYearMonth(String ym) {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    try {
      final parts = ym.split('-');
      return '${months[int.parse(parts[1])]} ${parts[0]}';
    } catch (_) { return ym; }
  }
}
