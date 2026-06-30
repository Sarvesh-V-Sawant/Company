import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/storage_keys.dart';
import '../../../../core/storage/secure_storage.dart';

class DeviceInfoScreen extends StatefulWidget {
  const DeviceInfoScreen({super.key});

  @override
  State<DeviceInfoScreen> createState() => _DeviceInfoScreenState();
}

class _DeviceInfoScreenState extends State<DeviceInfoScreen> {
  Map<String, String> _info = {};
  String? _fingerprint;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final android = await DeviceInfoPlugin().androidInfo;
      final fp = await SecureStorageService.read(StorageKeys.deviceHash);
      if (mounted) {
        setState(() {
          _fingerprint = fp;
          _info = {
            'Model': android.model,
            'Brand': android.brand,
            'Android Version': android.version.release,
            'SDK': '${android.version.sdkInt}',
            'Device ID': android.id,
          };
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Device Information')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ..._info.entries.map((e) => ListTile(title: Text(e.key, style: const TextStyle(fontSize: 12, color: Colors.grey)), subtitle: Text(e.value, style: const TextStyle(fontSize: 15)), dense: true)),
          const Divider(),
          ListTile(
            title: const Text('Device Fingerprint', style: TextStyle(fontSize: 12, color: Colors.grey)),
            subtitle: Text(_fingerprint ?? '—', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
            dense: true,
            trailing: _fingerprint != null ? IconButton(icon: const Icon(Icons.copy, size: 18), onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await Clipboard.setData(ClipboardData(text: _fingerprint!));
              if (mounted) messenger.showSnackBar(const SnackBar(content: Text('Fingerprint copied.')));
            }) : null,
          ),
        ],
      ),
    );
  }
}
