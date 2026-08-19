import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';
import '../common/product_card.dart';
import '../common/product_image.dart';
import '../common/states.dart';

class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(slug));

    return Scaffold(
      body: product.when(
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (error, _) => SafeArea(
          child: MessageState(
            title: 'Could not load this piece',
            body: '$error',
            actionLabel: 'Go back',
            onAction: () => context.pop(),
            icon: Icons.error_outline,
          ),
        ),
        data: (p) => _ProductBody(product: p),
      ),
      bottomNavigationBar: product.maybeWhen(
        data: (p) => _AddToBagBar(product: p),
        orElse: () => null,
      ),
    );
  }
}

class _ProductBody extends ConsumerStatefulWidget {
  const _ProductBody({required this.product});
  final Product product;

  @override
  ConsumerState<_ProductBody> createState() => _ProductBodyState();
}

class _ProductBodyState extends ConsumerState<_ProductBody> {
  final _pageController = PageController();
  int _page = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;
    final saved = ref.watch(savedProvider).contains(p.slug);
    final related = ref.watch(relatedProvider(p.slug));

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          backgroundColor: theme.scaffoldBackgroundColor,
          title: Text(
            p.category?.name.toUpperCase() ?? '',
            style: AppText.overline.copyWith(color: muted),
          ),
          actions: [
            IconButton(
              tooltip: saved ? 'Remove from saved' : 'Save',
              icon: Icon(saved ? Icons.favorite : Icons.favorite_border, size: 20),
              onPressed: () {
                HapticFeedback.lightImpact();
                ref.read(savedProvider.notifier).toggle(p.slug);
              },
            ),
          ],
        ),

        // Full-bleed gallery. Edge to edge, no padding — the photograph is
        // the hero of the screen.
        SliverToBoxAdapter(
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              AspectRatio(
                aspectRatio: 4 / 5,
                child: PageView.builder(
                  controller: _pageController,
                  itemCount: p.images.isEmpty ? 1 : p.images.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, index) {
                    final image = p.images.isEmpty ? null : p.images[index];
                    final child = ProductImage(image: image);
                    return index == 0
                        ? Hero(tag: 'product-${p.id}', child: child)
                        : child;
                  },
                ),
              ),
              if (p.images.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (var i = 0; i < p.images.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: i == _page ? 18 : 6,
                          height: 3,
                          color: i == _page
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.45),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),

        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              if (p.category != null)
                Text(
                  p.category!.path.map((c) => c.name).join('  /  ').toUpperCase(),
                  style: AppText.overline.copyWith(color: muted),
                ),
              const SizedBox(height: 10),
              Text(p.name, style: theme.textTheme.displayLarge?.copyWith(fontSize: 26)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Text(
                    p.displayPrice,
                    style: AppText.price.copyWith(
                      fontSize: 18,
                      color: p.onSale ? Brand.sale : theme.colorScheme.onSurface,
                    ),
                  ),
                  if (p.onSale && p.displayCompareAt != null) ...[
                    const SizedBox(width: 10),
                    Text(
                      p.displayCompareAt!,
                      style: AppText.price.copyWith(
                        fontSize: 16,
                        color: muted,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 20),
              Text(p.shortDescription, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 28),

              _Expandable(title: 'Description', body: p.description),
              _Expandable(
                title: 'Details',
                body: 'SKU ${p.sku}\n'
                    '${p.inStock ? 'In stock' : 'Currently unavailable'}'
                    '${p.tags.isEmpty ? '' : '\n${p.tags.map((t) => t.name).join(' · ')}'}',
              ),
              const _Expandable(
                title: 'Shipping & Returns',
                body: 'Dispatched within two business days. '
                    'Returns accepted within 30 days in original condition.',
              ),

              const SizedBox(height: 40),
            ]),
          ),
        ),

        related.maybeWhen(
          data: (items) => items.isEmpty
              ? const SliverToBoxAdapter(child: SizedBox.shrink())
              : SliverToBoxAdapter(child: _RelatedRow(products: items)),
          orElse: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
        ),

        const SliverToBoxAdapter(child: SizedBox(height: 40)),
      ],
    );
  }
}

/// Collapsed by default: the fold is the price and the add-to-bag, and pushing
/// those below a wall of copy costs conversions.
class _Expandable extends StatelessWidget {
  const _Expandable({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        title: Text(title.toUpperCase(), style: AppText.overline),
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        shape: const Border(),
        collapsedShape: const Border(),
        children: [Text(body, style: theme.textTheme.bodyMedium)],
      ),
    );
  }
}

class _RelatedRow extends StatelessWidget {
  const _RelatedRow({required this.products});
  final List<Product> products;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeading('You may also like'),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 330,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 16),
            itemBuilder: (context, i) => SizedBox(
              width: 170,
              child: ProductCard(product: products[i]),
            ),
          ),
        ),
      ],
    );
  }
}

/// Sticky, always reachable. On a product page this is the only control that
/// matters, so it never scrolls away.
class _AddToBagBar extends ConsumerWidget {
  const _AddToBagBar({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: SizedBox(
        height: 52,
        child: FilledButton(
          onPressed: product.inStock
              ? () {
                  HapticFeedback.mediumImpact();
                  ref.read(cartProvider.notifier).add(product);
                  ScaffoldMessenger.of(context)
                    ..clearSnackBars()
                    ..showSnackBar(
                      SnackBar(
                        content: Text('Added to bag', style: theme.textTheme.bodySmall),
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 2),
                        action: SnackBarAction(
                          label: 'VIEW',
                          onPressed: () => context.go('/bag'),
                        ),
                      ),
                    );
                }
              : null,
          child: Text(product.inStock ? 'ADD TO BAG' : 'SOLD OUT'),
        ),
      ),
    );
  }
}
