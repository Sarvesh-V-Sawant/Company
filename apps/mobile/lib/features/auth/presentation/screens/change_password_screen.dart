import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/app_button.dart';
import '../providers/auth_provider.dart';

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _currentPasswordCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    super.dispose();
  }

  bool get _hasLength => _newPasswordCtrl.text.length >= 8;
  bool get _hasUpper => _newPasswordCtrl.text.contains(RegExp(r'[A-Z]'));
  bool get _hasDigit => _newPasswordCtrl.text.contains(RegExp(r'[0-9]'));

  Future<void> _submit() async {
    if (_currentPasswordCtrl.text.isEmpty) {
      setState(() => _error = 'Enter your current password.');
      return;
    }
    if (!_hasLength || !_hasUpper || !_hasDigit) {
      setState(() => _error = 'Password does not meet requirements.');
      return;
    }
    if (_newPasswordCtrl.text != _confirmPasswordCtrl.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).changePassword(_currentPasswordCtrl.text, _newPasswordCtrl.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated!')));
      context.go(RouteNames.home);
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().contains('AUTH_001') ? 'Current password is incorrect.' : 'Failed to update password. Try again.';
      setState(() { _loading = false; _error = msg; });
    }
  }

  Future<void> _logout() async {
    await ref.read(authProvider.notifier).logout();
    if (!mounted) return;
    context.go(RouteNames.login);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Genesis Workforce'),
          automaticallyImplyLeading: false,
          actions: [TextButton(onPressed: _logout, child: const Text('Logout'))],
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: Color(0xFF2563EB)),
                const SizedBox(height: 16),
                Text('Password Change Required', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text('You must set a new password to continue.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600])),
                const SizedBox(height: 32),

                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)),
                    child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C))),
                  ),
                  const SizedBox(height: 16),
                ],

                _PasswordField(controller: _currentPasswordCtrl, label: 'Current Password', obscure: _obscureCurrent, onToggle: () => setState(() => _obscureCurrent = !_obscureCurrent), enabled: !_loading),
                const SizedBox(height: 16),
                _PasswordField(controller: _newPasswordCtrl, label: 'New Password', obscure: _obscureNew, onToggle: () => setState(() => _obscureNew = !_obscureNew), onChanged: (_) => setState(() {}), enabled: !_loading),
                const SizedBox(height: 8),
                _Requirement(met: _hasLength, label: 'At least 8 characters'),
                _Requirement(met: _hasUpper, label: 'One uppercase letter'),
                _Requirement(met: _hasDigit, label: 'One number'),
                const SizedBox(height: 16),

                _PasswordField(controller: _confirmPasswordCtrl, label: 'Confirm Password', obscure: _obscureConfirm, onToggle: () => setState(() => _obscureConfirm = !_obscureConfirm), enabled: !_loading),
                const SizedBox(height: 24),

                AppButton(label: 'Update Password', onPressed: _submit, loading: _loading),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PasswordField extends StatelessWidget {
  const _PasswordField({required this.controller, required this.label, required this.obscure, required this.onToggle, this.onChanged, this.enabled = true});
  final TextEditingController controller;
  final String label;
  final bool obscure;
  final VoidCallback onToggle;
  final ValueChanged<String>? onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      onChanged: onChanged,
      enabled: enabled,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: IconButton(icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: onToggle),
      ),
    );
  }
}

class _Requirement extends StatelessWidget {
  const _Requirement({required this.met, required this.label});
  final bool met;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(met ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: met ? const Color(0xFF16A34A) : Colors.grey),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 13, color: met ? const Color(0xFF16A34A) : Colors.grey[600])),
      ],
    );
  }
}
