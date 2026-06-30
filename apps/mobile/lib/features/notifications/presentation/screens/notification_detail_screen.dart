import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/models/notification.dart';
import '../../../../core/router/route_names.dart';
import '../providers/notifications_provider.dart';

class NotificationDetailScreen extends ConsumerStatefulWidget {
  const NotificationDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<NotificationDetailScreen> createState() => _NotificationDetailScreenState();
}

class _NotificationDetailScreenState extends ConsumerState<NotificationDetailScreen> {
  AppNotification? _notification;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await ref.read(notificationsProvider.future);
      final found = list.cast<AppNotification?>().firstWhere(
        (n) => n?.id == widget.id,
        orElse: () => null,
      );
      if (!mounted) return;
      if (found == null) {
        setState(() { _loading = false; _error = 'Notification not found.'; });
      } else {
        // Mark as read if not already
        if (!found.isRead) {
          await ref.read(notificationsSourceProvider).markRead(found.id);
          ref.invalidate(notificationsProvider);
        }
        setState(() { _notification = found; _loading = false; });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = 'Failed to load notification.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notification')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.grey)))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final n = _notification!;
    final createdAt = DateTime.tryParse(n.createdAt)?.toLocal();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: const Color(0xFFDBEAFE),
                child: Icon(_iconFor(n.type), color: const Color(0xFF2563EB)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    if (createdAt != null)
                      Text(
                        DateFormat('dd MMM yyyy · HH:mm').format(createdAt),
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Divider(),
          const SizedBox(height: 16),
          Text(n.body, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 24),
          if (_hasAction(n)) _buildActionButton(n),
        ],
      ),
    );
  }

  bool _hasAction(AppNotification n) {
    if (n.type == 'attendance_reminder') return true;
    return n.referenceId != null &&
        (n.type.startsWith('leave_') || n.type.startsWith('reg_'));
  }

  Widget _buildActionButton(AppNotification n) {
    String label;
    VoidCallback onTap;
    switch (n.type) {
      case 'leave_approved':
      case 'leave_rejected':
        label = 'View Leave Request';
        onTap = () => context.push(RouteNames.leaveDetail(n.referenceId!));
      case 'reg_approved':
      case 'reg_rejected':
        label = 'View Regularization';
        onTap = () => context.push(RouteNames.regularizationDetail(n.referenceId!));
      case 'attendance_reminder':
        label = 'Go to Home';
        onTap = () => context.go(RouteNames.home);
      default:
        return const SizedBox.shrink();
    }
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(onPressed: onTap, child: Text(label)),
    );
  }

  IconData _iconFor(String type) => switch (type) {
    'leave_approved' || 'leave_rejected' => Icons.beach_access,
    'reg_approved' || 'reg_rejected' => Icons.history,
    'attendance_reminder' => Icons.timer,
    _ => Icons.notifications,
  };
}
