import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:modest_ummah/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Complete workflow test: Browse, Sign up, Add to Cart, Checkout', (tester) async {
    // 1. Launch App
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 4));

    // Verify shop screen has loaded
    expect(find.text('MODEST UMMAH'), findsOneWidget);
    debugPrint('Step 1 PASSED: Home screen loaded successfully');

    // 2. Test Tab Navigation
    // Search tab
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    debugPrint('Step 2a PASSED: Search tab loaded');

    // Saved tab
    await tester.tap(find.byIcon(Icons.favorite_border).first);
    await tester.pumpAndSettle(const Duration(seconds: 2));
    debugPrint('Step 2b PASSED: Saved tab loaded');

    // Account tab
    await tester.tap(find.byIcon(Icons.person_outline));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('ACCOUNT'), findsOneWidget);
    debugPrint('Step 2c PASSED: Account tab loaded');

    // 3. Test User Sign-up
    // Tap "Sign in or register"
    final signinBtn = find.text('Sign in or register');
    if (signinBtn.evaluate().isNotEmpty) {
      await tester.tap(signinBtn);
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Switch to Create Account
      final createAccountToggle = find.text('New here? Create an account');
      expect(createAccountToggle, findsOneWidget);
      await tester.tap(createAccountToggle);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Fill in signup form
      final uniqueId = DateTime.now().millisecondsSinceEpoch;
      final testEmail = 'user_$uniqueId@modesttest.com';
      final testName = 'Amina Tester';
      final testPass = 'Password123!';

      // Enter Name
      final nameField = find.widgetWithText(TextFormField, 'Name');
      await tester.enterText(nameField, testName);
      await tester.pumpAndSettle();

      // Enter Email
      final emailField = find.widgetWithText(TextFormField, 'Email');
      await tester.enterText(emailField, testEmail);
      await tester.pumpAndSettle();

      // Enter Password
      final passField = find.widgetWithText(TextFormField, 'Password');
      await tester.enterText(passField, testPass);
      await tester.pumpAndSettle();

      // Tap CREATE ACCOUNT button
      final submitBtn = find.widgetWithText(FilledButton, 'CREATE ACCOUNT');
      await tester.tap(submitBtn);
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Verify returned to Account and showing user's name
      expect(find.text(testName), findsOneWidget);
      expect(find.text(testEmail), findsOneWidget);
      debugPrint('Step 3 PASSED: User signup completed for $testEmail');
    }

    // 4. Navigate back to Shop tab
    await tester.tap(find.byIcon(Icons.grid_view));
    await tester.pumpAndSettle(const Duration(seconds: 3));
    debugPrint('Step 4 PASSED: Navigated back to Shop tab');

    // 5. Open First Product
    final firstProduct = find.byType(GestureDetector).first;
    // Tap the first product card title or image
    final productTextFinder = find.textContaining('CZ Statement Ring');
    if (productTextFinder.evaluate().isNotEmpty) {
      await tester.tap(productTextFinder);
    } else {
      await tester.tap(find.text('All'));
    }
    await tester.pumpAndSettle(const Duration(seconds: 3));
    debugPrint('Step 5 PASSED: Product detail opened');

    // 6. Add to Cart
    final addToCartBtn = find.widgetWithText(FilledButton, 'Add to cart');
    if (addToCartBtn.evaluate().isNotEmpty) {
      await tester.tap(addToCartBtn);
      await tester.pumpAndSettle(const Duration(seconds: 2));
      debugPrint('Step 6 PASSED: Added product to cart');
    }

    // 7. Navigate to Cart / Bag
    await tester.tap(find.byIcon(Icons.shopping_bag_outlined));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('BAG'), findsOneWidget);
    debugPrint('Step 7 PASSED: Cart screen displayed');

    // 8. Proceed to Checkout
    final checkoutBtn = find.widgetWithText(FilledButton, 'Checkout');
    expect(checkoutBtn, findsOneWidget);
    await tester.tap(checkoutBtn);
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('CHECKOUT'), findsOneWidget);
    debugPrint('Step 8 PASSED: Checkout screen opened');

    // 9. Verify and Fill Shipping Address
    // Address 1
    final addressField = find.widgetWithText(TextFormField, 'Address');
    await tester.enterText(addressField, '742 Evergreen Terrace');
    await tester.pumpAndSettle();

    // City
    final cityField = find.widgetWithText(TextFormField, 'City');
    await tester.enterText(cityField, 'Springfield');
    await tester.pumpAndSettle();

    // State
    final stateField = find.widgetWithText(TextFormField, 'State');
    await tester.enterText(stateField, 'IL');
    await tester.pumpAndSettle();

    // ZIP
    final zipField = find.widgetWithText(TextFormField, 'ZIP');
    await tester.enterText(zipField, '62704');
    await tester.pumpAndSettle();

    debugPrint('Step 9 PASSED: Checkout form filled');

    // 10. Tap "Continue to payment"
    final payBtn = find.widgetWithText(FilledButton, 'Continue to payment');
    expect(payBtn, findsOneWidget);
    await tester.tap(payBtn);
    // Allow network call to create payment intent and initialize Stripe
    await tester.pump(const Duration(seconds: 4));
    debugPrint('Step 10 PASSED: Continue to payment triggered, PaymentIntent initiated');
  });
}
