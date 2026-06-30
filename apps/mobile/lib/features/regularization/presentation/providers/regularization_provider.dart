import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../data/sources/regularization_remote_source.dart';

final regularizationSourceProvider = Provider<RegularizationRemoteSource>((ref) => RegularizationRemoteSource(ref.watch(dioProvider)));

final regularizationHistoryProvider = FutureProvider.family<dynamic, String?>((ref, status) => ref.watch(regularizationSourceProvider).getHistory(status: status));

final regularizationDetailProvider = FutureProvider.family<dynamic, String>((ref, id) => ref.watch(regularizationSourceProvider).getById(id));
