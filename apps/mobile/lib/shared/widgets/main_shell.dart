import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/router/route_names.dart';
import '../../features/notifications/presentation/providers/notifications_provider.dart';

class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.toString();
    final unreadCount = ref.watch(unreadCountProvider);

    int currentIndex = _indexFor(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) {
          switch (index) {
            case 0: context.go(RouteNames.home);
            case 1: context.go(RouteNames.attendanceWeek);
            case 2: context.go(RouteNames.leave);
            case 3: context.go(RouteNames.notifications);
            case 4: context.go(RouteNames.profile);
          }
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.calendar_today_outlined), selectedIcon: Icon(Icons.calendar_today), label: 'Attendance'),
          const NavigationDestination(icon: Icon(Icons.beach_access_outlined), selectedIcon: Icon(Icons.beach_access), label: 'Leave'),
          NavigationDestination(
            icon: Badge(isLabelVisible: unreadCount > 0, label: Text('$unreadCount'), child: const Icon(Icons.notifications_outlined)),
            selectedIcon: Badge(isLabelVisible: unreadCount > 0, label: Text('$unreadCount'), child: const Icon(Icons.notifications)),
            label: 'Notifications',
          ),
          const NavigationDestination(icon: Icon(Icons.person_outlined), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  int _indexFor(String location) {
    if (location.startsWith('/attendance')) return 1;
    if (location.startsWith('/leave')) return 2;
    if (location.startsWith('/notifications')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }
}
