import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/router/route_names.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          // Avatar + name header
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: const Color(0xFF2563EB),
                child: Text(user?.initials ?? '?', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 12),
              Text(user?.fullName ?? '—', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              Text(user?.email ?? '—', style: const TextStyle(color: Colors.grey)),
              if (user?.designation != null) Text(user!.designation!, style: const TextStyle(color: Colors.grey)),
            ]),
          ),
          const SizedBox(height: 8),

          // Info
          if (user != null) ...[
            _InfoTile(label: 'Employee ID', value: user.employeeId),
            if (user.department != null) _InfoTile(label: 'Department', value: user.department!),
            if (user.phone != null) _InfoTile(label: 'Phone', value: user.phone!),
          ],
          const Divider(),

          // Actions
          ListTile(
            leading: const Icon(Icons.lock_outline),
            title: const Text('Change Password'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.profileChangePassword),
          ),
          ListTile(
            leading: const Icon(Icons.phone_android),
            title: const Text('Device Information'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.profileDevice),
          ),
          ListTile(
            leading: const Icon(Icons.receipt_long_outlined),
            title: const Text('My Payslips'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.payslip),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Sign Out', style: TextStyle(color: Colors.red)),
            onTap: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Sign Out?'),
                  content: const Text('You will need to sign in again.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                    TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign Out')),
                  ],
                ),
              );
              if (confirm != true) return;
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go(RouteNames.login);
            },
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => ListTile(
    title: Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
    subtitle: Text(value, style: const TextStyle(fontSize: 15, color: Colors.black87)),
    dense: true,
  );
}
