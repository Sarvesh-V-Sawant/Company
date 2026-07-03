import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/models/notification.dart';
import '../../../../shared/widgets/error_widget.dart';
import '../../../../core/router/route_names.dart';
import '../../../../shared/widgets/loading_overlay.dart';
import '../providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationsSourceProvider).markAllRead();
              ref.invalidate(notificationsProvider);
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: async.when(
        loading: () => ListView.builder(itemCount: 8, itemBuilder: (_, __) => const ShimmerListTile()),
        error: (_, __) => AppErrorWidget(message: 'Could not load notifications. Check your connection.', onRetry: () => ref.refresh(notificationsProvider.future)),
        data: (notifications) {
          if (notifications.isEmpty) return const Center(child: Text('No notifications.'));
          return RefreshIndicator(
            onRefresh: () => ref.refresh(notificationsProvider.future),
            child: ListView.separated(
              itemCount: notifications.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) => _NotificationTile(
                notification: notifications[i],
                onTap: () async {
                  final n = notifications[i];
                  if (!n.isRead) {
                    await ref.read(notificationsSourceProvider).markRead(n.id);
                    ref.invalidate(notificationsProvider);
                  }
                  if (context.mounted) _navigate(context, n);
                },
              ),
            ),
          );
        },
      ),
    );
  }

  void _navigate(BuildContext context, AppNotification n) {
    switch (n.type) {
      case 'leave_approved':
      case 'leave_rejected':
        if (n.referenceId != null) {
          context.push(RouteNames.leaveDetail(n.referenceId!));
        } else {
          context.push(RouteNames.notificationDetail(n.id));
        }
      case 'reg_approved':
      case 'reg_rejected':
        if (n.referenceId != null) {
          context.push(RouteNames.regularizationDetail(n.referenceId!));
        } else {
          context.push(RouteNames.notificationDetail(n.id));
        }
      case 'attendance_reminder':
        context.go(RouteNames.home);
      default:
        context.push(RouteNames.notificationDetail(n.id));
    }
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});
  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final createdAt = DateTime.tryParse(notification.createdAt)?.toLocal();
    return ListTile(
      onTap: onTap,
      tileColor: notification.isRead ? null : const Color(0xFFEFF6FF),
      leading: CircleAvatar(
        backgroundColor: notification.isRead ? const Color(0xFFF3F4F6) : const Color(0xFFDBEAFE),
        child: Icon(_iconFor(notification.type), size: 20, color: notification.isRead ? Colors.grey : const Color(0xFF2563EB)),
      ),
      title: Text(notification.title, style: TextStyle(fontWeight: notification.isRead ? FontWeight.normal : FontWeight.w600)),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(notification.body, maxLines: 2, overflow: TextOverflow.ellipsis),
        if (createdAt != null) Text(DateFormat('dd MMM · HH:mm').format(createdAt), style: const TextStyle(fontSize: 11, color: Colors.grey)),
      ]),
    );
  }

  IconData _iconFor(String type) => switch (type) {
    'leave_approved' || 'leave_rejected' => Icons.beach_access,
    'reg_approved' || 'reg_rejected' => Icons.history,
    'attendance_reminder' => Icons.timer,
    _ => Icons.notifications,
  };
}
