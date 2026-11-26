import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/network/api_client.dart';
import 'package:modest_ummah/data/repositories/account_repository.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import 'support/fakes.dart';

const _signedIn = FakeResponse(200, {
  'token': 'session-token',
  // The extra `record` the social routes also send is ignored.
  'record': {'id': 'amina'},
  'user': {'id': 'amina', 'email': 'amina@example.test', 'name': 'Amina', 'avatar': null},
});

void main() {
  late FakeAdapter adapter;

  setUp(() => adapter = FakeAdapter((_) => _signedIn));

  AccountRepository repo({
    Future<String?> Function()? google,
    Future<AppleSignIn> Function()? apple,
  }) =>
      AccountRepository(
        ApiClient(store: FakeSecureStore(), httpAdapter: adapter),
        googleIdToken: google,
        appleSignIn: apple,
      );

  test('Google posts idToken to /api/v1/auth/google and reads the session', () async {
    final result = await repo(google: () async => 'google-jwt').signInWithGoogle();

    expect(result.token, 'session-token');
    expect(result.user.id, 'amina');
    expect(adapter.requests.single.path, '/api/v1/auth/google');
    expect(adapter.requests.single.data, {'idToken': 'google-jwt'});
  });

  test('Apple posts identityToken and name to /api/v1/auth/apple', () async {
    final result = await repo(
      apple: () async => const AppleSignIn(identityToken: 'apple-jwt', name: 'Amina T'),
    ).signInWithApple();

    expect(result.token, 'session-token');
    expect(adapter.requests.single.path, '/api/v1/auth/apple');
    expect(adapter.requests.single.data, {'identityToken': 'apple-jwt', 'name': 'Amina T'});
  });

  group('cancelling', () {
    final isFriendlyCancel = isA<SignInCancelled>().having(
      (e) => e.toString(),
      'message',
      allOf(contains('cancelled'), isNot(contains('Exception'))),
    );

    test('Google returning no account', () {
      expect(repo(google: () async => null).signInWithGoogle(), throwsA(isFriendlyCancel));
    });

    test('Google reporting sign_in_canceled', () {
      expect(
        repo(google: () async => throw PlatformException(code: 'sign_in_canceled'))
            .signInWithGoogle(),
        throwsA(isFriendlyCancel),
      );
    });

    test('Apple reporting canceled', () {
      expect(
        repo(
          apple: () async => throw const SignInWithAppleAuthorizationException(
            code: AuthorizationErrorCode.canceled,
            message: 'The operation couldn’t be completed. (error 1001.)',
          ),
        ).signInWithApple(),
        throwsA(isFriendlyCancel),
      );
    });

    test('sends nothing to the server', () async {
      await expectLater(
        repo(google: () async => null).signInWithGoogle(),
        throwsA(isA<SignInCancelled>()),
      );
      expect(adapter.requests, isEmpty);
    });
  });

  group('native failures read as a plain message, not exception text', () {
    final isFriendlyFailure = isA<SocialSignInFailed>().having(
      (e) => e.toString(),
      'message',
      allOf(contains('could not be completed'), isNot(contains('PlatformException'))),
    );

    test('Google platform error', () {
      expect(
        repo(
          google: () async => throw PlatformException(
            code: 'sign_in_failed',
            message: 'com.google.android.gms.common.api.ApiException: 10',
          ),
        ).signInWithGoogle(),
        throwsA(isFriendlyFailure),
      );
    });

    test('Apple failure other than cancelling', () {
      expect(
        repo(
          apple: () async => throw const SignInWithAppleAuthorizationException(
            code: AuthorizationErrorCode.unknown,
            message: 'error 1000',
          ),
        ).signInWithApple(),
        throwsA(isFriendlyFailure),
      );
    });

    test('Apple returning no identity token', () {
      expect(
        repo(apple: () async => const AppleSignIn(identityToken: null, name: null))
            .signInWithApple(),
        throwsA(isFriendlyFailure),
      );
    });
  });

  test('a server rejection keeps the server\'s own message', () {
    adapter.handler = (_) => const FakeResponse(401, {'error': 'Invalid or expired Google token'});

    expect(
      repo(google: () async => 'google-jwt').signInWithGoogle(),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Invalid or expired Google token')),
    );
  });
}
