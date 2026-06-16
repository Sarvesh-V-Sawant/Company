import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'route_names.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: RouteNames.home,
    routes: [
      GoRoute(path: RouteNames.login, builder: (_, __) => const Scaffold(body: Center(child: Text('Login — Phase 2')))),
      GoRoute(path: RouteNames.home, builder: (_, __) => const Scaffold(body: Center(child: Text('Home — Phase 4')))),
      GoRoute(
        path: RouteNames.payslip,
        builder: (_, __) => const Scaffold(body: Center(child: Text('Payslips — Phase 11'))),
        routes: [
          GoRoute(
            path: ':yearMonth',
            builder: (_, state) => Scaffold(
              body: Center(child: Text('Payslip ${state.pathParameters['yearMonth']} — Phase 11')),
            ),
          ),
        ],
      ),
    ],
  );
});
