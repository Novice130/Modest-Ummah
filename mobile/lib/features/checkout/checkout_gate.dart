import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/providers.dart';

bool _settling = false;

/// The way into checkout: a guest signs in first, and comes on to checkout only
/// if they did. Backing out of sign-in returns them to where they were.
Future<void> openCheckout(BuildContext context, WidgetRef ref) async {
  // A double tap must not push twice. Held only while waiting on the session:
  // a pushed route's future may never complete if it is replaced, and holding
  // the flag across that would disable checkout until the app restarts.
  if (_settling) return;
  _settling = true;
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // On a cold start the session may still be being restored, and a customer
    // who is signed in should not be sent to the sign-in screen.
    await ref.read(authProvider.notifier).settled();
  } finally {
    _settling = false;
  }
  if (!context.mounted) return;

  final auth = ref.read(authProvider);
  if (auth.restoreFailed) {
    messenger?.showSnackBar(
      const SnackBar(
        content: Text('Could not reach Modest Ummah. Check your connection.'),
      ),
    );
    return;
  }

  if (!auth.isSignedIn) {
    await context.push('/auth');
    if (!context.mounted || !ref.read(authProvider).isSignedIn) return;
  }

  if (context.mounted) context.push('/checkout');
}
