// ignore_for_file: avoid_print
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/providers/providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';
import 'support/live_test_guard.dart';

/// Real HTTP in a test run, with certificates checked as normal.
class _RealHttp extends HttpOverrides {}

/// Talks to a real server: registers users and creates PaymentIntents. Skipped
/// unless explicitly enabled against a non-production URL. See
/// support/live_test_guard.dart for how to run it.
void main() {
  final refusal = liveTestRefusal();
  if (refusal != null) {
    test('live workflow tests', () {}, skip: refusal);
    return;
  }

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
        print('Verified product in catalogue: ${first.name}');
      }, _RealHttp());
    });

    test('2. Product Detail API: Fetch product by slug', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final catalogRepo = container.read(catalogRepositoryProvider);
        final product = await catalogRepo.product('cz-statement-ring-collection');
        expect(product.slug, equals('cz-statement-ring-collection'));
        expect(product.inStock, isTrue);
        expect(product.images, isNotEmpty);
        print('Verified product detail: ${product.name}');
      }, _RealHttp());
    });

    test('3. User Authentication: Register new user and sign in', () async {
      await HttpOverrides.runWithHttpOverrides(() async {
        final accountRepo = container.read(accountRepositoryProvider);
        final timestamp = DateTime.now().millisecondsSinceEpoch;
        final testEmail = 'test_ios_runner_$timestamp@modestummah.com';
        const testPass = 'SecurePass2026!';
        const testName = 'Test User iOS';

        final res = await accountRepo.register(testEmail, testPass, testName);
        expect(res.token, isNotEmpty);
        expect(res.user.email, equals(testEmail));
        expect(res.user.name, equals(testName));

        final loginRes = await accountRepo.signIn(testEmail, testPass);
        expect(loginRes.token, isNotEmpty);
        expect(loginRes.user.email, equals(testEmail));
        print('Registered and signed in as ${res.user.email}');
      }, _RealHttp());
    });

    test('4. Checkout & Payment: Create PaymentIntent on server and verify clientSecret', () async {
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
        expect(paymentRes['clientSecret'] as String, startsWith('pi_'));
        expect(paymentRes['paymentIntentId'] as String, startsWith('pi_'));
        expect(paymentRes['resolvedTotal'], greaterThan(0));
        print('PaymentIntent created, total ${paymentRes['resolvedTotal']}');
      }, _RealHttp());
    });
  });
}
