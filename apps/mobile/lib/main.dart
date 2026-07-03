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
  runZonedGuarded(() async {
    await _bootstrap();
  }, (error, stack) {
    // ignore: avoid_print
    print('[ERR][ZONE] $error');
  });
}

Future<void> _bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Log Flutter framework errors without re-presenting them.
  FlutterError.onError = (details) {
    // ignore: avoid_print
    print('[ERR][FLUTTER] ${details.exceptionAsString()}');
  };

  // Return true = we handled it; prevents Flutter's default red debug overlay
  // for unhandled async errors that escape try/catch in timer or notification callbacks.
  PlatformDispatcher.instance.onError = (error, stack) {
    // ignore: avoid_print
    print('[ERR][PLATFORM] $error');
    return true;
  };

  // Safety net: replace any widget-subtree ErrorWidget with a friendly card.
  // Prevents raw DioException / SocketException text from ever reaching the user.
  ErrorWidget.builder = (FlutterErrorDetails details) {
    // ignore: avoid_print
    print('[ERR][WIDGET] ${details.exceptionAsString()}');
    return const Material(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Something went wrong. Please try again.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  };

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
