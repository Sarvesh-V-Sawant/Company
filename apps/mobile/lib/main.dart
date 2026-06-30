import 'dart:async';
import 'dart:ui';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'core/di/providers.dart';
import 'core/storage/local_storage.dart';
import 'features/notifications/data/services/fcm_service.dart';
import 'firebase_options.dart';
import 'app.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

void main() async {
  // PHASE 15.18 DIAGNOSTIC — remove after runtime trace captured
  runZonedGuarded(() async {
    await _bootstrap();
  }, (error, stack) {
    // ignore: avoid_print
    print('[DIAG][ZONE] Unhandled error: $error');
    // ignore: avoid_print
    print('[DIAG][ZONE] Stack:\n$stack');
  });
}

Future<void> _bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  // PHASE 15.18 DIAGNOSTIC
  FlutterError.onError = (details) {
    // ignore: avoid_print
    print('[DIAG][FLUTTER_ERROR] ${details.exceptionAsString()}');
    // ignore: avoid_print
    print('[DIAG][FLUTTER_ERROR] Stack:\n${details.stack}');
    FlutterError.dumpErrorToConsole(details);
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    // ignore: avoid_print
    print('[DIAG][PLATFORM_ERROR] $error');
    // ignore: avoid_print
    print('[DIAG][PLATFORM_ERROR] Stack:\n$stack');
    return false;
  };

  // ignore: avoid_print
  print('[DIAG][BOOT] API_BASE_URL env = ${const String.fromEnvironment('API_BASE_URL', defaultValue: '<not-set>')}');
  // ignore: avoid_print
  print('[DIAG][BOOT] ENVIRONMENT    = ${const String.fromEnvironment('ENVIRONMENT', defaultValue: '<not-set>')}');

  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await Hive.initFlutter();
  await LocalStorageService.init();

  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  const androidChannel = AndroidNotificationChannel(
    'high_importance_channel',
    'High Importance Notifications',
    importance: Importance.max,
  );
  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(androidChannel);

  await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
    alert: true,
    badge: true,
    sound: true,
  );

  // Cold-start: capture launch notification before runApp
  final initialMessage = await FcmService.getInitialMessage();
  final initialRoute = initialMessage != null
      ? FcmService.routeFromMessage(initialMessage)
      : null;

  final container = ProviderContainer(
    overrides: [
      if (initialRoute != null)
        initialNotificationRouteProvider.overrideWith((ref) => initialRoute),
    ],
  );
  // Wire foreground + tap handlers immediately after Firebase init
  await container.read(fcmServiceProvider).initialize();

  runApp(UncontrolledProviderScope(
    container: container,
    child: const GenesisApp(),
  ));
}
