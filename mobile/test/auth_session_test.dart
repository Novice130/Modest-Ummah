import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/providers/providers.dart';

import 'support/fakes.dart';

Future<ProviderContainer> restoredWith(
  FakeSecureStore store,
  FakeAdapter adapter,
) async {
  final container = ProviderContainer(overrides: offlineOverrides(store, adapter));
  addTearDown(container.dispose);
  container.read(authProvider);
  await container.read(authProvider.notifier).settledOnce();
  return container;
}

extension on AuthNotifier {
  /// Waits for the first check without triggering the retry in settled().
  Future<void> settledOnce() async {
    while (!state.restored) {
      await Future<void>.delayed(Duration.zero);
    }
  }
}

void main() {
  test('no stored token: signed out, and nothing is requested', () async {
    final adapter = FakeAdapter((_) => throw StateError('no request expected'));
    final container = await restoredWith(FakeSecureStore(), adapter);

    expect(container.read(authProvider).isSignedIn, isFalse);
    expect(container.read(authProvider).restoreFailed, isFalse);
    expect(adapter.requests, isEmpty);
  });

  test('valid token: signed in', () async {
    final store = FakeSecureStore('good');
    final container = await restoredWith(
      store,
      FakeAdapter((_) => FakeResponse(200, userJson('amina'))),
    );

    expect(container.read(authProvider).user?.id, 'amina');
    expect(store.token, 'good');
  });

  test('a 401 ends the session and clears the token', () async {
    final store = FakeSecureStore('expired');
    final container = await restoredWith(
      store,
      FakeAdapter((_) => const FakeResponse(401, {
            'error': {'message': 'Sign in to continue'},
          })),
    );

    expect(store.token, isNull);
    expect(container.read(authProvider).isSignedIn, isFalse);
    expect(container.read(authProvider).restoreFailed, isFalse);
  });

  test('being offline keeps the token', () async {
    final store = FakeSecureStore('good');
    final container = await restoredWith(store, FakeAdapter((r) => throw offline(r)));

    expect(store.token, 'good');
    expect(container.read(authProvider).restoreFailed, isTrue);
    expect(container.read(authProvider).isSignedIn, isFalse);
  });

  test('a server error keeps the token', () async {
    final store = FakeSecureStore('good');
    final container = await restoredWith(
      store,
      FakeAdapter((_) => const FakeResponse(503, {'error': 'unavailable'})),
    );

    expect(store.token, 'good');
    expect(container.read(authProvider).restoreFailed, isTrue);
  });

  test('retrying after coming back online restores the session', () async {
    final store = FakeSecureStore('good');
    final adapter = FakeAdapter((r) => throw offline(r));
    final container = await restoredWith(store, adapter);
    expect(container.read(authProvider).restoreFailed, isTrue);

    adapter.handler = (_) => FakeResponse(200, userJson('amina'));
    await container.read(authProvider.notifier).retryRestore();

    expect(container.read(authProvider).user?.id, 'amina');
    expect(container.read(authProvider).restoreFailed, isFalse);
  });

  test('settled() retries a failed restore once', () async {
    final adapter = FakeAdapter((r) => throw offline(r));
    final container = await restoredWith(FakeSecureStore('good'), adapter);

    adapter.handler = (_) => FakeResponse(200, userJson('amina'));
    await container.read(authProvider.notifier).settled();

    expect(container.read(authProvider).isSignedIn, isTrue);
  });
}
