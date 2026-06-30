import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/app_button.dart';
import '../providers/auth_provider.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.token, this.email = ''});
  final String token;
  final String email;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _loading = false;
  bool _tokenExpired = false;

  @override
  void dispose() {
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  bool get _hasLength => _newCtrl.text.length >= 8;
  bool get _hasUpper => _newCtrl.text.contains(RegExp(r'[A-Z]'));
  bool get _hasDigit => _newCtrl.text.contains(RegExp(r'[0-9]'));

  Future<void> _submit() async {
    if (!_hasLength || !_hasUpper || !_hasDigit) return;
    if (_newCtrl.text != _confirmCtrl.text) return;

    setState(() => _loading = true);
    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.resetPassword(
        token: widget.token,
        email: widget.email,
        newPassword: _newCtrl.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated.')));
      context.go(RouteNames.login);
    } catch (e) {
      if (!mounted) return;
      final isExpired = e.toString().contains('AUTH_009') || e.toString().contains('expired');
      setState(() { _loading = false; if (isExpired) _tokenExpired = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_tokenExpired) {
      return Scaffold(
        appBar: AppBar(title: const Text('Set New Password')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.warning_amber_outlined, size: 56, color: Color(0xFFD97706)),
              const SizedBox(height: 16),
              Text('Link Expired', style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              const Text('This reset link has expired or been used.', textAlign: TextAlign.center),
              const SizedBox(height: 24),
              AppButton(label: 'Request New Link', onPressed: () => context.go(RouteNames.forgotPassword)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Set New Password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _newCtrl,
                obscureText: _obscureNew,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'New Password',
                  suffixIcon: IconButton(icon: Icon(_obscureNew ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscureNew = !_obscureNew)),
                ),
              ),
              const SizedBox(height: 8),
              _Req(met: _hasLength, label: 'At least 8 characters'),
              _Req(met: _hasUpper, label: 'One uppercase letter'),
              _Req(met: _hasDigit, label: 'One number'),
              const SizedBox(height: 16),
              TextFormField(
                controller: _confirmCtrl,
                obscureText: _obscureConfirm,
                decoration: InputDecoration(
                  labelText: 'Confirm Password',
                  errorText: _confirmCtrl.text.isNotEmpty && _newCtrl.text != _confirmCtrl.text ? 'Passwords do not match' : null,
                  suffixIcon: IconButton(icon: Icon(_obscureConfirm ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm)),
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 24),
              AppButton(label: 'Update Password', onPressed: _submit, loading: _loading),
            ],
          ),
        ),
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
