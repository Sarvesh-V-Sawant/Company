import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../providers/payroll_provider.dart';

class PayslipDetailScreen extends ConsumerWidget {
  const PayslipDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(payslipDetailProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('Payslip')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (p) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Card(child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  StatusChip(status: p.status),
                  const SizedBox(height: 8),
                  Text(_fmtYearMonth(p.yearMonth), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                ]),
              )),
              const SizedBox(height: 12),

              // Attendance summary
              Card(child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 12),
                    _AttRow('Working Days', '${p.workingDays}'),
                    _AttRow('Present Days', '${p.presentDays}'),
                    _AttRow('Half Days', '${p.halfDays}'),
                    _AttRow('Leave Days', '${p.leaveDays}'),
                    _AttRow('LWP Days', '${p.lopDays}'),
                    _AttRow('Payable Days', p.payableDays.toStringAsFixed(1), bold: true),
                  ],
                ),
              )),
              const SizedBox(height: 12),

              // Earnings
              if (p.earnings.isNotEmpty) ...[
                Card(child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Earnings', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      const SizedBox(height: 12),
                      ...p.earnings.entries.map((e) => _SalaryRow(e.key, e.value)),
                      const Divider(),
                      _SalaryRow('Gross Salary', p.grossSalary, bold: true),
                    ],
                  ),
                )),
                const SizedBox(height: 12),
              ],

              // Deductions
              if (p.deductionBreakdown.isNotEmpty) ...[
                Card(child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Deductions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      const SizedBox(height: 12),
                      ...p.deductionBreakdown.entries.map((e) => _SalaryRow(e.key, e.value, negative: true)),
                      const Divider(),
                      _SalaryRow('Total Deductions', p.deductions, bold: true, negative: true),
                    ],
                  ),
                )),
                const SizedBox(height: 12),
              ],

              // Net salary
              Card(
                color: const Color(0xFFEFF6FF),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('Net Salary', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    Text('₹${p.netSalary.toStringAsFixed(2)}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold, color: const Color(0xFF2563EB))),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmtYearMonth(String ym) {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    try { final p = ym.split('-'); return '${months[int.parse(p[1])]} ${p[0]}'; }
    catch (_) { return ym; }
  }
}

class _AttRow extends StatelessWidget {
  const _AttRow(this.label, this.value, {this.bold = false});
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: TextStyle(color: Colors.grey[700])),
      Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
    ]),
  );
}

class _SalaryRow extends StatelessWidget {
  const _SalaryRow(this.label, this.amount, {this.bold = false, this.negative = false});
  final String label;
  final double amount;
  final bool bold;
  final bool negative;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label.replaceAll('_', ' '), style: TextStyle(color: bold ? null : Colors.grey[700])),
      Text('${negative ? '- ' : ''}₹${amount.toStringAsFixed(2)}', style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, color: negative && !bold ? const Color(0xFFDC2626) : null)),
    ]),
  );
}
