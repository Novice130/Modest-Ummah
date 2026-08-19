import 'dart:async';
import 'dart:convert';
// `Category` collides with flutter/foundation's annotation of the same name.
import 'package:flutter/foundation.dart' hide Category;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../network/api_client.dart';
import '../storage/secure_store.dart';
import '../../data/models/models.dart';
import '../../data/repositories/account_repository.dart';
import '../../data/repositories/catalog_repository.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    store: ref.watch(secureStoreProvider),
    // A 401 anywhere means the token is dead. Drop it once, centrally, rather
    // than making every screen handle expiry.
    onUnauthenticated: () async {
      await ref.read(authProvider.notifier).signOutLocally();
    },
  );
});

final catalogRepositoryProvider = Provider<CatalogRepository>(
  (ref) => CatalogRepository(ref.watch(apiClientProvider)),
);

final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => AccountRepository(ref.watch(apiClientProvider)),
);

// ─── Auth ────────────────────────────────────────────────

class AuthState {
  const AuthState({this.user, this.loading = false, this.restored = false});

  final AppUser? user;
  final bool loading;

  /// False until the stored token has been checked, so the UI can avoid
  /// flashing a signed-out state on launch.
  final bool restored;

  bool get isSignedIn => user != null;

  AuthState copyWith({AppUser? user, bool? loading, bool? restored, bool clearUser = false}) =>
      AuthState(
        user: clearUser ? null : (user ?? this.user),
        loading: loading ?? this.loading,
        restored: restored ?? this.restored,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._ref) : super(const AuthState()) {
    _restore();
  }

  final Ref _ref;

  SecureStore get _store => _ref.read(secureStoreProvider);
  AccountRepository get _repo => _ref.read(accountRepositoryProvider);

  Future<void> _restore() async {
    final token = await _store.readToken();
    if (token == null || token.isEmpty) {
      state = state.copyWith(restored: true);
      return;
    }
    try {
      final user = await _repo.me();
      state = state.copyWith(user: user, restored: true);
    } catch (_) {
      // Expired or revoked. Browsing works signed out, so this is not fatal.
      await _store.clearToken();
      state = const AuthState(restored: true);
    }
  }

  Future<void> signIn(String email, String password) async {
    state = state.copyWith(loading: true);
    try {
      final result = await _repo.signIn(email, password);
      await _store.writeToken(result.token);
      state = AuthState(user: result.user, restored: true);
    } finally {
      state = state.copyWith(loading: false);
    }
  }

  Future<void> register(String email, String password, String name) async {
    state = state.copyWith(loading: true);
    try {
      final result = await _repo.register(email, password, name);
      await _store.writeToken(result.token);
      state = AuthState(user: result.user, restored: true);
    } finally {
      state = state.copyWith(loading: false);
    }
  }

  Future<void> signOut() async {
    await _store.clearToken();
    state = const AuthState(restored: true);
  }

  /// Called by the 401 interceptor. Same as signOut but never awaited by UI.
  Future<void> signOutLocally() async {
    if (!mounted) return;
    await _store.clearToken();
    state = const AuthState(restored: true);
  }

  Future<void> deleteAccount() async {
    await _repo.deleteAccount();
    await _store.clearToken();
    state = const AuthState(restored: true);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref),
);

// ─── Catalogue reads ─────────────────────────────────────

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(catalogRepositoryProvider).categories(),
);

final newArrivalsProvider = FutureProvider<List<Product>>(
  (ref) => ref.watch(catalogRepositoryProvider).newArrivals(),
);

final productProvider = FutureProvider.family<Product, String>(
  (ref, slug) => ref.watch(catalogRepositoryProvider).product(slug),
);

final relatedProvider = FutureProvider.family<List<Product>, String>(
  (ref, slug) => ref.watch(catalogRepositoryProvider).related(slug),
);

/// Shop query state — category, tag and sort combine into one filter object so
/// a change to any of them refetches once rather than three times.
class ShopQuery {
  const ShopQuery({this.categorySlug, this.tagSlug, this.sort = 'newest'});

  final String? categorySlug;
  final String? tagSlug;
  final String sort;

  ShopQuery copyWith({
    String? categorySlug,
    String? tagSlug,
    String? sort,
    bool clearCategory = false,
    bool clearTag = false,
  }) =>
      ShopQuery(
        categorySlug: clearCategory ? null : (categorySlug ?? this.categorySlug),
        tagSlug: clearTag ? null : (tagSlug ?? this.tagSlug),
        sort: sort ?? this.sort,
      );

  @override
  bool operator ==(Object other) =>
      other is ShopQuery &&
      other.categorySlug == categorySlug &&
      other.tagSlug == tagSlug &&
      other.sort == sort;

  @override
  int get hashCode => Object.hash(categorySlug, tagSlug, sort);
}

final shopQueryProvider = StateProvider<ShopQuery>((ref) => const ShopQuery());

