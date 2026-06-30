import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

class ProfileChangePasswordScreen extends ConsumerStatefulWidget {
  const ProfileChangePasswordScreen({super.key});

  @override
  ConsumerState<ProfileChangePasswordScreen> createState() => _ProfileChangePasswordScreenState();
}

class _ProfileChangePasswordScreenState extends ConsumerState<ProfileChangePasswordScreen> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() { _currentCtrl.dispose(); _newCtrl.dispose(); _confirmCtrl.dispose(); super.dispose(); }

  bool get _hasLength => _newCtrl.text.length >= 8;
  bool get _hasUpper => _newCtrl.text.contains(RegExp(r'[A-Z]'));
  bool get _hasDigit => _newCtrl.text.contains(RegExp(r'[0-9]'));

  Future<void> _submit() async {
    if (_currentCtrl.text.isEmpty) { setState(() => _error = 'Enter your current password.'); return; }
    if (!_hasLength || !_hasUpper || !_hasDigit) { setState(() => _error = 'Password does not meet requirements.'); return; }
    if (_newCtrl.text != _confirmCtrl.text) { setState(() => _error = 'Passwords do not match.'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).changePassword(_currentCtrl.text, _newCtrl.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated.')));
      context.pop();
    } catch (e) {
      final msg = e.toString().contains('AUTH_001') ? 'Current password is incorrect.' : 'Failed to update. Try again.';
      setState(() { _loading = false; _error = msg; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Change Password')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_error != null) ...[
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)), child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C)))),
            const SizedBox(height: 12),
          ],
          TextFormField(controller: _currentCtrl, obscureText: _obscureCurrent, decoration: InputDecoration(labelText: 'Current Password', suffixIcon: IconButton(icon: Icon(_obscureCurrent ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscureCurrent = !_obscureCurrent)))),
          const SizedBox(height: 16),
          TextFormField(controller: _newCtrl, obscureText: _obscureNew, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: 'New Password', suffixIcon: IconButton(icon: Icon(_obscureNew ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscureNew = !_obscureNew)))),
          const SizedBox(height: 8),
          _Req(met: _hasLength, label: 'At least 8 characters'),
          _Req(met: _hasUpper, label: 'One uppercase letter'),
          _Req(met: _hasDigit, label: 'One number'),
          const SizedBox(height: 16),
          TextFormField(controller: _confirmCtrl, obscureText: _obscureConfirm, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: 'Confirm Password', suffixIcon: IconButton(icon: Icon(_obscureConfirm ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm)))),
          const SizedBox(height: 24),
          AppButton(label: 'Update Password', onPressed: _submit, loading: _loading),
        ]),
      ),
    );
  }
}

class _Req extends StatelessWidget {
  const _Req({required this.met, required this.label});
  final bool met;
  final String label;

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(met ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: met ? const Color(0xFF16A34A) : Colors.grey),
    const SizedBox(width: 8),
    Text(label, style: TextStyle(fontSize: 13, color: met ? const Color(0xFF16A34A) : Colors.grey[600])),
  ]);
}
