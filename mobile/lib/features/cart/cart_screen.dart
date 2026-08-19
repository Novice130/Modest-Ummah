import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../common/product_image.dart';
import '../common/states.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(cartProvider);
    final subtotal = ref.watch(cartSubtotalProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('BAG')),
      body: lines.isEmpty
          ? MessageState(
              title: 'Your bag is empty',
              body: 'Pieces you add will appear here.',
              icon: Icons.shopping_bag_outlined,
              actionLabel: 'Browse the shop',
              onAction: () => context.go('/shop'),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              itemCount: lines.length,
              separatorBuilder: (_, __) => const Divider(height: 32),
              itemBuilder: (context, i) => _CartRow(line: lines[i]),
            ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('SUBTOTAL', style: AppText.overline),
                        Text('\$${subtotal.toStringAsFixed(2)}',
                            style: AppText.price.copyWith(fontSize: 16)),
                      ],
                    ),
                  ),
                  // Said plainly, because a total that grows at the next step
                  // without warning is the most common cart abandonment.
                  Text(
                    'Shipping and tax calculated at checkout.',
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 52,
                    child: FilledButton(
                      onPressed: () => context.push('/checkout'),
                      child: const Text('CHECKOUT'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _CartRow extends ConsumerWidget {
  const _CartRow({required this.line});
  final CartLine line;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final p = line.product;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => context.push('/product/${p.slug}'),
          child: SizedBox(
            width: 88,
            child: AspectRatio(
              aspectRatio: 4 / 5,
              child: ProductImage(image: p.primaryImage),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.name, style: theme.textTheme.titleMedium, maxLines: 2,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Text(p.displayPrice, style: AppText.price),
              const SizedBox(height: 12),
              Row(
                children: [
                  _QtyButton(
                    icon: Icons.remove,
                    onTap: () => ref
                        .read(cartProvider.notifier)
                        .setQuantity(p.id, line.quantity - 1),
                  ),
                  SizedBox(
                    width: 40,
                    child: Text('${line.quantity}',
                        textAlign: TextAlign.center, style: AppText.price),
                  ),
                  _QtyButton(
                    icon: Icons.add,
                    onTap: () => ref
                        .read(cartProvider.notifier)
                        .setQuantity(p.id, line.quantity + 1),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      ref.read(cartProvider.notifier).remove(p.id);
                    },
                    child: Text('Remove', style: theme.textTheme.bodySmall),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Icon(icon, size: 15),
      ),
    );
  }
}
