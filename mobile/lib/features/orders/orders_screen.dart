import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../common/states.dart';

final ordersProvider = FutureProvider<List<OrderSummary>>(
  (ref) => ref.watch(accountRepositoryProvider).orders(),
);

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('ORDERS')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(ordersProvider.future),
        child: orders.when(
          loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
          error: (error, _) => MessageState(title: 'Could not load orders', body: '$error'),
          data: (items) => items.isEmpty
              ? const MessageState(
                  title: 'No orders yet',
                  body: 'Your purchases will appear here.',
                  icon: Icons.receipt_long_outlined,
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 32),
                  itemBuilder: (context, i) {
                    final order = items[i];
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
                ),
        ),
      ),
    );
  }
}
