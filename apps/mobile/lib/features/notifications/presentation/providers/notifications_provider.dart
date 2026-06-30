import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/models/notification.dart';
import '../../data/sources/notifications_remote_source.dart';

final notificationsSourceProvider = Provider<NotificationsRemoteSource>((ref) => NotificationsRemoteSource(ref.watch(dioProvider)));

final notificationsProvider = FutureProvider<List<AppNotification>>((ref) => ref.watch(notificationsSourceProvider).getAll());

final unreadCountProvider = Provider<int>((ref) {
  return ref.watch(notificationsProvider).maybeWhen(
    data: (list) => list.where((n) => !n.isRead).length,
    orElse: () => 0,
  );
});
