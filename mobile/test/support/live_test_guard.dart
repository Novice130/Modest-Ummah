/// Gate for tests that talk to a real server. They register users and create
/// orders and PaymentIntents, so they run only when asked to, and never against
/// production:
///
///   flutter test test/workflow_unit_test.dart \
///     --dart-define=ALLOW_LIVE_API_TESTS=true \
///     --dart-define=API_BASE_URL=http://127.0.0.1:3100
///
/// These are compile-time defines because they are also what the app itself
/// reads, and because an integration test on a device cannot see the host's
/// environment variables.
const _allow = bool.fromEnvironment('ALLOW_LIVE_API_TESTS');
const _baseUrl = String.fromEnvironment('API_BASE_URL');

/// Why live tests must not run, or null if they may.
String? liveTestRefusal({bool allow = _allow, String baseUrl = _baseUrl}) {
  if (!allow) {
    return 'Live tests refused: ALLOW_LIVE_API_TESTS=true is not set.';
  }
  if (baseUrl.isEmpty) {
    return 'Live tests refused: API_BASE_URL is not set, and the app defaults '
        'to production.';
  }
  final host = Uri.tryParse(baseUrl)?.host.toLowerCase() ?? '';
  if (host.isEmpty) {
    return 'Live tests refused: API_BASE_URL has no host.';
  }
  if (host == 'modestummah.com' || host.endsWith('.modestummah.com')) {
    return 'Live tests refused: API_BASE_URL points at production ($host).';
  }
  return null;
}
