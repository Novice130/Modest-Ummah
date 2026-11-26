import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/network/api_client.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/data/models/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

Map<String, dynamic> productJson(String slug) => {
      'id': slug,
      'slug': slug,
      'name': slug,
      'price': '24.00',
      'inStock': true,
      'tags': const [],
      'images': const [],
    };

const _ring = Product(
  id: 'ring',
  slug: 'ring',
  name: 'Ring',
  shortDescription: '',
  description: '',
  price: '24.00',
  compareAtPrice: '30.00',
  onSale: true,
  sku: 'MU-RING-01',
  inStock: true,
  category: null,
  tags: [],
  images: [],
);

void main() {
  group('savedProductsProvider', () {
    ProviderContainer containerFor(FakeAdapter adapter) {
      final container = ProviderContainer(
        overrides: offlineOverrides(FakeSecureStore(), adapter),
      );
      addTearDown(container.dispose);
      addTearDown(container.listen(savedProductsProvider, (_, __) {}).close);
      return container;
    }

    Future<List<Product>> loaded(ProviderContainer container) async {
      await Future<void>.delayed(Duration.zero); // Lets the saved list restore.
      return container.read(savedProductsProvider.future);
    }

    test('an unpublished product (404) drops out quietly', () async {
      SharedPreferences.setMockInitialValues({
        'saved_v1': ['kept', 'gone'],
      });
      final container = containerFor(FakeAdapter((request) =>
          request.path.endsWith('/kept')
              ? FakeResponse(200, productJson('kept'))
              : const FakeResponse(404, {'error': 'not found'})));

      expect((await loaded(container)).map((p) => p.slug), ['kept']);
    });

    test('a network failure is an error, not an empty list', () async {
      SharedPreferences.setMockInitialValues({
        'saved_v1': ['kept'],
      });
      final container = containerFor(FakeAdapter((r) => throw offline(r)));

      await expectLater(loaded(container), throwsA(isA<ApiException>()));
    });

    test('a server error is an error, not an empty list', () async {
      SharedPreferences.setMockInitialValues({
        'saved_v1': ['kept'],
      });
      final container = containerFor(
        FakeAdapter((_) => const FakeResponse(503, {'error': 'unavailable'})),
      );

      await expectLater(loaded(container), throwsA(isA<ApiException>()));
    });
  });

  test('bag totals follow additions and quantity changes', () async {
    SharedPreferences.setMockInitialValues({});
    final container = ProviderContainer(
      overrides: offlineOverrides(
        FakeSecureStore(),
        FakeAdapter((_) => throw StateError('a guest bag makes no requests')),
      ),
    );
    addTearDown(container.dispose);
    final bag = container.read(cartProvider.notifier);

    bag.add(_ring);
    expect(container.read(cartProvider).single.quantity, 1);
    expect(container.read(cartSubtotalProvider), 24.0);

    bag.add(_ring);
    expect(container.read(cartProvider).single.quantity, 2);
    expect(container.read(cartSubtotalProvider), 48.0);

    bag.setQuantity(_ring.id, 3);
    expect(container.read(cartSubtotalProvider), 72.0);
    expect(container.read(cartCountProvider), 3);

    await Future<void>.delayed(Duration.zero);
  });
}
