import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/providers.dart';
import '../theme/app_theme.dart';
import '../../features/account/account_screen.dart';
import '../../features/account/auth_screen.dart';
import '../../features/cart/cart_screen.dart';
import '../../features/checkout/checkout_screen.dart';
import '../../features/orders/orders_screen.dart';
import '../../features/product/product_screen.dart';
import '../../features/saved/saved_screen.dart';
import '../../features/search/search_screen.dart';
import '../../features/shop/shop_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

/// Lets a build start on a specific screen:
///   flutter build ios --dart-define=INITIAL_ROUTE=/product/some-slug
///
/// Needed to capture App Store screenshots without driving the UI by hand, and
/// harmless in a shipping build, where it is unset and falls back to /shop.
const _initialRoute = String.fromEnvironment(
  'INITIAL_ROUTE',
  defaultValue: '/shop',
);

/// Browsing works fully signed out — only checkout and the account tab need an
/// identity. A login wall on launch is a common App Store rejection and costs
/// conversions regardless.
final appRouter = GoRouter(
  navigatorKey: _rootKey,
  initialLocation: _initialRoute,
  routes: [
    ShellRoute(
      navigatorKey: _shellKey,
      builder: (context, state, child) => _TabShell(child: child),
      routes: [
        GoRoute(path: '/shop', builder: (_, __) => const ShopScreen()),
        GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
        GoRoute(path: '/saved', builder: (_, __) => const SavedScreen()),
        GoRoute(path: '/bag', builder: (_, __) => const CartScreen()),
        GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
      ],
    ),

    // Pushed above the tab bar: these are destinations, not sections.
    GoRoute(
      path: '/product/:slug',
      parentNavigatorKey: _rootKey,
      builder: (_, state) =>
          ProductScreen(slug: state.pathParameters['slug']!),
    ),
    GoRoute(
      path: '/checkout',
      parentNavigatorKey: _rootKey,
      builder: (_, __) => const CheckoutScreen(),
    ),
    GoRoute(
      path: '/auth',
      parentNavigatorKey: _rootKey,
      builder: (_, __) => const AuthScreen(),
    ),
    GoRoute(
      path: '/orders',
      parentNavigatorKey: _rootKey,
      builder: (_, __) => const OrdersScreen(),
    ),
  ],
);

class _TabShell extends ConsumerWidget {
  const _TabShell({required this.child});
  final Widget child;

  static const _tabs = [
    ('/shop', Icons.grid_view_outlined, Icons.grid_view, 'Shop'),
    ('/search', Icons.search_outlined, Icons.search, 'Search'),
    ('/saved', Icons.favorite_border, Icons.favorite, 'Saved'),
    ('/bag', Icons.shopping_bag_outlined, Icons.shopping_bag, 'Bag'),
    ('/account', Icons.person_outline, Icons.person, 'Account'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;
    final index = _tabs.indexWhere((t) => location.startsWith(t.$1));
    final bagCount = ref.watch(cartCountProvider);
    final theme = Theme.of(context);

    return Scaffold(
      body: child,
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Divider(height: 1),
          BottomNavigationBar(
            backgroundColor: theme.colorScheme.surface,
            currentIndex: index < 0 ? 0 : index,
            onTap: (i) {
              HapticFeedback.selectionClick();
              context.go(_tabs[i].$1);
            },
            items: [
              for (var i = 0; i < _tabs.length; i++)
                BottomNavigationBarItem(
                  icon: _tabs[i].$1 == '/bag' && bagCount > 0
                      ? Badge(
                          label: Text('$bagCount'),
                          backgroundColor: theme.colorScheme.onSurface,
                          textColor: theme.scaffoldBackgroundColor,
                          child: Icon(_tabs[i].$2, size: 22),
                        )
                      : Icon(_tabs[i].$2, size: 22),
                  activeIcon: _tabs[i].$1 == '/bag' && bagCount > 0
                      ? Badge(
                          label: Text('$bagCount'),
                          backgroundColor: theme.colorScheme.onSurface,
                          textColor: theme.scaffoldBackgroundColor,
                          child: Icon(_tabs[i].$3, size: 22),
                        )
                      : Icon(_tabs[i].$3, size: 22),
                  label: _tabs[i].$4.toUpperCase(),
                ),
            ],
            selectedLabelStyle: AppText.overline.copyWith(fontSize: 9),
            unselectedLabelStyle: AppText.overline.copyWith(fontSize: 9),
          ),
        ],
      ),
    );
  }
}
