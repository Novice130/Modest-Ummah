import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';
import '../common/product_card.dart';
import '../common/states.dart';
import '../common/surface_card.dart';

class ShopScreen extends ConsumerWidget {
  const ShopScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(shopQueryProvider);
    final products = ref.watch(shopProductsProvider);
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      backgroundColor: pageBackdrop(context),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(shopProductsProvider.future),
        child: CustomScrollView(
          slivers: [
            // Compact, left-aligned: a large header spends half the fold on
            // whitespace, and the grid is what the shopper came for.
            SliverAppBar(
              pinned: true,
              backgroundColor: pageBackdrop(context),
              centerTitle: false,
              titleSpacing: ProductGrid.outerPadding,
              title: const Text('MODEST UMMAH'),
              titleTextStyle: AppText.overline.copyWith(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurface,
              ),
              actions: [
                IconButton(
                  onPressed: () => _openFilters(context, ref),
                  icon: const Icon(Icons.tune, size: 20),
                  tooltip: 'Filter and sort',
                ),
              ],
            ),

            // Category rail — horizontal, because a fashion shop's sections
            // are a browsing surface, not a settings list.
            categories.when(
              data: (tree) => SliverToBoxAdapter(
                child: _CategoryRail(tree: tree, active: query.categorySlug),
              ),
              loading: () => const SliverToBoxAdapter(child: SizedBox(height: 52)),
              error: (_, __) => const SliverToBoxAdapter(child: SizedBox.shrink()),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 8)),

            products.when(
              loading: () => const _ProductGridSkeleton(),
              error: (error, _) => SliverFillRemaining(
                hasScrollBody: false,
                child: MessageState(
                  title: 'Could not load the shop',
                  body: '$error',
                  actionLabel: 'Try again',
                  onAction: () => ref.invalidate(shopProductsProvider),
                  icon: Icons.wifi_off,
                ),
              ),
              data: (page) {
                if (page.items.isEmpty) {
                  return const SliverFillRemaining(
                    hasScrollBody: false,
                    child: MessageState(
                      title: 'Nothing here yet',
                      body: 'Try a different category.',
                    ),
                  );
                }
                return _ProductGrid(products: page.items);
              },
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
        ),
      ),
    );
  }

  /// Filters are a sheet, never a pushed page — the customer is mid-browse and
  /// should not lose their place in the grid.
  void _openFilters(BuildContext context, WidgetRef ref) {
    HapticFeedback.selectionClick();
    showCupertinoSheet<void>(
      context: context,
      scrollableBuilder: (_, controller) => _FilterSheet(controller: controller),
    );
  }
}

class _CategoryRail extends ConsumerWidget {
  const _CategoryRail({required this.tree, required this.active});

  final List<Category> tree;
  final String? active;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Flatten one level down: the leaves are what a shopper thinks in
    // ("Rings"), while the roots are the wider sweep ("Jewellery").
    final entries = <Category>[
      for (final root in tree) ...[root, ...root.children],
    ];

    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: ProductGrid.outerPadding),
        itemCount: entries.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final isAll = index == 0;
          final category = isAll ? null : entries[index - 1];
          final slug = category?.slug;
          final selected = isAll ? active == null : active == slug;

          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              ref.read(shopQueryProvider.notifier).update(
                    (q) => isAll
                        ? q.copyWith(clearCategory: true)
                        : q.copyWith(categorySlug: slug),
                  );
            },
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  color: selected
                      ? theme.colorScheme.onSurface
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: selected
                        ? theme.colorScheme.onSurface
                        : (isDark ? Brand.hairlineDark : Brand.hairline),
                  ),
                ),
                child: Text(
                  isAll ? 'All' : category!.name,
                  style: AppText.bodySmall.copyWith(
                    fontWeight: FontWeight.w600,
                    color: selected
                        ? theme.colorScheme.surface
                        : theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid({required this.products});
  final List<Product> products;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: ProductGrid.padding,
      sliver: SliverGrid(
        gridDelegate: ProductGrid.delegate(context),
        delegate: SliverChildBuilderDelegate(
          (context, index) => ProductCard(product: products[index]),
          childCount: products.length,
        ),
      ),
    );
  }
}

class _ProductGridSkeleton extends StatelessWidget {
  const _ProductGridSkeleton();

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: ProductGrid.padding,
      sliver: SliverGrid(
        gridDelegate: ProductGrid.delegate(context),
        delegate: SliverChildBuilderDelegate(
          (_, __) => const ProductCardSkeleton(),
          childCount: 6,
        ),
      ),
    );
  }
}

class _FilterSheet extends ConsumerWidget {
  const _FilterSheet({required this.controller});

  /// Supplied by the sheet route; the inner list must drive it so the
  /// drag-to-dismiss gesture hands off from the scroll correctly.
  final ScrollController controller;

  static const _sorts = [
    ('newest', 'Newest'),
    ('price-asc', 'Price: low to high'),
    ('price-desc', 'Price: high to low'),
    ('name', 'Name'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(shopQueryProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('SORT'),
        leading: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Close', style: theme.textTheme.bodySmall),
        ),
        leadingWidth: 72,
      ),
      body: ListView(
        controller: controller,
        children: [
          for (final (value, label) in _sorts)
            ListTile(
              title: Text(label, style: theme.textTheme.bodyMedium),
              trailing: query.sort == value
                  ? const Icon(Icons.check, size: 18)
                  : null,
              onTap: () {
                HapticFeedback.selectionClick();
                ref
                    .read(shopQueryProvider.notifier)
                    .update((q) => q.copyWith(sort: value));
                Navigator.of(context).pop();
              },
            ),
        ],
      ),
    );
  }
}
