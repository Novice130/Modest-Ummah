import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:integration_test/integration_test.dart';
import 'package:modest_ummah/features/cart/cart_screen.dart';
import 'package:modest_ummah/features/checkout/checkout_screen.dart';
import 'package:modest_ummah/features/product/product_screen.dart';
import 'package:modest_ummah/main.dart' as app;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App Store Screenshot and Preview Flow', (tester) async {
    // 1. Launch App
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 4));

    // Screen 1: Shop / Home Screen
    expect(find.text('MODEST UMMAH'), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await binding.takeScreenshot('01_shop');
    debugPrint('CAPTURED: 01_shop');

    // 2. Open First Product
    final productFinder = find.textContaining('CZ Statement Ring');
    if (productFinder.evaluate().isNotEmpty) {
      await tester.tap(productFinder);
    } else {
      await tester.tap(find.byType(GestureDetector).at(2));
    }
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // Screen 2: Product Detail Screen
    await binding.takeScreenshot('02_product');
    debugPrint('CAPTURED: 02_product');

    // Scroll down slightly so Add to Cart is well in view
    await tester.drag(find.byType(CustomScrollView).last, const Offset(0, -300));
    await tester.pumpAndSettle(const Duration(seconds: 1));

    // Add to cart
    final addToCartBtn = find.widgetWithText(FilledButton, 'Add to cart');
    if (addToCartBtn.evaluate().isNotEmpty) {
      await tester.tap(addToCartBtn, warnIfMissed: false);
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    // Return to Shop / TabShell via GoRouter
    if (find.byType(ProductScreen).evaluate().isNotEmpty) {
      final BuildContext ctx = tester.element(find.byType(ProductScreen));
      GoRouter.of(ctx).pop();
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    // 3. Search Tab
    await tester.tap(find.text('SEARCH'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Type search query
    final searchInput = find.byType(TextField);
    if (searchInput.evaluate().isNotEmpty) {
      await tester.enterText(searchInput, 'Ring');
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    // Screen 3: Search Screen
    await binding.takeScreenshot('03_search');
    debugPrint('CAPTURED: 03_search');

    // 4. Bag / Cart Tab
    await tester.tap(find.text('BAG'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Screen 4: Bag Screen
    await binding.takeScreenshot('04_bag');
    debugPrint('CAPTURED: 04_bag');

    // 5. Checkout Screen
    final checkoutBtn = find.widgetWithText(FilledButton, 'Checkout');
    if (checkoutBtn.evaluate().isNotEmpty) {
      await tester.tap(checkoutBtn, warnIfMissed: false);
      await tester.pumpAndSettle(const Duration(seconds: 2));
    }

    if (find.text('CHECKOUT').evaluate().isEmpty) {
      if (find.byType(CartScreen).evaluate().isNotEmpty) {
        final BuildContext ctx = tester.element(find.byType(CartScreen));
        GoRouter.of(ctx).push('/checkout');
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }
    }

    if (find.text('CHECKOUT').evaluate().isNotEmpty) {
      // Fill in demo address details
      final addressField = find.widgetWithText(TextFormField, 'Address');
      if (addressField.evaluate().isNotEmpty) {
        await tester.enterText(addressField, '742 Evergreen Terrace');
        await tester.pumpAndSettle();
      }

      final cityField = find.widgetWithText(TextFormField, 'City');
      if (cityField.evaluate().isNotEmpty) {
        await tester.enterText(cityField, 'Springfield');
        await tester.pumpAndSettle();
      }

      final stateField = find.widgetWithText(TextFormField, 'State');
      if (stateField.evaluate().isNotEmpty) {
        await tester.enterText(stateField, 'IL');
        await tester.pumpAndSettle();
      }

      final zipField = find.widgetWithText(TextFormField, 'ZIP');
      if (zipField.evaluate().isNotEmpty) {
        await tester.enterText(zipField, '62704');
        await tester.pumpAndSettle();
      }

      // Screen 5: Checkout Screen
      await binding.takeScreenshot('05_checkout');
      debugPrint('CAPTURED: 05_checkout');

      // Return back to Bag
      if (find.byType(CheckoutScreen).evaluate().isNotEmpty) {
        final BuildContext ctx = tester.element(find.byType(CheckoutScreen));
        GoRouter.of(ctx).pop();
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }
    }

    // 6. Account Tab
    await tester.tap(find.text('ACCOUNT'));
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Screen 6: Account Screen
    await binding.takeScreenshot('06_account');
    debugPrint('CAPTURED: 06_account');

    // Return to Shop tab
    await tester.tap(find.text('SHOP'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    debugPrint('COMPLETE: All screenshots and preview flow finished');
  });
}
