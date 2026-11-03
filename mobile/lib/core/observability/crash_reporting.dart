import 'dart:async';

import 'package:sentry_flutter/sentry_flutter.dart';

/// Injected at build time:
///   flutter build ipa --dart-define=SENTRY_DSN=https://…
///
/// Empty (the default) means the SDK is never initialised and the app runs
/// exactly as it does without it.
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

/// Starts [app], with crash reporting around it when a DSN is configured. A
/// reporter that fails to start must never stop the shop from opening.
Future<void> runWithCrashReporting(
  FutureOr<void> Function() app, {
  String dsn = _sentryDsn,
}) async {
  if (dsn.isEmpty) {
    await app();
    return;
  }

  var started = false;
  FutureOr<void> startOnce() {
    started = true;
    return app();
  }

  try {
    await SentryFlutter.init(
      (options) => configureCrashReporting(options, dsn),
      appRunner: startOnce,
    );
  } catch (_) {
    if (!started) await app();
  }
}

/// Crashes only: no tracing, sessions, screenshots, replay or interaction data.
void configureCrashReporting(SentryFlutterOptions options, String dsn) {
  options
    ..dsn = dsn
    ..sendDefaultPii = false
    ..tracesSampleRate = null
    ..enableAutoPerformanceTracing = false
    ..enableUserInteractionTracing = false
    ..enableUserInteractionBreadcrumbs = false
    ..enableAutoSessionTracking = false
    ..enableAppHangTracking = false
    // Native network breadcrumbs would include Stripe's request URLs.
    ..enableAutoNativeBreadcrumbs = false
    ..enablePrintBreadcrumbs = false
    ..attachScreenshot = false
    ..beforeSend = ((event, hint) => scrubEvent(event))
    ..beforeBreadcrumb = ((crumb, hint) => scrubBreadcrumb(crumb));
}

final _secretPatterns = <RegExp>[
  RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', caseSensitive: false),
  // JWT
  RegExp(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?'),
  // Stripe client secrets and keys
  RegExp(r'\b(pi|seti)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+'),
  RegExp(r'\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]+'),
  RegExp(r'\bwhsec_[A-Za-z0-9]+'),
  // Email addresses
  RegExp(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'),
  // key=value pairs in URLs and messages
  RegExp(
    r'\b(token|access_token|id_token|refresh_token|password|client_secret|'
    r'authorization|cookie|api_key)=[^&\s]+',
    caseSensitive: false,
  ),
];

final _secretKey = RegExp(
  r'auth|token|secret|cookie|password|session|email|api[-_]?key',
  caseSensitive: false,
);

const _redacted = '[redacted]';

String scrubText(String text) {
  var out = text;
  for (final pattern in _secretPatterns) {
    out = out.replaceAll(pattern, _redacted);
  }
  return out;
}

Object? _scrubValue(Object? value) => switch (value) {
      final String text => scrubText(text),
      final Map<dynamic, dynamic> map => _scrubMap(map),
      final Iterable<dynamic> list => list.map(_scrubValue).toList(),
      _ => value,
    };

Map<String, dynamic> _scrubMap(Map<dynamic, dynamic> map) => {
      for (final entry in map.entries)
        if (!_secretKey.hasMatch('${entry.key}'))
          '${entry.key}': _scrubValue(entry.value),
    };

/// Applied to every Dart event before it leaves the device.
SentryEvent scrubEvent(SentryEvent event) {
  event
    ..user = null
    ..request = null
    ..serverName = null;

  final message = event.message;
  if (message != null) {
    event.message = SentryMessage(scrubText(message.formatted));
  }
  for (final exception in event.exceptions ?? const <SentryException>[]) {
    final value = exception.value;
    if (value != null) exception.value = scrubText(value);
  }
  final tags = event.tags;
  if (tags != null) {
    event.tags = _scrubMap(tags).cast<String, String>();
  }
  // Deprecated by Sentry, but still sent when set, so it stays scrubbed.
  // ignore: deprecated_member_use
  final extra = event.extra;
  // ignore: deprecated_member_use
  if (extra != null) event.extra = _scrubMap(extra);

  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).nonNulls.toList();
  return event;
}

Breadcrumb? scrubBreadcrumb(Breadcrumb? crumb) {
  if (crumb == null) return null;
  final message = crumb.message;
  if (message != null) crumb.message = scrubText(message);
  final data = crumb.data;
  if (data != null) crumb.data = _scrubMap(data);
  return crumb;
}
