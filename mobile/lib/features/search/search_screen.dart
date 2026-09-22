import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/providers.dart';
import '../common/product_card.dart';
import '../common/surface_card.dart';
import '../common/states.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  /// 300ms debounce — every keystroke hitting the API would be a request per
  /// character and would make the list flicker between partial matches.
  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).state = value;
    });
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchResultsProvider);
    final query = ref.watch(searchQueryProvider).trim();

    return Scaffold(
      backgroundColor: pageBackdrop(context),
      appBar: AppBar(
        title: const Text('SEARCH'),
        backgroundColor: pageBackdrop(context),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                ProductGrid.outerPadding, 4, ProductGrid.outerPadding, 16),
            child: TextField(
              controller: _controller,
              onChanged: _onChanged,
              autofocus: false,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Necklaces, rings, abayas…',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () {
                          _controller.clear();
                          ref.read(searchQueryProvider.notifier).state = '';
                        },
                      ),
              ),
            ),
          ),
          Expanded(
            child: switch (query.length) {
              < 2 => const MessageState(
                  title: 'What are you looking for?',
                  body: 'Search by name, material or occasion.',
                  icon: Icons.search,
                ),
              _ => results.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  error: (error, _) => MessageState(
                    title: 'Search failed',
                    body: '$error',
                    icon: Icons.error_outline,
                  ),
                  data: (items) => items.isEmpty
                      ? MessageState(
                          title: 'No matches',
                          body: 'Nothing found for “$query”.',
                        )
                      : GridView.builder(
                          padding: const EdgeInsets.fromLTRB(
                              ProductGrid.outerPadding,
                              0,
                              ProductGrid.outerPadding,
                              32),
                          gridDelegate: ProductGrid.delegate(context),
                          itemCount: items.length,
                          itemBuilder: (context, i) =>
                              ProductCard(product: items[i]),
                        ),
                ),
            },
          ),
        ],
      ),
    );
  }
}
