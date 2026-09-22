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
import '../common/surface_card.dart';

/// Marketplace-style product page: white cards floating on a tinted backdrop,
/// chrome floating over the photograph rather than sitting in an app bar, and
/// the two commerce actions (add / buy now) side by side above the fold.
class ProductScreen extends ConsumerWidget {
  const ProductScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(slug));

    return product.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, _) => Scaffold(
        body: SafeArea(
          child: MessageState(
            title: 'Could not load this piece',
            body: '$error',
            actionLabel: 'Go back',
            onAction: () => context.pop(),
            icon: Icons.error_outline,
          ),
        ),
      ),
      data: (p) => _ProductBody(product: p),
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
  final _scrollController = ScrollController();
  final _ctaKey = GlobalKey();
  final _relatedKey = GlobalKey();

  /// The sticky bar only appears once the in-card buttons have scrolled off,
  /// so the page never shows two add-to-cart controls at once.
  final _stickyVisible = ValueNotifier<bool>(false);

  int _page = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_syncStickyBar);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_syncStickyBar);
    _pageController.dispose();
    _scrollController.dispose();
    _stickyVisible.dispose();
    super.dispose();
  }

  void _syncStickyBar() {
    final box = _ctaKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final bottom = box.localToGlobal(Offset.zero).dy + box.size.height;
    _stickyVisible.value = bottom < MediaQuery.paddingOf(context).top;
  }

  void _addToCart({bool checkout = false}) {
    final p = widget.product;
    HapticFeedback.mediumImpact();
    ref.read(cartProvider.notifier).add(p);

    if (checkout) {
      context.push('/checkout');
      return;
    }

    final theme = Theme.of(context);
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text('Added to cart', style: theme.textTheme.bodySmall),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 2),
          action: SnackBarAction(
            label: 'VIEW',
            onPressed: () => context.go('/bag'),
          ),
        ),
      );
  }

  void _scrollToRelated() {
    final ctx = _relatedKey.currentContext;
    if (ctx == null) return;
    HapticFeedback.selectionClick();
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
      alignment: 0.05,
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final saved = ref.watch(savedProvider).contains(p.slug);
    final related = ref.watch(relatedProvider(p.slug));
    final hasRelated = related.valueOrNull?.isNotEmpty ?? false;

    return Scaffold(
      backgroundColor: pageBackdrop(context),
      body: CustomScrollView(
        controller: _scrollController,
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: _StatusBarScrim(
              height: MediaQuery.paddingOf(context).top,
              color: pageBackdrop(context),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SurfaceCard(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Gallery(
                      product: p,
                      controller: _pageController,
                      page: _page,
                      saved: saved,
                      onPageChanged: (i) => setState(() => _page = i),
                      onToggleSaved: () {
                        HapticFeedback.lightImpact();
                        ref.read(savedProvider.notifier).toggle(p.slug);
                      },
                      onFindSimilar: hasRelated ? _scrollToRelated : null,
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                      child: _Summary(
                        product: p,
                        ctaKey: _ctaKey,
                        onAdd: () => _addToCart(),
                        onBuyNow: () => _addToCart(checkout: true),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(child: _DetailsCard(product: p)),
          const SliverToBoxAdapter(child: _PolicyCard()),

          if (hasRelated)
            SliverToBoxAdapter(
              child: SurfaceCard(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: _RelatedRow(
                  key: _relatedKey,
                  products: related.value!,
                ),
              ),
            ),

          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
      bottomNavigationBar: ValueListenableBuilder<bool>(
        valueListenable: _stickyVisible,
        builder: (context, visible, _) => AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          transitionBuilder: (child, animation) => SizeTransition(
            sizeFactor: animation,
            alignment: const Alignment(0, -1),
            child: child,
          ),
          child: visible
              ? _StickyBuyBar(
                  key: const ValueKey('sticky'),
                  product: p,
                  onAdd: () => _addToCart(),
                  onBuyNow: () => _addToCart(checkout: true),
                )
              : const SizedBox.shrink(key: ValueKey('hidden')),
        ),
      ),
    );
  }
}

// ─── Shell ───────────────────────────────────────────────

/// An opaque strip the height of the status bar, pinned at the top. Without it
/// the cards scroll under the clock and the two sets of type collide.
class _StatusBarScrim extends SliverPersistentHeaderDelegate {
  const _StatusBarScrim({required this.height, required this.color});

  final double height;
  final Color color;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) =>
      ColoredBox(color: color, child: const SizedBox.expand());

  @override
  bool shouldRebuild(_StatusBarScrim old) =>
      old.height != height || old.color != color;
}

// ─── Gallery ─────────────────────────────────────────────

class _Gallery extends StatelessWidget {
  const _Gallery({
    required this.product,
    required this.controller,
    required this.page,
    required this.saved,
    required this.onPageChanged,
    required this.onToggleSaved,
    required this.onFindSimilar,
  });

  final Product product;
  final PageController controller;
  final int page;
  final bool saved;
  final ValueChanged<int> onPageChanged;
  final VoidCallback onToggleSaved;
  final VoidCallback? onFindSimilar;

  @override
  Widget build(BuildContext context) {
    final p = product;
    final count = p.images.isEmpty ? 1 : p.images.length;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      child: AspectRatio(
        aspectRatio: 4 / 5,
        child: Stack(
          fit: StackFit.expand,
          children: [
            PageView.builder(
              controller: controller,
              itemCount: count,
              onPageChanged: onPageChanged,
              itemBuilder: (context, index) {
                final image = p.images.isEmpty ? null : p.images[index];
                final child = ProductImage(image: image);
                return index == 0
                    ? Hero(tag: 'product-${p.id}', child: child)
                    : child;
              },
            ),

            // Floating chrome. No app bar: the photograph runs to the top of
            // the card and the controls sit on top of it.
            Positioned(
              top: 10,
              left: 10,
              right: 10,
              child: Row(
                children: [
                  _GlassButton(
                    icon: Icons.arrow_back_ios_new,
                    tooltip: 'Back',
                    onTap: () => context.pop(),
                  ),
                  const Spacer(),
                  _GlassButton(
                    icon: Icons.ios_share,
                    tooltip: 'Share',
                    onTap: () => HapticFeedback.selectionClick(),
                  ),
                  const SizedBox(width: 8),
                  _GlassButton(
                    icon: saved ? Icons.favorite : Icons.favorite_border,
                    tint: saved ? Brand.sale : null,
                    tooltip: saved ? 'Remove from saved' : 'Save',
                    onTap: onToggleSaved,
                  ),
                ],
              ),
            ),

            if (count > 1)
              Positioned(
                bottom: 14,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < count; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: i == page ? 16 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: i == page
                              ? Colors.white
                              : Colors.white.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                  ],
                ),
              ),

            if (onFindSimilar != null)
              Positioned(
                right: 10,
                bottom: 10,
                child: _Pill(
                  icon: Icons.search,
                  label: 'Find similar',
                  onTap: onFindSimilar!,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.tint,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: 0.92),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(icon, size: 16, color: tint ?? theme.colorScheme.onSurface),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: theme.colorScheme.onSurface),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppText.bodySmall.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Summary ─────────────────────────────────────────────

class _Summary extends StatelessWidget {
  const _Summary({
    required this.product,
    required this.ctaKey,
    required this.onAdd,
    required this.onBuyNow,
  });

  final Product product;
  final Key ctaKey;
  final VoidCallback onAdd;
  final VoidCallback onBuyNow;

  /// Rounded off the two decimal strings the API sends, never off doubles that
  /// have already been through arithmetic.
  int? get _discountPercent {
    final compare = double.tryParse(product.compareAtPrice ?? '');
    final price = product.priceValue;
    if (compare == null || compare <= 0 || compare <= price) return null;
    return (((compare - price) / compare) * 100).round();
  }

  @override
  Widget build(BuildContext context) {
    final p = product;
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;
    final percent = _discountPercent;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Badge row
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (p.onSale)
              _Badge(
                label: percent == null ? 'Sale' : 'Sale · $percent% off',
                background: dealTint(context),
                foreground: dealColor(context),
              ),
            if (!p.inStock)
              _Badge(
                label: 'Sold out',
                background: theme.scaffoldBackgroundColor,
                foreground: muted ?? Brand.inkMuted,
              ),
            if (p.category != null)
              _Badge(
                label: p.category!.name,
                background: theme.scaffoldBackgroundColor,
                foreground: muted ?? Brand.inkMuted,
              ),
          ],
        ),
        const SizedBox(height: 14),

        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              p.displayPrice,
              style: AppText.price.copyWith(
                fontSize: 26,
                fontWeight: FontWeight.w700,
                color: p.onSale ? dealColor(context) : theme.colorScheme.onSurface,
              ),
            ),
            if (p.onSale && p.displayCompareAt != null) ...[
              const SizedBox(width: 8),
              Text(
                p.displayCompareAt!,
                style: AppText.price.copyWith(
                  fontSize: 14,
                  color: muted,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ],
            if (percent != null) ...[
              const SizedBox(width: 6),
              Text(
                '($percent% off)',
                style: AppText.bodySmall.copyWith(
                  color: dealColor(context),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 10),

        Text(
          p.name,
          style: theme.textTheme.titleMedium?.copyWith(fontSize: 17, height: 1.35),
        ),
        const SizedBox(height: 6),

        Row(
          children: [
            Text('Designed by ', style: AppText.bodySmall.copyWith(color: muted)),
            Text(
              'Modest Ummah',
              style: AppText.bodySmall.copyWith(
                color: theme.colorScheme.onSurface,
                fontWeight: FontWeight.w600,
                decoration: TextDecoration.underline,
              ),
            ),
          ],
        ),

        if (p.shortDescription.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(p.shortDescription, style: theme.textTheme.bodyMedium),
        ],

        const SizedBox(height: 16),
        _MetaStrip(product: p),
        const SizedBox(height: 14),

        Row(
          children: [
            Icon(Icons.lock_outline, size: 14, color: muted),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Secure checkout · Apple Pay and card',
                style: AppText.bodySmall.copyWith(color: muted),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        _BuyActions(
          key: ctaKey,
          product: p,
          onAdd: onAdd,
          onBuyNow: onBuyNow,
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppText.bodySmall.copyWith(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: foreground,
        ),
      ),
    );
  }
}

/// Three facts a shopper checks before buying, in the row the marketplace
/// layout puts them: what it costs to get here, what happens if it is wrong,
/// and whether it can ship at all.
class _MetaStrip extends StatelessWidget {
  const _MetaStrip({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final muted = theme.textTheme.bodySmall?.color;

    final cells = <(String, String)>[
      ('Shipping', 'Free over \$50'),
      ('Returns', '30 days'),
      ('Availability', product.inStock ? 'In stock' : 'Sold out'),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (var i = 0; i < cells.length; i++) ...[
            if (i > 0)
              Container(
                width: 1,
                height: 28,
                color: isDark ? Brand.hairlineDark : Brand.hairline,
              ),
            Expanded(
              child: Column(
                children: [
                  Text(
                    cells[i].$1.toUpperCase(),
                    style: AppText.overline.copyWith(color: muted, fontSize: 10),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    cells[i].$2,
                    textAlign: TextAlign.center,
                    style: AppText.bodySmall.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Pill buttons, side by side. `Buy it now` adds the line and jumps straight
/// to checkout rather than opening the bag.
class _BuyActions extends StatelessWidget {
  const _BuyActions({
    super.key,
    required this.product,
    required this.onAdd,
    required this.onBuyNow,
  });

  final Product product;
  final VoidCallback onAdd;
  final VoidCallback onBuyNow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = product.inStock;
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(999));

    if (!enabled) {
      return SizedBox(
        height: 50,
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(shape: shape),
          child: const Text('SOLD OUT'),
        ),
      );
    }

    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: onAdd,
              style: FilledButton.styleFrom(shape: shape),
              child: const Text('Add to cart'),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: SizedBox(
            height: 50,
            child: OutlinedButton(
              onPressed: onBuyNow,
              style: OutlinedButton.styleFrom(
                shape: shape,
                side: BorderSide(color: theme.colorScheme.onSurface),
              ),
              child: const Text('Buy it now'),
            ),
          ),
        ),
      ],
    );
  }
}

class _StickyBuyBar extends StatelessWidget {
  const _StickyBuyBar({
    super.key,
    required this.product,
    required this.onAdd,
    required this.onBuyNow,
  });

  final Product product;
  final VoidCallback onAdd;
  final VoidCallback onBuyNow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: isDark ? Brand.hairlineDark : Brand.hairline),
        ),
      ),
      child: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: _BuyActions(
          product: product,
          onAdd: onAdd,
          onBuyNow: onBuyNow,
        ),
      ),
    );
  }
}

// ─── Lower cards ─────────────────────────────────────────

class _DetailsCard extends StatelessWidget {
  const _DetailsCard({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final p = product;

    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Expandable(
            title: 'Item details',
            body: p.description.isEmpty ? p.shortDescription : p.description,
            initiallyExpanded: true,
          ),
          _Expandable(
            title: 'Specifications',
            body: 'SKU ${p.sku}\n'
                '${p.inStock ? 'In stock' : 'Currently unavailable'}'
                '${p.category == null ? '' : '\n${p.category!.path.map((c) => c.name).join(' / ')}'}'
                '${p.tags.isEmpty ? '' : '\n${p.tags.map((t) => t.name).join(' · ')}'}',
          ),
        ],
      ),
    );
  }
}

class _PolicyCard extends StatelessWidget {
  const _PolicyCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;

    const rows = <(IconData, String, String)>[
      (
        Icons.local_shipping_outlined,
        'Dispatch',
        'Within two business days, tracked.',
      ),
      (
        Icons.assignment_return_outlined,
        'Returns',
        'Accepted within 30 days in original condition.',
      ),
      (
        Icons.verified_outlined,
        'Quality',
        'Every piece checked by hand before it ships.',
      ),
    ];

    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('SHIPPING & RETURNS', style: AppText.overline.copyWith(color: muted)),
          const SizedBox(height: 14),
          for (final (icon, title, body) in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 18, color: theme.colorScheme.onSurface),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: AppText.bodySmall.copyWith(
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(body, style: AppText.bodySmall.copyWith(color: muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Collapsed by default: the fold is the price and the buy buttons, and
/// pushing those below a wall of copy costs conversions.
class _Expandable extends StatelessWidget {
  const _Expandable({
    required this.title,
    required this.body,
    this.initiallyExpanded = false,
  });

  final String title;
  final String body;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        title: Text(title.toUpperCase(), style: AppText.overline),
        initiallyExpanded: initiallyExpanded,
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
  const _RelatedRow({super.key, required this.products});
  final List<Product> products;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeading('You may also like'),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: ProductGrid.cellHeight(180),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: products.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, i) => SizedBox(
              width: 180,
              child: ProductCard(product: products[i]),
            ),
          ),
        ),
      ],
    );
  }
}
