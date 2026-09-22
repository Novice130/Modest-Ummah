// Local-only harness: the shop grid with canned catalogue data.
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

Product _product(
  String slug,
  String name,
  String price,
  String? compare, {
  bool inStock = true,
}) =>
    Product(
      id: slug,
      slug: slug,
      name: name,
      shortDescription: 'Hand-finished, cut to fall clean over the shoulder.',
      description: 'A everyday piece in a heavyweight crepe that holds its drape.',
      price: price,
      compareAtPrice: compare,
      onSale: compare != null,
      sku: 'MU-${slug.toUpperCase()}',
      inStock: inStock,
      category: const CategoryRef(
        id: 'c1',
        name: 'Abayas',
        slug: 'abayas',
        path: [TagRef(id: 'c1', name: 'Abayas', slug: 'abayas')],
      ),
      tags: const [],
      images: [_img('$slug-1')],
    );

void main() {
  final items = [
    _product('kamila', 'Kamila Crepe Abaya, Onyx', '84.00', '120.00'),
    _product('nusayba', 'Nusayba Wrap Abaya in Sand', '96.00', null),
    _product('safa', 'Safa Pleated Skirt', '52.00', '68.00'),
    _product('rayya', 'Rayya Silk Hijab', '28.00', null, inStock: false),
    _product('amina', 'Amina Linen Overcoat', '138.00', null),
    _product('zahra', 'Zahra Zirconia Drop Earrings', '44.00', '60.00'),
  ];

  const categories = [
    Category(
      id: '1',
      name: 'Women',
      slug: 'women',
      description: '',
      image: null,
      children: [
        Category(id: '2', name: 'Abayas', slug: 'abayas', description: '', image: null, children: []),
        Category(id: '3', name: 'Hijabs', slug: 'hijabs', description: '', image: null, children: []),
      ],
    ),
    Category(
      id: '4',
      name: 'Jewellery',
      slug: 'jewellery',
      description: '',
      image: null,
      children: [
        Category(id: '5', name: 'Rings', slug: 'rings', description: '', image: null, children: []),
      ],
    ),
  ];

  runApp(
    ProviderScope(
      overrides: [
        categoriesProvider.overrideWith((ref) async => categories),
        shopProductsProvider.overrideWith(
          (ref) async => Paged(
            items: items,
            page: 1,
            perPage: 24,
            totalItems: items.length,
            totalPages: 1,
          ),
        ),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        routerConfig: appRouter,
      ),
    ),
  );
}
