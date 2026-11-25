import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/features/checkout/checkout_gate.dart';

import 'support/fakes.dart';

/// A stand-in sign-in screen: the real one's sign-in calls are covered elsewhere.
class _StubAuth extends ConsumerWidget {
  const _StubAuth();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        body: Column(
          children: [
            const Text('AUTH'),
            TextButton(
              onPressed: () async {
                await ref.read(authProvider.notifier).signIn('amina@example.test', 'pw');
                if (context.mounted) context.pop();
              },
              child: const Text('complete sign-in'),
            ),
            TextButton(onPressed: () => context.pop(), child: const Text('back out')),
          ],
        ),
      );
}

Future<void> pumpBag(
  WidgetTester tester, {
  required FakeSecureStore store,
  required FakeAdapter adapter,
}) async {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => openCheckout(context, ref),
              child: const Text('Checkout'),
            ),
          ),
        ),
      ),
      GoRoute(path: '/auth', builder: (_, __) => const _StubAuth()),
      GoRoute(
        path: '/checkout',
        builder: (_, __) => const Scaffold(body: Text('CHECKOUT SCREEN')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: offlineOverrides(store, adapter),
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  FakeResponse signedInServer(RecordedRequest request) => request.path.endsWith('/auth/login')
      ? FakeResponse(200, {'token': 'session', 'user': userJson('amina')})
      : FakeResponse(200, userJson('amina'));

  testWidgets('a guest is sent to sign-in, not to payment', (tester) async {
    await pumpBag(tester, store: FakeSecureStore(), adapter: FakeAdapter(signedInServer));

    await tester.tap(find.text('Checkout'));
    await tester.pumpAndSettle();

    expect(find.text('AUTH'), findsOneWidget);
    expect(find.text('CHECKOUT SCREEN'), findsNothing);
  });

  testWidgets('signing in carries on to checkout', (tester) async {
    await pumpBag(tester, store: FakeSecureStore(), adapter: FakeAdapter(signedInServer));

    await tester.tap(find.text('Checkout'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('complete sign-in'));
    await tester.pumpAndSettle();

    expect(find.text('CHECKOUT SCREEN'), findsOneWidget);
  });

  testWidgets('backing out of sign-in returns to the bag', (tester) async {
    await pumpBag(tester, store: FakeSecureStore(), adapter: FakeAdapter(signedInServer));

    await tester.tap(find.text('Checkout'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('back out'));
    await tester.pumpAndSettle();

    expect(find.text('Checkout'), findsOneWidget);
    expect(find.text('CHECKOUT SCREEN'), findsNothing);
  });

  testWidgets('a signed-in customer goes straight to checkout', (tester) async {
    await pumpBag(
      tester,
      store: FakeSecureStore('session'),
      adapter: FakeAdapter(signedInServer),
    );

    await tester.tap(find.text('Checkout'));
    await tester.pumpAndSettle();

    expect(find.text('CHECKOUT SCREEN'), findsOneWidget);
    expect(find.text('AUTH'), findsNothing);
  });

  testWidgets('offline with a stored session: not asked to sign in again', (tester) async {
    await pumpBag(
      tester,
      store: FakeSecureStore('session'),
      adapter: FakeAdapter((r) => throw offline(r)),
    );

    await tester.tap(find.text('Checkout'));
    await tester.pumpAndSettle();

    expect(find.text('AUTH'), findsNothing);
    expect(find.text('CHECKOUT SCREEN'), findsNothing);
    expect(find.textContaining('Could not reach Modest Ummah'), findsOneWidget);
  });
}
