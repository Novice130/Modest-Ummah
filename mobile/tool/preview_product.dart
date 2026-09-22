// Local-only harness for eyeballing the product page without a backend.
// Not shipped: nothing under tool/ is part of the app bundle.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:modest_ummah/core/providers/providers.dart';
import 'package:modest_ummah/core/theme/app_theme.dart';
import 'package:modest_ummah/data/models/models.dart';
import 'package:modest_ummah/features/product/product_screen.dart';

ApiImage _img(String seed) => ApiImage(
      url: 'https://picsum.photos/seed/$seed/1200/1500',
      alt: seed,
      width: 1200,
      height: 1500,
      lqip: '',
    );

Product _product(String slug, String name, String price, String? compare) =>
    Product(
      id: slug,
      slug: slug,
      name: name,
      shortDescription:
          'Hand-finished in a soft matte crepe, cut to fall clean over the shoulder.',
      description:
          'A everyday abaya in a heavyweight crepe that holds its drape. '
          'Side seam pockets, a covered placket and a hem that clears the floor '
          'by an inch. Machine wash cold, hang to dry.',
      price: price,
      compareAtPrice: compare,
      onSale: compare != null,
      sku: 'MU-${slug.toUpperCase()}',
      inStock: true,
      category: CategoryRef(
        id: 'c1',
        name: 'Abayas',
        slug: 'abayas',
        path: const [
          TagRef(id: 'c0', name: 'Women', slug: 'women'),
          TagRef(id: 'c1', name: 'Abayas', slug: 'abayas'),
        ],
      ),
      tags: const [
        TagRef(id: 't1', name: 'Crepe', slug: 'crepe'),
        TagRef(id: 't2', name: 'Everyday', slug: 'everyday'),
      ],
      images: [_img('$slug-1'), _img('$slug-2'), _img('$slug-3')],
    );

void main() {
  final hero = _product('kamila-abaya', 'Kamila Crepe Abaya, Onyx', '84.00', '120.00');
  final related = [
    _product('nusayba', 'Nusayba Wrap Abaya', '96.00', null),
    _product('safa', 'Safa Pleated Skirt', '52.00', '68.00'),
    _product('rayya', 'Rayya Silk Hijab', '28.00', null),
  ];

  runApp(
    ProviderScope(
      overrides: [
        productProvider(hero.slug).overrideWith((ref) async => hero),
        relatedProvider(hero.slug).overrideWith((ref) async => related),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        routerConfig: GoRouter(
          initialLocation: '/product/${hero.slug}',
          routes: [
            GoRoute(
              path: '/product/:slug',
              builder: (_, state) =>
                  ProductScreen(slug: state.pathParameters['slug']!),
            ),
            GoRoute(path: '/bag', builder: (_, __) => const SizedBox.shrink()),
            GoRoute(path: '/checkout', builder: (_, __) => const SizedBox.shrink()),
          ],
        ),
      ),
    ),
  );
}
