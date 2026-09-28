import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/core/storage/secure_store.dart';
import 'package:modest_ummah/data/models/models.dart';

class RealHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (cert, host, port) => true;
  }
}

class FakeSecureStore extends SecureStore {
  String? _token;

  @override
  Future<String?> readToken() async => _token;

  @override
  Future<void> writeToken(String token) async => _token = token;

  @override
  Future<void> clearToken() async => _token = null;
}

void main() {
  SharedPreferences.setMockInitialValues({});

  group('End-to-End Live Workflow Verification', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer(
        overrides: [
          secureStoreProvider.overrideWithValue(FakeSecureStore()),
        ],
      );
    });

    tearDown(() async {
      await Future.delayed(const Duration(milliseconds: 200));
      container.dispose();
    });

    test('1. Catalog API: Fetch products and verify catalogue structure', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final catalogRepo = container.read(catalogRepositoryProvider);
        final paged = await catalogRepo.products();
        expect(paged.items, isNotEmpty);
        expect(paged.totalItems, greaterThan(0));

        final first = paged.items.first;
        expect(first.id, isNotEmpty);
        expect(first.name, isNotEmpty);
        expect(first.priceValue, greaterThan(0));
        print('✓ Verified product in catalogue: ${first.name} (\$${first.displayPrice})');
      }, RealHttpOverrides());
    });

    test('2. Product Detail API: Fetch product by slug', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final catalogRepo = container.read(catalogRepositoryProvider);
        final product = await catalogRepo.product('cz-statement-ring-collection');
        expect(product.slug, equals('cz-statement-ring-collection'));
        expect(product.inStock, isTrue);
        expect(product.images, isNotEmpty);
        print('✓ Verified product detail: ${product.name}, stock=${product.inStock}, images=${product.images.length}');
      }, RealHttpOverrides());
    });

    test('3. User Authentication: Register new user and sign in', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final accountRepo = container.read(accountRepositoryProvider);
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        final testEmail = 'test_ios_runner_$timestamp@modestummah.com';
        final testPass = 'SecurePass2026!';
        final testName = 'Test User iOS';

        // Registration
        final res = await accountRepo.register(testEmail, testPass, testName);
        expect(res.token, isNotEmpty);
        expect(res.user.email, equals(testEmail));
        expect(res.user.name, equals(testName));
        print('✓ Successfully registered new user: ${res.user.email} (ID: ${res.user.id})');

        // Login verification
        final loginRes = await accountRepo.signIn(testEmail, testPass);
        expect(loginRes.token, isNotEmpty);
        expect(loginRes.user.email, equals(testEmail));
        print('✓ Successfully verified login with new credentials');
      }, RealHttpOverrides());
    });

    test('4. Cart State Management: Add items, update quantities, calculate subtotal', () async {
      final cartNotifier = container.read(cartProvider.notifier);
      expect(container.read(cartProvider), isEmpty);

      const product1 = Product(
        id: 'c4c2c744-519e-40d0-a9e8-939fe20d6b55',
        slug: 'cz-statement-ring-collection',
        name: 'CZ Statement Ring Collection',
        shortDescription: 'Cocktail rings',
        description: 'A rotating selection',
        price: '24.00',
        compareAtPrice: '30.00',
        onSale: true,
        sku: 'MU-RING-01',
        inStock: true,
        category: null,
        tags: [],
        images: [],
      );

      // Add to cart
      cartNotifier.add(product1);
      var cartState = container.read(cartProvider);
      expect(cartState.length, equals(1));
      expect(cartState.first.quantity, equals(1));
      expect(cartState.first.lineTotal, equals(24.0));
      expect(container.read(cartSubtotalProvider), equals(24.0));

      // Add same product again -> increment quantity
      cartNotifier.add(product1);
      cartState = container.read(cartProvider);
      expect(cartState.first.quantity, equals(2));
      expect(cartState.first.lineTotal, equals(48.0));
      expect(container.read(cartSubtotalProvider), equals(48.0));

      // Set quantity to 3
      cartNotifier.setQuantity(product1.id, 3);
      cartState = container.read(cartProvider);
      expect(cartState.first.quantity, equals(3));
      expect(cartState.first.lineTotal, equals(72.0));
      expect(container.read(cartSubtotalProvider), equals(72.0));

      print('✓ Cart state logic verified: subtotal and quantities 100% accurate');
      await Future.delayed(const Duration(milliseconds: 300));
    });

    test('5. Checkout & Payment: Create PaymentIntent on server and verify clientSecret', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final api = container.read(apiClientProvider);
        final paymentRes = await api.post<Map<String, dynamic>>(
          '/checkout/payment-intent',
          data: {
            'items': [
              {'productId': 'c4c2c744-519e-40d0-a9e8-939fe20d6b55', 'quantity': 1}
            ],
            'customerEmail': 'workflow_test@modestummah.com',
            'shippingAddress': {
              'firstName': 'Amina',
              'lastName': 'Tester',
              'address1': '100 Main Street',
              'address2': 'Apt 4B',
              'city': 'Chicago',
              'state': 'IL',
              'postalCode': '60601',
              'country': 'US',
              'email': 'workflow_test@modestummah.com',
            },
          },
        );

        expect(paymentRes, contains('clientSecret'));
        expect(paymentRes, contains('paymentIntentId'));
        final clientSecret = paymentRes['clientSecret'] as String;
        final paymentIntentId = paymentRes['paymentIntentId'] as String;
        final total = paymentRes['resolvedTotal'];

        expect(clientSecret, startsWith('pi_'));
        expect(paymentIntentId, startsWith('pi_'));
        expect(total, greaterThan(0));

        print('✓ Checkout payment intent verified:');
        print('  PaymentIntent ID: $paymentIntentId');
        print('  Client Secret: ${clientSecret.substring(0, 15)}...');
        print('  Total calculated: \$$total (Subtotal: \$${paymentRes['resolvedSubtotal']}, Shipping: \$${paymentRes['resolvedShipping']}, Tax: \$${paymentRes['resolvedTax']})');
      }, RealHttpOverrides());
    });
  });
}
