import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/storage_keys.dart';
import '../../../../core/router/route_names.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../providers/device_request_provider.dart';

class DeviceAwaitingRegistrationScreen extends ConsumerStatefulWidget {
  final String? email;
  const DeviceAwaitingRegistrationScreen({super.key, this.email});

  @override
  ConsumerState<DeviceAwaitingRegistrationScreen> createState() => _DeviceAwaitingRegistrationScreenState();
}

class _DeviceAwaitingRegistrationScreenState extends ConsumerState<DeviceAwaitingRegistrationScreen> {
  String? _fingerprint;

  @override
  void initState() {
    super.initState();
    SecureStorageService.read(StorageKeys.deviceHash).then((v) {
      if (mounted) setState(() => _fingerprint = v);
    });

    // Start polling if we have the email
    if (widget.email != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_fingerprint != null) {
          ref.read(deviceRequestProvider.notifier).startPollingExisting(
            email: widget.email!,
            deviceFingerprint: _fingerprint!,
          );
        }
        // Re-check once fingerprint loads if not ready yet
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Kick off polling once fingerprint is available
    if (widget.email != null && _fingerprint != null) {
      final status = ref.read(deviceRequestProvider).status;
      if (status == DeviceRequestStatus.idle) {
        ref.read(deviceRequestProvider.notifier).startPollingExisting(
          email: widget.email!,
          deviceFingerprint: _fingerprint!,
        );
      }
    }
  }

  Future<void> _copy() async {
    if (_fingerprint == null) return;
    await Clipboard.setData(ClipboardData(text: _fingerprint!));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fingerprint copied.')));
  }

  Future<void> _checkNow() async {
    if (widget.email != null) {
      await ref.read(deviceRequestProvider.notifier).pollOnce(email: widget.email!);
    }
  }

  String get _display => _fingerprint != null ? '${_fingerprint!.substring(0, 16)}…' : '...';

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(deviceRequestProvider);

    // Navigate on status change
    if (state.status == DeviceRequestStatus.approved) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Device approved! You can now sign in.')),
          );
          context.go(RouteNames.login);
        }
      });
    } else if (state.status == DeviceRequestStatus.rejected) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go(RouteNames.deviceMismatch);
      });
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.hourglass_empty, size: 64, color: Color(0xFFD97706)),
              const SizedBox(height: 24),
              Text(
                'Waiting for Approval',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Your device registration request has been sent to your admin.\nYou will be notified automatically when approved.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text('Device code: $_display', style: const TextStyle(fontFamily: 'monospace'))),
                    IconButton(icon: const Icon(Icons.copy, size: 18), onPressed: _copy, tooltip: 'Copy'),
                  ],
                ),
              ),
              if (state.status == DeviceRequestStatus.pending || state.status == DeviceRequestStatus.idle) ...[
                const SizedBox(height: 16),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                    SizedBox(width: 8),
                    Text('Checking every 30 seconds…', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ],
                ),
              ],
              const SizedBox(height: 24),
              AppButton(label: 'Check Now', onPressed: _checkNow),
              const SizedBox(height: 12),
              AppButton(label: 'Back to Sign In', variant: AppButtonVariant.outline, onPressed: () => context.go(RouteNames.login)),
            ],
          ),
        ),
      ),
    );
  }
}
