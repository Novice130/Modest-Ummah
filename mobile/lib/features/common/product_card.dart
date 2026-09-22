import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';
import 'product_image.dart';
import 'surface_card.dart';

/// Grid metrics live here, not in the four screens that draw grids, so the
/// cell can change shape in one place.
abstract final class ProductGrid {
  static const columns = 2;
  static const gutter = 12.0;
  static const outerPadding = 10.0;

  /// Photograph is 4:5; everything under it is type of a known size.
  static const _imageRatio = 5 / 4;
  static const _captionHeight = 104.0;

  static double cellWidth(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width - outerPadding * 2;
    return (width - gutter * (columns - 1)) / columns;
  }

  static double cellHeight(double width) => width * _imageRatio + _captionHeight;

  /// Fixed extent rather than an aspect ratio: the caption is type, so it does
  /// not scale with the cell, and a ratio makes it clip on narrow phones.
  static SliverGridDelegate delegate(BuildContext context) =>
      SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: gutter,
        mainAxisSpacing: gutter,
        mainAxisExtent: cellHeight(cellWidth(context)),
      );

  static const padding = EdgeInsets.symmetric(horizontal: outerPadding);
}

/// The grid cell: a white card with the photograph running to its top edge,
/// the save control floating on the image, and the discount stated on the
/// price rather than in a corner ribbon.
class ProductCard extends ConsumerWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  int? get _discountPercent {
    final compare = double.tryParse(product.compareAtPrice ?? '');
    final price = product.priceValue;
    if (compare == null || compare <= 0 || compare <= price) return null;
    return (((compare - price) / compare) * 100).round();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;
    final saved = ref.watch(savedProvider).contains(product.slug);
    final percent = _discountPercent;

    return SurfaceCard(
      margin: EdgeInsets.zero,
      radius: 14,
      clip: true,
      onTap: () => context.push('/product/${product.slug}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 4 / 5,
                child: Hero(
                  tag: 'product-${product.id}',
                  child: ProductImage(image: product.primaryImage),
                ),
              ),
              if (percent != null)
                Positioned(
                  left: 8,
                  top: 8,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: dealColor(context),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Text(
                      '$percent% off',
                      style: AppText.bodySmall.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              Positioned(
                right: 6,
                top: 6,
                child: _SaveButton(
                  saved: saved,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    ref.read(savedProvider.notifier).toggle(product.slug);
                  },
                ),
              ),
              if (!product.inStock)
                Positioned(
                  left: 8,
                  bottom: 8,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Text(
                      'Sold out',
                      style: AppText.bodySmall.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                  ),
                ),
            ],
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Flexible(
                      child: Text(
                        product.displayPrice,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.price.copyWith(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: product.onSale
                              ? dealColor(context)
                              : theme.colorScheme.onSurface,
                        ),
                      ),
                    ),
                    if (product.onSale && product.displayCompareAt != null) ...[
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          product.displayCompareAt!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.price.copyWith(
                            fontSize: 12,
                            color: muted,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  product.name,
                  style: theme.textTheme.titleMedium?.copyWith(fontSize: 14, height: 1.3),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (product.category != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    product.category!.name.toUpperCase(),
                    style: AppText.overline.copyWith(color: muted, fontSize: 10),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SaveButton extends StatelessWidget {
  const _SaveButton({required this.saved, required this.onTap});

  final bool saved;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface.withValues(alpha: 0.9),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(
          saved ? Icons.favorite : Icons.favorite_border,
          size: 15,
          color: saved ? Brand.sale : theme.colorScheme.onSurface,
        ),
      ),
    );
  }
}

/// Matches ProductCard's metrics so the grid does not reflow when real data
/// replaces the skeleton.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark ? Brand.surfaceDark : const Color(0xFFEFEBE6);

    Widget bar(double width, double height) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: base,
            borderRadius: BorderRadius.circular(3),
          ),
        );

    return SurfaceCard(
      margin: EdgeInsets.zero,
      radius: 14,
      clip: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(aspectRatio: 4 / 5, child: ColoredBox(color: base)),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 12, 10, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                bar(64, 14),
                const SizedBox(height: 10),
                bar(double.infinity, 11),
                const SizedBox(height: 6),
                bar(90, 11),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
