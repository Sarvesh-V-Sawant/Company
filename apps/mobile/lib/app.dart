import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/router/route_names.dart';
import 'core/theme/app_theme.dart';

class GenesisApp extends ConsumerWidget {
  const GenesisApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    // Watch session expiry — redirect when triggered
    ref.listen(sessionExpiredProvider, (_, expired) {
      if (expired) router.go(RouteNames.sessionExpired);
    });

    return MaterialApp.router(
      title: 'Genesis Workforce',
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
