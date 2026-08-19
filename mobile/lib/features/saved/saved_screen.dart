import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../common/product_card.dart';
import '../common/states.dart';

class SavedScreen extends ConsumerWidget {
  const SavedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(savedProductsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('SAVED')),
      body: saved.when(
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (error, _) => MessageState(title: 'Could not load saved', body: '$error'),
        data: (items) => items.isEmpty
            ? MessageState(
                title: 'Nothing saved yet',
                body: 'Tap the heart on a piece to keep it here.',
                icon: Icons.favorite_border,
                actionLabel: 'Browse the shop',
                onAction: () => context.go('/shop'),
              )
            : GridView.builder(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 32,
                  childAspectRatio: 0.52,
                ),
                itemCount: items.length,
                itemBuilder: (context, i) => ProductCard(product: items[i]),
              ),
      ),
    );
  }
}
