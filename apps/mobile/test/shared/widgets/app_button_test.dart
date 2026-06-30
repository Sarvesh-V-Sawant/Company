import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:genesis_workforce/shared/widgets/app_button.dart';

Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  group('AppButton', () {
    testWidgets('renders label', (tester) async {
      await tester.pumpWidget(wrap(AppButton(label: 'Submit', onPressed: () {})));
      expect(find.text('Submit'), findsOneWidget);
    });

    testWidgets('shows spinner when loading', (tester) async {
      await tester.pumpWidget(wrap(const AppButton(label: 'Submit', loading: true)));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Submit'), findsNothing);
    });

    testWidgets('disabled when loading — onPressed not called', (tester) async {
      var called = false;
      await tester.pumpWidget(wrap(AppButton(label: 'Go', loading: true, onPressed: () => called = true)));
      final btn = tester.widget<ElevatedButton>(find.byType(ElevatedButton).first);
      expect(btn.onPressed, isNull);
      expect(called, isFalse);
    });

    testWidgets('fires onPressed when tapped', (tester) async {
      var called = false;
      await tester.pumpWidget(wrap(AppButton(label: 'Go', onPressed: () => called = true)));
      await tester.tap(find.byType(ElevatedButton).first);
      expect(called, isTrue);
    });

    testWidgets('outline variant renders OutlinedButton', (tester) async {
      await tester.pumpWidget(wrap(AppButton(label: 'Outline', variant: AppButtonVariant.outline, onPressed: () {})));
      expect(find.byType(OutlinedButton), findsOneWidget);
    });

    testWidgets('ghost variant renders TextButton', (tester) async {
      await tester.pumpWidget(wrap(AppButton(label: 'Ghost', variant: AppButtonVariant.ghost, onPressed: () {})));
      expect(find.byType(TextButton), findsOneWidget);
    });

    testWidgets('shows icon when provided', (tester) async {
      await tester.pumpWidget(wrap(AppButton(label: 'Add', icon: Icons.add, onPressed: () {})));
      expect(find.byIcon(Icons.add), findsOneWidget);
    });
  });
}
