import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/di/providers.dart';
import '../../../../core/models/payroll.dart';
import '../../../profile/data/sources/payroll_remote_source.dart';

final payrollSourceProvider = Provider<PayrollRemoteSource>((ref) => PayrollRemoteSource(ref.watch(dioProvider)));

final payslipListProvider = FutureProvider<List<PayslipRecord>>((ref) => ref.watch(payrollSourceProvider).getMyPayslips());

final payslipDetailProvider = FutureProvider.family<PayslipRecord, String>((ref, id) => ref.watch(payrollSourceProvider).getById(id));
