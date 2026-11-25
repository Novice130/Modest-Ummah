import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/features/orders/orders_screen.dart';

import 'support/fakes.dart';

/// Serves each caller only their own orders, keyed on the bearer token, the way
/// GET /api/v1/orders does.
FakeResponse server(RecordedRequest request) {
  if (request.method == 'POST' && request.path.endsWith('/auth/login')) {
    final email = (request.data as Map)['email'] as String;
    final id = email.split('@').first;
    return FakeResponse(200, {'token': 'token-$id', 'user': userJson(id)});
  }
  if (request.path.endsWith('/orders')) {
    final owner = request.authorization?.replaceFirst('Bearer token-', '');
    if (owner == null) return const FakeResponse(401, {'error': 'no'});
    return FakeResponse(200, {
      'items': [orderJson('order-of-$owner')],
    });
  }
  return const FakeResponse(404, {'error': 'not found'});
}

void main() {
  group('ordersProvider', () {
    late FakeAdapter adapter;
    late ProviderContainer container;

    setUp(() async {
      adapter = FakeAdapter(server);
      container = ProviderContainer(
        overrides: offlineOverrides(FakeSecureStore(), adapter),
      );
      addTearDown(container.dispose);
      container.read(authProvider);
      await Future<void>.delayed(Duration.zero);
      // Stays subscribed, as an open screen would.
      addTearDown(container.listen(ordersProvider, (_, __) {}).close);
    });

    Future<List<String>> ids() async =>
        (await container.read(ordersProvider.future)).map((o) => o.orderId).toList();

    test('one user never sees another user\'s orders on the same device', () async {
      await container.read(authProvider.notifier).signIn('amina@example.test', 'pw');
      expect(await ids(), ['order-of-amina']);

      await container.read(authProvider.notifier).signOut();
      expect(await ids(), isEmpty);

      await container.read(authProvider.notifier).signIn('bilal@example.test', 'pw');
      expect(await ids(), ['order-of-bilal']);
    });

    test('signed out, it answers empty without calling the server', () async {
      expect(await ids(), isEmpty);
      expect(adapter.requests, isEmpty);
    });

    test('invalidating after checkout fetches again', () async {
      await container.read(authProvider.notifier).signIn('amina@example.test', 'pw');
      await ids();
      final before = adapter.requests.where((r) => r.path.endsWith('/orders')).length;

      container.invalidate(ordersProvider);
      await ids();

      expect(
        adapter.requests.where((r) => r.path.endsWith('/orders')).length,
        before + 1,
      );
    });

    test('abandoned pending_payment orders are filtered out', () async {
      adapter.handler = (request) => request.path.endsWith('/orders')
          ? FakeResponse(200, {
              'items': [
                orderJson('abandoned', status: 'pending_payment'),
                orderJson('paid', status: 'processing'),
                orderJson('shipped', status: 'shipped'),
              ],
            })
          : server(request);

      await container.read(authProvider.notifier).signIn('amina@example.test', 'pw');
      expect(await ids(), ['paid', 'shipped']);
    });
  });

  group('OrdersScreen', () {
    Future<void> pump(
      WidgetTester tester, {
      required bool paymentJustCompleted,
      required List<Map<String, dynamic>> orders,
    }) async {
      final adapter = FakeAdapter((request) => request.path.endsWith('/orders')
          ? FakeResponse(200, {'items': orders})
          : FakeResponse(200, userJson('amina')));
      await tester.pumpWidget(
        ProviderScope(
          overrides: offlineOverrides(FakeSecureStore('token-amina'), adapter),
          child: MaterialApp(
            home: OrdersScreen(paymentJustCompleted: paymentJustCompleted),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('right after paying, says confirmation is pending, not done', (tester) async {
      await pump(tester, paymentJustCompleted: true, orders: const []);

      expect(find.text('Payment received'), findsOneWidget);
      expect(find.textContaining('confirming your order'), findsOneWidget);
      expect(find.textContaining('confirmed.'), findsNothing);
      expect(find.text('No orders yet'), findsNothing);
    });

    testWidgets('the notice stays above orders that already exist', (tester) async {
      await pump(tester, paymentJustCompleted: true, orders: [orderJson('older')]);

      expect(find.text('Payment received'), findsOneWidget);
      expect(find.text('older'), findsOneWidget);
    });

    testWidgets('an ordinary visit has no payment notice', (tester) async {
      await pump(tester, paymentJustCompleted: false, orders: const []);

      expect(find.text('No orders yet'), findsOneWidget);
      expect(find.text('Payment received'), findsNothing);
    });

    testWidgets('an empty list can still be pulled to refresh', (tester) async {
      await pump(tester, paymentJustCompleted: true, orders: const []);

      expect(
        find.descendant(
          of: find.byType(RefreshIndicator),
          matching: find.byType(Scrollable),
        ),
        findsOneWidget,
      );
    });
  });
}
