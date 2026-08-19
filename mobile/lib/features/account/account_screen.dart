import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';
import '../../core/theme/app_theme.dart';
import '../common/states.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final theme = Theme.of(context);

    if (!auth.restored) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }

    if (!auth.isSignedIn) {
      return Scaffold(
        appBar: AppBar(title: const Text('ACCOUNT')),
        body: MessageState(
          title: 'Sign in',
          body: 'Track orders, save addresses and check out faster.',
          icon: Icons.person_outline,
          actionLabel: 'Sign in or register',
          onAction: () => context.push('/auth'),
        ),
      );
    }

    final user = auth.user!;

    return Scaffold(
      appBar: AppBar(title: const Text('ACCOUNT')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name.isEmpty ? 'Welcome' : user.name,
                    style: theme.textTheme.headlineMedium),
                const SizedBox(height: 4),
                Text(user.email, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          const Divider(height: 1),
          _Row(label: 'Orders', onTap: () => context.push('/orders')),
          const Divider(height: 1),
          _Row(label: 'Saved', onTap: () => context.go('/saved')),
          const Divider(height: 1),
          _Row(
            label: 'Sign out',
            onTap: () => ref.read(authProvider.notifier).signOut(),
          ),
          const Divider(height: 1),
          const SizedBox(height: 40),
          // App Store Guideline 5.1.1(v): an app that creates accounts must
          // let the customer delete one from inside the app. Reviewers test
          // this, so it stays reachable rather than buried behind support.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: TextButton(
              onPressed: () => _confirmDelete(context, ref),
              child: Text(
                'Delete my account',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.error),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    // Captured before the await so the messenger is not read off a context
    // that may have been unmounted while the dialog was open.
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
          'This permanently removes your profile and bag. '
          'Past orders are kept as purchase records but are no longer linked to you. '
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              'Delete',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(authProvider.notifier).deleteAccount();
      messenger.showSnackBar(
        const SnackBar(content: Text('Your account has been deleted.')),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e')));
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(label.toUpperCase(), style: AppText.overline),
      trailing: const Icon(Icons.chevron_right, size: 18),
      onTap: onTap,
    );
  }
}
