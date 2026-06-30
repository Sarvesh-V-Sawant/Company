import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/storage_keys.dart';
import '../../../../core/router/route_names.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/app_button.dart';

class DeviceMismatchScreen extends StatefulWidget {
  const DeviceMismatchScreen({super.key, this.isReset = false, this.email});
  final bool isReset;
  final String? email;

  @override
  State<DeviceMismatchScreen> createState() => _DeviceMismatchScreenState();
}

class _DeviceMismatchScreenState extends State<DeviceMismatchScreen> {
  String? _fingerprint;

  @override
  void initState() {
    super.initState();
    SecureStorageService.read(StorageKeys.deviceHash).then((v) {
      if (mounted) setState(() => _fingerprint = v);
    });
  }

  Future<void> _copy() async {
    if (_fingerprint == null) return;
    await Clipboard.setData(ClipboardData(text: _fingerprint!));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fingerprint copied.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(widget.isReset ? Icons.restart_alt : Icons.device_unknown, size: 64, color: const Color(0xFFDC2626)),
              const SizedBox(height: 24),
              Text(
                widget.isReset ? 'Device Registration Reset' : 'Device Mismatch',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                widget.isReset
                    ? 'Your admin has reset your device registration. You need to register this device.'
                    : 'This account is registered to a different device. You can request a replacement.',
                textAlign: TextAlign.center,
              ),
              if (_fingerprint != null) ...[
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFE5E7EB))),
                  child: Row(
                    children: [
                      Expanded(child: Text('${_fingerprint!.substring(0, 16)}…', style: const TextStyle(fontFamily: 'monospace'))),
                      IconButton(icon: const Icon(Icons.copy, size: 18), onPressed: _copy),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 32),
              // Request replacement/registration via the NotRegistered flow
              AppButton(
                label: widget.isReset ? 'Register This Device' : 'Request Replacement',
                onPressed: () => context.go(
                  RouteNames.deviceNotRegistered,
                  extra: widget.email != null ? {'email': widget.email} : null,
                ),
              ),
              const SizedBox(height: 12),
              AppButton(label: 'Try Again', variant: AppButtonVariant.outline, onPressed: () => context.go(RouteNames.login)),
            ],
          ),
        ),
      ),
    );
  }
}
