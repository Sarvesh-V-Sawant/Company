import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/shared/widgets/loading_overlay.dart';

Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('StatusChip', () {
    testWidgets('shows Present label for present status', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'present')));
      expect(find.text('Present'), findsOneWidget);
    });

    testWidgets('shows Absent label for absent status', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'absent')));
      expect(find.text('Absent'), findsOneWidget);
    });

    testWidgets('shows Half Day for half_day', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'half_day')));
      expect(find.text('Half Day'), findsOneWidget);
    });

    testWidgets('shows Half Day for half-day variant', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'half-day')));
      expect(find.text('Half Day'), findsOneWidget);
    });

    testWidgets('shows Approved for approved', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'approved')));
      expect(find.text('Approved'), findsOneWidget);
    });

    testWidgets('shows Pending for pending', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'pending')));
      expect(find.text('Pending'), findsOneWidget);
    });

    testWidgets('shows Rejected for rejected', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'rejected')));
      expect(find.text('Rejected'), findsOneWidget);
    });

    testWidgets('shows Leave for leave', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'leave')));
      expect(find.text('Leave'), findsOneWidget);
    });

    testWidgets('shows Holiday for holiday', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'holiday')));
      expect(find.text('Holiday'), findsOneWidget);
    });

    testWidgets('shows Weekend for weekend', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'weekend')));
      expect(find.text('Weekend'), findsOneWidget);
    });

    testWidgets('shows Cancelled for cancelled', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'cancelled')));
      expect(find.text('Cancelled'), findsOneWidget);
    });

    testWidgets('shows Draft for draft', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'draft')));
      expect(find.text('Draft'), findsOneWidget);
    });

    testWidgets('echoes unknown status', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'unknown_xyz')));
      expect(find.text('unknown_xyz'), findsOneWidget);
    });

    testWidgets('case insensitive — PRESENT resolves to Present', (tester) async {
      await tester.pumpWidget(wrap(const StatusChip(status: 'PRESENT')));
      expect(find.text('Present'), findsOneWidget);
    });
  });
}