final shopProductsProvider = FutureProvider<Paged<Product>>((ref) {
  final query = ref.watch(shopQueryProvider);
  return ref.watch(catalogRepositoryProvider).products(
        categorySlug: query.categorySlug,
        tagSlug: query.tagSlug,
        sort: query.sort,
        perPage: 40,
      );
});

final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<Product>>((ref) async {
  final query = ref.watch(searchQueryProvider).trim();
  if (query.length < 2) return const [];
  final result = await ref.watch(catalogRepositoryProvider).search(query);
  return result.items;
});

// ─── Bag ─────────────────────────────────────────────────

/// The bag is local-first: browsing and adding work signed out, and the lines
/// are pushed to the server only once there is an account to attach them to.
/// Checkout re-resolves every price server-side regardless.
class CartNotifier extends StateNotifier<List<CartLine>> {
  CartNotifier(this._ref) : super(const []) {
    _restore();
  }

  final Ref _ref;
  static const _prefsKey = 'bag_v1';

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null) return;

      final decoded = jsonDecode(raw) as List;
      state = decoded
          .map((e) => CartLine(
                product: Product.fromJson(
                    (e as Map<String, dynamic>)['product'] as Map<String, dynamic>),
                quantity: (e['quantity'] as num?)?.toInt() ?? 1,
              ))
          .toList();
    } catch (e) {
      debugPrint('bag restore failed: $e');
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _prefsKey,
      jsonEncode(state
          .map((line) => {
                'quantity': line.quantity,
                'product': {
                  'id': line.product.id,
                  'slug': line.product.slug,
                  'name': line.product.name,
                  'shortDescription': line.product.shortDescription,
                  'description': line.product.description,
                  'price': line.product.price,
                  'compareAtPrice': line.product.compareAtPrice,
                  'onSale': line.product.onSale,
                  'sku': line.product.sku,
                  'inStock': line.product.inStock,
                  'tags': const [],
                  'images': line.product.images
                      .map((i) => {
                            'url': i.url,
                            'alt': i.alt,
                            'w': i.width,
                            'h': i.height,
                            'lqip': i.lqip,
                          })
                      .toList(),
                },
              })
          .toList()),
    );
    unawaited(_sync());
  }

  /// Best-effort push to the server. A failure is silent — the local bag is
  /// still correct, and checkout does not read the server copy.
  Future<void> _sync() async {
    if (!_ref.read(authProvider).isSignedIn) return;
    try {
      await _ref
          .read(accountRepositoryProvider)
          .saveCart(state.map((l) => l.toWire()).toList());
    } catch (e) {
      debugPrint('bag sync failed: $e');
    }
  }

  void add(Product product, {int quantity = 1}) {
    final index = state.indexWhere((l) => l.product.id == product.id);
    if (index >= 0) {
      final line = state[index];
      state = [...state]..[index] =
          line.copyWith(quantity: (line.quantity + quantity).clamp(1, 99));
    } else {
      state = [...state, CartLine(product: product, quantity: quantity)];
    }
    _persist();
  }

  void setQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      remove(productId);
      return;
    }
    state = [
      for (final line in state)
        if (line.product.id == productId)
          line.copyWith(quantity: quantity.clamp(1, 99))
        else
          line,
    ];
    _persist();
  }

  void remove(String productId) {
    state = state.where((l) => l.product.id != productId).toList();
    _persist();
  }

  void clear() {
    state = const [];
    _persist();
  }
}

final cartProvider =
    StateNotifierProvider<CartNotifier, List<CartLine>>((ref) => CartNotifier(ref));

final cartCountProvider = Provider<int>(
  (ref) => ref.watch(cartProvider).fold<int>(0, (sum, l) => sum + l.quantity),
);

final cartSubtotalProvider = Provider<double>(
  (ref) => ref.watch(cartProvider).fold<double>(0, (sum, l) => sum + l.lineTotal),
);

// ─── Saved ───────────────────────────────────────────────

/// Wishlist is device-local by design — there is no server endpoint for it,
/// and inventing one was out of scope for the first release.
class SavedNotifier extends StateNotifier<Set<String>> {
  SavedNotifier() : super(const {}) {
    _restore();
  }

  static const _prefsKey = 'saved_v1';

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    state = (prefs.getStringList(_prefsKey) ?? const []).toSet();
  }

  Future<void> toggle(String slug) async {
    state = state.contains(slug)
        ? (state.toSet()..remove(slug))
        : (state.toSet()..add(slug));
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefsKey, state.toList());
  }
}

final savedProvider =
    StateNotifierProvider<SavedNotifier, Set<String>>((ref) => SavedNotifier());

final savedProductsProvider = FutureProvider<List<Product>>((ref) async {
  final slugs = ref.watch(savedProvider);
  if (slugs.isEmpty) return const [];
  final repo = ref.watch(catalogRepositoryProvider);
  final results = await Future.wait(
    slugs.map((slug) async {
      try {
        return await repo.product(slug);
      } catch (_) {
        // A saved product that was unpublished should drop out quietly.
        return null;
      }
    }),
  );
  return results.whereType<Product>().toList();
});
