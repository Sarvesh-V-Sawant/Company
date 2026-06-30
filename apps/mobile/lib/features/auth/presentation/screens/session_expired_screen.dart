import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/router/route_names.dart';
import '../../../../core/storage/secure_storage.dart';
import '../../../../shared/widgets/app_button.dart';

class SessionExpiredScreen extends ConsumerWidget {
  const SessionExpiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.lock_outline, size: 64, color: Color(0xFF2563EB)),
              const SizedBox(height: 24),
              Text('Session Expired', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              const Text(
                'Your session has expired or was revoked. Please sign in again.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              AppButton(
                label: 'Sign In Again',
                onPressed: () async {
                  await SecureStorageService.clearSession();
                  ref.read(sessionExpiredProvider.notifier).state = false;
                  if (context.mounted) context.go(RouteNames.login);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
