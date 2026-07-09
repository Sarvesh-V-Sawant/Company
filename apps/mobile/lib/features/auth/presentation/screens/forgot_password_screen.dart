import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../shared/widgets/app_button.dart';
import '../providers/auth_provider.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  bool _loading = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authRepositoryProvider).forgotPassword(email);
      if (mounted) setState(() { _sent = true; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = 'Too many requests. Wait 1 hour.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot Password')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _sent ? _SuccessView(onBack: () => context.pop()) : _FormView(
            emailCtrl: _emailCtrl,
            loading: _loading,
            error: _error,
            onSubmit: _submit,
          ),
        ),
      ),
    );
  }
}

class _FormView extends StatelessWidget {
  const _FormView({required this.emailCtrl, required this.loading, this.error, required this.onSubmit});
  final TextEditingController emailCtrl;
  final bool loading;
  final String? error;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text("Enter your email address and we'll send a reset link.", style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 24),
        if (error != null) ...[
          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)), child: Text(error!, style: const TextStyle(color: Color(0xFFB91C1C)))),
          const SizedBox(height: 16),
        ],
        TextFormField(controller: emailCtrl, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 24),
        AppButton(label: 'Send Reset Link', onPressed: onSubmit, loading: loading),
      ],
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.check_circle_outline, size: 56, color: Color(0xFF16A34A)),
        const SizedBox(height: 16),
        Text('Check Your Email', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
        const SizedBox(height: 12),
        const Text(
          'If an account exists for that email, a link has been sent. Check inbox and spam folder. Link expires in 1 hour.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        AppButton(label: 'Back to Sign In', onPressed: onBack, variant: AppButtonVariant.outline),
      ],
    );
  }
}
