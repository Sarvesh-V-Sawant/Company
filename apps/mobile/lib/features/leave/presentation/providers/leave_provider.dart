import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/models/leave.dart';
import '../../data/sources/leave_remote_source.dart';

final leaveSourceProvider = Provider<LeaveRemoteSource>((ref) => LeaveRemoteSource(ref.watch(dioProvider)));

final leaveBalanceProvider = FutureProvider<List<LeaveBalance>>((ref) => ref.watch(leaveSourceProvider).getBalance());

final leaveHistoryProvider = FutureProvider.family<List<LeaveRequest>, String?>((ref, status) => ref.watch(leaveSourceProvider).getHistory(status: status));

final leaveDetailProvider = FutureProvider.family<LeaveRequest, String>((ref, id) => ref.watch(leaveSourceProvider).getById(id));
