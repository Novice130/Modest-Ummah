import 'package:flutter_test/flutter_test.dart';
import 'package:modest_ummah/core/observability/crash_reporting.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  group('with no DSN', () {
    test('runs the app once and never starts the SDK', () async {
      var runs = 0;
      await runWithCrashReporting(() => runs++, dsn: '');
      expect(runs, 1);
      expect(Sentry.isEnabled, isFalse);
    });

    test('the build default is empty', () async {
      var runs = 0;
      await runWithCrashReporting(() => runs++);
      expect(runs, 1);
      expect(Sentry.isEnabled, isFalse);
    });
  });

  test('options are crash-only with no personal data', () {
    final options = SentryFlutterOptions();
    configureCrashReporting(options, 'https://key@example.invalid/1');

    expect(options.sendDefaultPii, isFalse);
    expect(options.tracesSampleRate, isNull);
    expect(options.enableAutoSessionTracking, isFalse);
    expect(options.enableUserInteractionBreadcrumbs, isFalse);
    expect(options.enableAutoNativeBreadcrumbs, isFalse);
    expect(options.attachScreenshot, isFalse);
    expect(options.beforeSend, isNotNull);
    expect(options.beforeBreadcrumb, isNotNull);
  });

  group('scrubText removes', () {
    final cases = {
      'bearer tokens': 'Authorization: Bearer abc.def-123',
      'JWTs': 'failed for eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl',
      'client secrets': 'pi_3Abc_secret_XyZ123',
      'Stripe keys': 'key sk_live_abc123 and pk_test_def456',
      'email addresses': 'no account for amina@example.com',
      'query tokens': 'GET /x?token=abc123&page=2',
    };
    final secrets = [
      'abc.def-123',
      'eyJ',
      'pi_3Abc',
      'sk_live',
      'pk_test',
      'amina@',
      'abc123',
    ];

    cases.forEach((name, input) {
      test(name, () {
        final out = scrubText(input);
        expect(out, contains('[redacted]'));
        for (final secret in secrets) {
          expect(out, isNot(contains(secret)));
        }
      });
    });

    test('and leaves ordinary text alone', () {
      const text = "type 'Null' is not a subtype of type 'String'";
      expect(scrubText(text), text);
    });
  });

  test('scrubEvent strips user, request, headers and secrets', () {
    final event = SentryEvent(
      user: SentryUser(id: '1', email: 'amina@example.com'),
      request: SentryRequest(headers: {'Authorization': 'Bearer abc'}),
      serverName: 'device-name',
      message: SentryMessage('login failed for amina@example.com'),
      exceptions: [SentryException(type: 'E', value: 'Bearer abc.def')],
      tags: {'authToken': 'abc', 'screen': 'bag'},
      breadcrumbs: [
        Breadcrumb(
          message: 'token=abc123',
          data: {
            'Authorization': 'Bearer abc',
            'nested': {'cookie': 'c', 'url': '/x?token=abc123'},
            'status': 500,
          },
        ),
      ],
    );

    final out = scrubEvent(event);

    expect(out.user, isNull);
    expect(out.request, isNull);
    expect(out.serverName, isNull);
    expect(out.message!.formatted, isNot(contains('amina')));
    expect(out.exceptions!.single.value, isNot(contains('abc')));
    expect(out.tags, {'screen': 'bag'});

    final crumb = out.breadcrumbs!.single;
    expect(crumb.message, '[redacted]');
    expect(crumb.data!.containsKey('Authorization'), isFalse);
    expect(crumb.data!['status'], 500);
    final nested = crumb.data!['nested'] as Map;
    expect(nested.containsKey('cookie'), isFalse);
    expect(nested['url'], '/x?[redacted]');
  });
}
