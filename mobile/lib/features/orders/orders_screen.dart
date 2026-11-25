import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../common/states.dart';

/// Rebuilds when the signed-in user changes, so a list fetched for one customer
/// is never shown to the next on a shared device.
final ordersProvider = FutureProvider<List<OrderSummary>>((ref) async {
  final userId = ref.watch(authProvider.select((auth) => auth.user?.id));
  if (userId == null) return const [];
  return ref.watch(accountRepositoryProvider).orders();
});

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key, this.paymentJustCompleted = false});

  /// Set when arriving straight from a successful payment. The Stripe webhook
  /// writes the order's paid status, so the new order may not be listed yet.
  final bool paymentJustCompleted;

  static const _confirmationPending =
      'We are confirming your order and will email you once that is done. '
      'It will appear here shortly. Pull down to refresh.';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('ORDERS'),
        // Checkout arrives here by replacing the stack, leaving nothing to pop.
        leading: Navigator.of(context).canPop()
            ? null
            : BackButton(onPressed: () => context.go('/account')),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(ordersProvider.future),
        child: orders.when(
          loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
          error: (error, _) => _Refreshable(
            child: MessageState(title: 'Could not load orders', body: '$error'),
          ),
          data: (items) {
            if (items.isEmpty) {
              return _Refreshable(
                child: paymentJustCompleted
                    ? const MessageState(
                        title: 'Payment received',
                        body: _confirmationPending,
                        icon: Icons.hourglass_top_outlined,
                      )
                    : const MessageState(
                        title: 'No orders yet',
                        body: 'Your purchases will appear here.',
                        icon: Icons.receipt_long_outlined,
                      ),
              );
            }

            final offset = paymentJustCompleted ? 1 : 0;
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              itemCount: items.length + offset,
              separatorBuilder: (_, __) => const Divider(height: 32),
              itemBuilder: (context, i) {
                if (i < offset) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Payment received', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text(_confirmationPending, style: theme.textTheme.bodySmall),
                    ],
                  );
                }
                final order = items[i - offset];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(order.orderId, style: AppText.overline),
                        Text(order.status.toUpperCase(),
                            style: AppText.overline.copyWith(
                                color: theme.textTheme.bodySmall?.color)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${order.itemCount} item${order.itemCount == 1 ? '' : 's'}  ·  \$${order.total}',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${order.createdAt.day}/${order.createdAt.month}/${order.createdAt.year}',
                      style: theme.textTheme.bodySmall,
                    ),
                    if (order.trackingNumber != null) ...[
                      const SizedBox(height: 6),
                      Text('Tracking ${order.trackingNumber}',
                          style: theme.textTheme.bodySmall),
                    ],
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// A message that still answers pull-to-refresh, which needs a scrollable.
class _Refreshable extends StatelessWidget {
  const _Refreshable({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(child: child),
        ),
      ),
    );
  }
}
