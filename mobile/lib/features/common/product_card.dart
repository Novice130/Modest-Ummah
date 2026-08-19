import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';
import 'product_image.dart';

/// The grid cell.
///
/// No border, no shadow, no rounded corners on the image — the photograph is
/// the card. This is the single decision that makes the grid read as a
/// fashion app rather than a generic store template, so resist adding chrome.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;

    return GestureDetector(
      onTap: () => context.push('/product/${product.slug}'),
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 4 / 5,
            child: Hero(
              tag: 'product-${product.id}',
              child: ProductImage(image: product.primaryImage),
            ),
          ),
          const SizedBox(height: 10),
          if (product.category != null)
            Text(
              product.category!.name.toUpperCase(),
              style: AppText.overline.copyWith(color: muted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          const SizedBox(height: 4),
          Text(
            product.name,
            style: theme.textTheme.titleMedium,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(product.displayPrice, style: AppText.price.copyWith(
                color: product.onSale ? Brand.sale : theme.colorScheme.onSurface,
              )),
              if (product.onSale && product.displayCompareAt != null) ...[
                const SizedBox(width: 8),
                Text(
                  product.displayCompareAt!,
                  style: AppText.price.copyWith(
                    color: muted,
                    decoration: TextDecoration.lineThrough,
                  ),
                ),
              ],
            ],
          ),
        ],
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
          color: base,
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(aspectRatio: 4 / 5, child: ColoredBox(color: base)),
        const SizedBox(height: 10),
        bar(60, 9),
        const SizedBox(height: 8),
        bar(double.infinity, 12),
        const SizedBox(height: 6),
        bar(50, 12),
      ],
    );
  }
}
