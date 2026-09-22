import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';
import '../common/product_image.dart';
import '../common/states.dart';
import '../common/surface_card.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(cartProvider);
    final count = ref.watch(cartCountProvider);

    return Scaffold(
      backgroundColor: pageBackdrop(context),
      appBar: AppBar(
        title: const Text('BAG'),
        backgroundColor: pageBackdrop(context),
      ),
      body: lines.isEmpty
          ? MessageState(
              title: 'Your bag is empty',
              body: 'Pieces you add will appear here.',
              icon: Icons.shopping_bag_outlined,
              actionLabel: 'Browse the shop',
              onAction: () => context.go('/shop'),
            )
          : ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 16),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                  child: Text(
                    '$count ${count == 1 ? 'item' : 'items'}',
                    style: AppText.bodySmall.copyWith(
                      color: Theme.of(context).textTheme.bodySmall?.color,
                    ),
                  ),
                ),
                for (final line in lines) _CartCard(line: line),
              ],
            ),
      bottomNavigationBar: lines.isEmpty ? null : const _CheckoutBar(),
    );
  }
}

/// One line, one card — the same surface the grid and the product page use.
class _CartCard extends ConsumerWidget {
  const _CartCard({required this.line});
  final CartLine line;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.color;
    final p = line.product;

    return SurfaceCard(
      radius: 14,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => context.push('/product/${p.slug}'),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 84,
                child: AspectRatio(
                  aspectRatio: 4 / 5,
                  child: ProductImage(image: p.primaryImage),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        p.name,
                        style: theme.textTheme.titleMedium?.copyWith(fontSize: 15),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    // The line total, not the unit price: this is the number
                    // the shopper is checking against the subtotal below.
                    Text(
                      '\$${line.lineTotal.toStringAsFixed(2)}',
                      style: AppText.price.copyWith(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${p.displayPrice} each'
                  '${p.inStock ? '' : ' · sold out'}',
                  style: AppText.bodySmall.copyWith(
                    color: p.inStock ? muted : Brand.sale,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _QtyStepper(
                      quantity: line.quantity,
                      onChanged: (q) => ref
                          .read(cartProvider.notifier)
                          .setQuantity(p.id, q),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        ref.read(cartProvider.notifier).remove(p.id);
                      },
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text('Remove', style: AppText.bodySmall.copyWith(color: muted)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A single pill holding both controls, rather than two bordered squares —
/// one control, one shape.
class _QtyStepper extends StatelessWidget {
  const _QtyStepper({required this.quantity, required this.onChanged});

  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    Widget button(IconData icon, VoidCallback? onTap) => GestureDetector(
          onTap: onTap == null
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  onTap();
                },
          behavior: HitTestBehavior.opaque,
          child: SizedBox(
            width: 34,
            height: 32,
            child: Icon(
              icon,
              size: 15,
              color: onTap == null
                  ? theme.textTheme.bodySmall?.color
                  : theme.colorScheme.onSurface,
            ),
          ),
        );

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: isDark ? Brand.hairlineDark : Brand.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(
            quantity <= 1 ? Icons.delete_outline : Icons.remove,
            () => onChanged(quantity - 1),
          ),
          SizedBox(
            width: 24,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: AppText.price.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          button(Icons.add, () => onChanged(quantity + 1)),
        ],
      ),
    );
  }
}

/// Totals and the checkout button ride together in one pinned card, so the
/// subtotal is never the thing that scrolled off.
class _CheckoutBar extends ConsumerWidget {
  const _CheckoutBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final subtotal = ref.watch(cartSubtotalProvider);

    return Container(
      color: pageBackdrop(context),
      child: SafeArea(
        top: false,
        child: SurfaceCard(
          margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Subtotal', style: theme.textTheme.bodyMedium),
                  Text(
                    '\$${subtotal.toStringAsFixed(2)}',
                    style: AppText.price.copyWith(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // Said plainly, because a total that grows at the next step
              // without warning is the most common cart abandonment.
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Shipping and tax calculated at checkout.',
                  style: theme.textTheme.bodySmall,
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 50,
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.push('/checkout'),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: const Text('Checkout'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
