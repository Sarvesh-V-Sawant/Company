import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../shared/widgets/app_button.dart';
import '../providers/regularization_provider.dart';

class RegularizationCreateScreen extends ConsumerStatefulWidget {
  const RegularizationCreateScreen({super.key, this.initialDate});
  final String? initialDate;

  @override
  ConsumerState<RegularizationCreateScreen> createState() => _RegularizationCreateScreenState();
}

class _RegularizationCreateScreenState extends ConsumerState<RegularizationCreateScreen> {
  final _reasonCtrl = TextEditingController();
  String _type = 'missed_punch';
  DateTime? _date;
  TimeOfDay? _checkIn;
  TimeOfDay? _checkOut;
  bool _loading = false;
  String? _error;

  static const _types = [
    ('missed_punch', 'Missed Punch'),
    ('wfh', 'Work From Home'),
    ('outdoor_duty', 'Outdoor Duty'),
  ];

  @override
  void initState() {
    super.initState();
    if (widget.initialDate != null) {
      _date = DateTime.tryParse(widget.initialDate!);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 7)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime(bool isCheckIn) async {
    final picked = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (picked == null) return;
    setState(() {
      if (isCheckIn) { _checkIn = picked; } else { _checkOut = picked; }
    });
  }

  String _fmtTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_date == null) { setState(() => _error = 'Select a date.'); return; }
    if (_reasonCtrl.text.trim().isEmpty) { setState(() => _error = 'Reason is required.'); return; }

    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(regularizationSourceProvider).create(
        date: DateFormat('yyyy-MM-dd').format(_date!),
        type: _type,
        reason: _reasonCtrl.text.trim(),
        requestedCheckIn: _checkIn != null ? _fmtTime(_checkIn!) : null,
        requestedCheckOut: _checkOut != null ? _fmtTime(_checkOut!) : null,
      );
      ref.invalidate(regularizationHistoryProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Regularization request submitted.')));
      context.pop();
    } catch (_) {
      setState(() { _loading = false; _error = 'Submission failed. Please try again.'; });
    }
  }

  @override
  void dispose() { _reasonCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    return Scaffold(
      appBar: AppBar(title: const Text('New Regularization')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)), child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C)))),
              const SizedBox(height: 12),
            ],

            const Text('Date', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            InkWell(
              onTap: _pickDate,
              child: InputDecorator(decoration: const InputDecoration(), child: Text(_date != null ? fmt.format(_date!) : 'Select date', style: TextStyle(color: _date != null ? null : Colors.grey))),
            ),
            const SizedBox(height: 16),

            const Text('Type', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _type,
              decoration: const InputDecoration(),
              items: _types.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2))).toList(),
              onChanged: (v) => setState(() => _type = v!),
            ),
            const SizedBox(height: 16),

            if (_type == 'missed_punch') ...[
              Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Check-In Time', style: TextStyle(fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  InkWell(onTap: () => _pickTime(true), child: InputDecorator(decoration: const InputDecoration(), child: Text(_checkIn != null ? _fmtTime(_checkIn!) : 'Select', style: TextStyle(color: _checkIn != null ? null : Colors.grey)))),
                ])),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Check-Out Time', style: TextStyle(fontWeight: FontWeight.w500)),
                  const SizedBox(height: 6),
                  InkWell(onTap: () => _pickTime(false), child: InputDecorator(decoration: const InputDecoration(), child: Text(_checkOut != null ? _fmtTime(_checkOut!) : 'Select', style: TextStyle(color: _checkOut != null ? null : Colors.grey)))),
                ])),
              ]),
              const SizedBox(height: 16),
            ],

            const Text('Reason', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            TextFormField(controller: _reasonCtrl, maxLines: 3, decoration: const InputDecoration(hintText: 'Explain why you need regularization...')),
            const SizedBox(height: 24),
            AppButton(label: 'Submit Request', onPressed: _submit, loading: _loading),
          ],
        ),
      ),
    );
  }
}
