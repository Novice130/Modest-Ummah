import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/features/account/account_screen.dart';
import 'package:modest_ummah/features/common/legal_links.dart';
import 'package:modest_ummah/main.dart' show configureStripe;

import 'support/fakes.dart';

void main() {
  group('configureStripe', () {
    test('a settings failure does not stop startup', () async {
      await expectLater(
        configureStripe('pk_test_x', applySettings: () async => throw Exception('no native')),
        completes,
      );
    });

    test('with no key, Stripe is left alone', () async {
      var applied = false;
      await configureStripe('', applySettings: () async => applied = true);
      expect(applied, isFalse);
    });

    test('with a key, settings are applied', () async {
      var applied = false;
      await configureStripe('pk_test_x', applySettings: () async => applied = true);
      expect(applied, isTrue);
    });
  });

  group('LegalLinks', () {
    Future<void> pump(WidgetTester tester, Future<bool> Function(Uri) launcher) =>
        tester.pumpWidget(
          MaterialApp(home: Scaffold(body: LegalLinks(launcher: launcher))),
        );

    testWidgets('open the published privacy and terms pages', (tester) async {
      final opened = <Uri>[];
      await pump(tester, (uri) async {
        opened.add(uri);
        return true;
      });

      await tester.tap(find.text('Privacy Policy'));
      await tester.tap(find.text('Terms of Service'));
      await tester.pump();

      expect(opened.map((u) => u.path), ['/privacy', '/terms']);
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('say so when the page cannot be opened', (tester) async {
      await pump(tester, (_) async => false);

      await tester.tap(find.text('Privacy Policy'));
      await tester.pump();

      expect(find.textContaining('Could not open the page'), findsOneWidget);
    });
  });

  group('AccountScreen', () {
    Future<void> pump(WidgetTester tester, FakeSecureStore store, FakeAdapter adapter) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: offlineOverrides(store, adapter),
          child: const MaterialApp(home: AccountScreen()),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('signed out: no address claim, legal links present', (tester) async {
      await pump(tester, FakeSecureStore(), FakeAdapter((r) => throw offline(r)));

      expect(find.text('Sign in or register'), findsOneWidget);
      expect(find.textContaining('address'), findsNothing);
      expect(find.byType(LegalLinks), findsOneWidget);
    });

    testWidgets('signed in: legal links present', (tester) async {
      await pump(
        tester,
        FakeSecureStore('session'),
        FakeAdapter((_) => FakeResponse(200, userJson('amina'))),
      );

      expect(find.text('amina@example.test'), findsOneWidget);
      expect(find.byType(LegalLinks), findsOneWidget);
    });

    testWidgets('offline with a session: offers a retry, not sign-in', (tester) async {
      final store = FakeSecureStore('session');
      final adapter = FakeAdapter((r) => throw offline(r));
      await pump(tester, store, adapter);

      expect(find.text('Could not reach Modest Ummah'), findsOneWidget);
      expect(find.text('Sign in or register'), findsNothing);
      expect(store.token, 'session');

      adapter.handler = (_) => FakeResponse(200, userJson('amina'));
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();

      expect(find.text('amina@example.test'), findsOneWidget);
    });
  });
}
