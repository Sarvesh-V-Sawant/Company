import 'package:hive_flutter/hive_flutter.dart';

class LocalStorageService {
  static Box<dynamic>? _pendingActionsBox;
  static Box<dynamic>? _settingsBox;

  static Future<void> init() async {
    _pendingActionsBox = await Hive.openBox('pendingActions');
    _settingsBox = await Hive.openBox('settings');
  }

  static Box<dynamic> get pendingActions => _pendingActionsBox!;
  static Box<dynamic> get settings => _settingsBox!;
}
