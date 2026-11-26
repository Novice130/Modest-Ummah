import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'core/observability/crash_reporting.dart';
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

  await configureStripe(_stripeKey);

  await runWithCrashReporting(
    () => runApp(const ProviderScope(child: ModestUmmahApp())),
  );
}

/// A payments setup failure must never stop the shop from opening: browsing
/// works without Stripe, and flutter_stripe applies its settings again on the
/// first payment call.
Future<void> configureStripe(
  String key, {
  Future<void> Function()? applySettings,
}) async {
  if (key.isEmpty) return;
  try {
    Stripe.publishableKey = key;
    Stripe.merchantIdentifier = 'merchant.com.modestummah';
    await (applySettings ?? Stripe.instance.applySettings)();
  } catch (e) {
    debugPrint('Stripe setup failed: $e');
  }
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
