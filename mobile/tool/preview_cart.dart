// Local-only harness: the bag and checkout with a seeded cart.
//   flutter run -t tool/preview_cart.dart --dart-define=INITIAL_ROUTE=/checkout
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/core/router/app_router.dart';
import 'package:modest_ummah/core/theme/app_theme.dart';
import 'package:modest_ummah/data/models/models.dart';

ApiImage _img(String seed) => ApiImage(
      url: 'https://picsum.photos/seed/$seed/1200/1500',
      alt: seed,
      width: 1200,
      height: 1500,
      lqip: '',
    );

Product _product(String slug, String name, String price, String? compare) => Product(
      id: slug,
      slug: slug,
      name: name,
      shortDescription: '',
      description: '',
      price: price,
      compareAtPrice: compare,
      onSale: compare != null,
      sku: 'MU-${slug.toUpperCase()}',
      inStock: true,
      category: null,
      tags: const [],
      images: [_img(slug)],
    );

void main() => runApp(const ProviderScope(child: _PreviewApp()));

class _PreviewApp extends ConsumerStatefulWidget {
  const _PreviewApp();

  @override
  ConsumerState<_PreviewApp> createState() => _PreviewAppState();
}

class _PreviewAppState extends ConsumerState<_PreviewApp> {
  @override
  void initState() {
    super.initState();
    // Seeded after the first frame so the notifier's restore-from-prefs has
    // already run and does not overwrite these lines.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final cart = ref.read(cartProvider.notifier)..clear();
      cart.add(_product('kamila', 'Kamila Crepe Abaya, Onyx', '84.00', '120.00'),
          quantity: 2);
      cart.add(_product('rayya', 'Rayya Silk Hijab', '28.00', null));
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: appRouter,
    );
  }
}
