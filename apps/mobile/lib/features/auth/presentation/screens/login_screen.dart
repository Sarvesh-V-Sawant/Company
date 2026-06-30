import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_text_field.dart';
import '../providers/auth_provider.dart';
import '../../data/repositories/auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  String? _validateEmail(String v) {
    if (v.isEmpty) return 'Email is required';
    if (!v.contains('@')) return 'Enter a valid email';
    return null;
  }

  String? _validatePassword(String v) {
    if (v.isEmpty) return 'Password is required';
    return null;
  }

  Future<void> _submit() async {
    // PHASE 15.18 DIAGNOSTIC
    // ignore: avoid_print
    print('[DIAG][UI] Sign In button pressed');
    final emailError = _validateEmail(_emailCtrl.text.trim());
    final passError = _validatePassword(_passwordCtrl.text);
    if (emailError != null || passError != null) {
      // ignore: avoid_print
      print('[DIAG][UI] Validation failed: emailError=$emailError  passError=$passError');
      setState(() => _errorMessage = emailError ?? passError);
      return;
    }

    // ignore: avoid_print
    print('[DIAG][UI] Validation passed. Setting _loading=true');
    setState(() { _loading = true; _errorMessage = null; });

    try {
      // ignore: avoid_print
      print('[DIAG][UI] Calling authProvider.notifier.login()');
      final result = await ref.read(authProvider.notifier).login(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      // ignore: avoid_print
      print('[DIAG][UI] authProvider.login() returned. requiresPasswordChange=${result.requiresPasswordChange}');

      if (!mounted) return;

      if (result.requiresPasswordChange) {
        // ignore: avoid_print
        print('[DIAG][NAV] navigating to ${RouteNames.changePassword}');
        context.go(RouteNames.changePassword);
      } else {
        // ignore: avoid_print
        print('[DIAG][NAV] navigating to ${RouteNames.home}');
        context.go(RouteNames.home);
      }
    } on DeviceMismatchException catch (e) {
      // ignore: avoid_print
      print('[DIAG][UI] DeviceMismatchException: code=${e.code}');
      if (!mounted) return;
      // AUTH_004 = DEVICE_NOT_REGISTERED; AUTH_005 = DEVICE_FINGERPRINT_MISMATCH
      if (e.code == 'AUTH_004') {
        // ignore: avoid_print
        print('[DIAG][NAV] navigating to ${RouteNames.deviceNotRegistered}');
        context.go(RouteNames.deviceNotRegistered, extra: {'email': _emailCtrl.text.trim()});
      } else {
        // ignore: avoid_print
        print('[DIAG][NAV] navigating to ${RouteNames.deviceMismatch}');
        context.go(RouteNames.deviceMismatch, extra: {'email': _emailCtrl.text.trim()});
      }
    } on AuthException catch (e) {
      // ignore: avoid_print
      print('[DIAG][UI] AuthException: code=${e.code}  message=${e.message}');
      if (!mounted) return;
      setState(() => _errorMessage = _mapErrorCode(e.code));
    } catch (e, stack) {
      // ignore: avoid_print
      print('[DIAG][UI] catch(_) generic exception: ${e.runtimeType} $e');
      // ignore: avoid_print
      print('[DIAG][UI] stack:\n$stack');
      if (!mounted) return;
      setState(() => _errorMessage = 'No connection. Check your network.');
    } finally {
      // ignore: avoid_print
      print('[DIAG][UI] finally block. mounted=$mounted');
      if (mounted) setState(() => _loading = false);
    }
  }

  String _mapErrorCode(String code) => switch (code) {
    'AUTH_001' => 'Invalid email or password.',
    'AUTH_002' => 'Too many attempts. Try again later.',
    'AUTH_007' => 'Account deactivated. Contact your admin.',
    _ => 'Login failed. Please try again.',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 48),
              const Icon(Icons.hexagon_outlined, size: 56, color: Color(0xFF2563EB)),
              const SizedBox(height: 12),
              Text('Genesis Workforce', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              Text('Genesis', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey)),
              const SizedBox(height: 48),

              if (_errorMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEE2E2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFB91C1C), size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_errorMessage!, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 14))),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              AppTextField(
                controller: _emailCtrl,
                label: 'Email',
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                textInputAction: TextInputAction.next,
                enabled: !_loading,
              ),
              const SizedBox(height: 16),

              AppTextField(
                controller: _passwordCtrl,
                label: 'Password',
                obscureText: _obscurePassword,
                autofillHints: const [AutofillHints.password],
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                enabled: !_loading,
                suffix: IconButton(
                  icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  tooltip: _obscurePassword ? 'Show password' : 'Hide password',
                ),
              ),
              const SizedBox(height: 24),

              AppButton(label: 'Sign In', onPressed: _submit, loading: _loading),
              const SizedBox(height: 12),

              TextButton(
                onPressed: _loading ? null : () => context.push(RouteNames.forgotPassword),
                child: const Text('Forgot your password?'),
              ),

              const SizedBox(height: 48),
              Text('v1.0.0 · Build 1', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
            ],
          ),
        ),
      ),
    );
  }
}
