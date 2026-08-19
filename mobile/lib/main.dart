import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

/// Publishable key, injected at build time:
///   flutter run --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_…
///
/// Only the publishable key ever reaches the client; the secret key stays on
/// the server, which is also the only thing that decides an order's total.
const _stripeKey = String.fromEnvironment('STRIPE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (_stripeKey.isNotEmpty) {
    Stripe.publishableKey = _stripeKey;
    Stripe.merchantIdentifier = 'merchant.com.modestummah';
    await Stripe.instance.applySettings();
  }

  runApp(const ProviderScope(child: ModestUmmahApp()));
}

class ModestUmmahApp extends StatelessWidget {
  const ModestUmmahApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Modest Ummah',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      // Follows the system setting — dark mode is not optional on iOS.
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}
