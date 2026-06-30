import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../../../core/constants/storage_keys.dart';
import '../../../../core/router/route_names.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_text_field.dart';
import '../../providers/device_request_provider.dart';

class DeviceNotRegisteredScreen extends ConsumerStatefulWidget {
  final String? email;
  const DeviceNotRegisteredScreen({super.key, this.email});

  @override
  ConsumerState<DeviceNotRegisteredScreen> createState() => _DeviceNotRegisteredScreenState();
}

class _DeviceNotRegisteredScreenState extends ConsumerState<DeviceNotRegisteredScreen> {
  String? _fingerprint;
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadFingerprint();
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadFingerprint() async {
    final fp = await SecureStorageService.read(StorageKeys.deviceHash);
    if (mounted) setState(() => _fingerprint = fp);
  }

  Future<void> _copyCode() async {
    if (_fingerprint == null) return;
    await Clipboard.setData(ClipboardData(text: _fingerprint!));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fingerprint copied.')));
  }

  String get _displayFingerprint {
    if (_fingerprint == null) return '...';
    return '${_fingerprint!.substring(0, 16)}…';
  }

  Future<Map<String, dynamic>> _collectDeviceInfo() async {
    // Capture context-dependent values before async gaps
    final size = MediaQuery.of(context).size;
    final locale = WidgetsBinding.instance.platformDispatcher.locale.toLanguageTag();

    final deviceInfo = DeviceInfoPlugin();
    final android = await deviceInfo.androidInfo;
    final packageInfo = await PackageInfo.fromPlatform();

    return {
      'deviceName':       android.model,
      'manufacturer':     android.manufacturer,
      'deviceModel':      android.model,
      'androidVersion':   android.version.release,
      'appVersion':       packageInfo.version,
      'buildNumber':      packageInfo.buildNumber,
      'timezone':         DateTime.now().timeZoneName,
      'language':         locale,
      'screenResolution': '${size.width.round()}x${size.height.round()}',
      'platform':         'android',
    };
  }

  Future<void> _requestApproval() async {
    final email = widget.email;
    if (email == null || email.isEmpty) {
      setState(() => _errorMessage = 'Email not found. Please go back and log in again.');
      return;
    }
    if (_passwordCtrl.text.isEmpty) {
      setState(() => _errorMessage = 'Password is required.');
      return;
    }
    if (_fingerprint == null) {
      setState(() => _errorMessage = 'Device fingerprint not available. Please try again.');
      return;
    }

    setState(() => _errorMessage = null);

    final deviceInfo = await _collectDeviceInfo();
    await ref.read(deviceRequestProvider.notifier).submitRequest(
      email: email,
      password: _passwordCtrl.text,
      deviceFingerprint: _fingerprint!,
      deviceInfo: deviceInfo,
    );

    if (!mounted) return;

    final status = ref.read(deviceRequestProvider).status;
    if (status == DeviceRequestStatus.approved) {
      context.go(RouteNames.login);
    } else if (status == DeviceRequestStatus.pending) {
      context.go(RouteNames.deviceAwaitingRegistration, extra: {'email': email});
    } else if (status == DeviceRequestStatus.error) {
      final msg = ref.read(deviceRequestProvider).errorMessage ?? 'Request failed.';
      setState(() => _errorMessage = _friendlyError(msg));
    }
  }

  String _friendlyError(String raw) {
    if (raw.contains('AUTH_001')) return 'Invalid password.';
    if (raw.contains('GEN_003')) return 'Too many requests. Try again later.';
    if (raw.contains('rate limit')) return 'Too many requests. Try again later.';
    return 'Failed to submit request. Check your connection.';
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(deviceRequestProvider);
    final isLoading = state.status == DeviceRequestStatus.submitting;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              const Icon(Icons.phone_android, size: 64, color: Color(0xFF2563EB)),
              const SizedBox(height: 24),
              Text(
                'Device Not Registered',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Your device needs to be registered before you can use this app.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // Fingerprint display
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(_displayFingerprint, style: const TextStyle(fontFamily: 'monospace', fontSize: 14))),
                    TextButton(onPressed: _copyCode, child: const Text('Copy')),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Error
              if (_errorMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)),
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

              // Request approval section
              if (widget.email != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0F9FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBAE6FD)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Request Approval', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                      const SizedBox(height: 8),
                      const Text('Enter your password to submit a device registration request to your admin.', style: TextStyle(fontSize: 13, color: Color(0xFF374151))),
                      const SizedBox(height: 16),
                      AppTextField(
                        controller: _passwordCtrl,
                        label: 'Password',
                        obscureText: _obscure,
                        enabled: !isLoading,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _requestApproval(),
                        suffix: IconButton(
                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      const SizedBox(height: 12),
                      AppButton(
                        label: 'Request Approval',
                        onPressed: _requestApproval,
                        loading: isLoading,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Fallback: notify admin manually
              AppButton(
                label: "I've Notified My Admin",
                variant: AppButtonVariant.outline,
                onPressed: isLoading ? null : () => context.go(
                  RouteNames.deviceAwaitingRegistration,
                  extra: widget.email != null ? {'email': widget.email} : null,
                ),
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Back to Sign In',
                variant: AppButtonVariant.outline,
                onPressed: isLoading ? null : () => context.go(RouteNames.login),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
