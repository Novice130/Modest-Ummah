import 'package:flutter_test/flutter_test.dart';

import 'support/live_test_guard.dart';

void main() {
  test('this run itself is refused, so the live tests beside it skip', () {
    expect(liveTestRefusal(), isNotNull);
  });

  test('refuses without the explicit flag, even for a safe URL', () {
    expect(liveTestRefusal(allow: false, baseUrl: 'http://127.0.0.1:3100'), isNotNull);
  });

  test('refuses when no base URL is set, because the default is production', () {
    expect(liveTestRefusal(allow: true, baseUrl: ''), contains('API_BASE_URL'));
  });

  test('refuses production hosts in any form', () {
    for (final url in [
      'https://modestummah.com',
      'https://www.modestummah.com/',
      'https://MODESTUMMAH.COM',
      'http://modestummah.com:8080',
    ]) {
      expect(liveTestRefusal(allow: true, baseUrl: url), contains('production'), reason: url);
    }
  });

  test('refuses a URL with no host', () {
    expect(liveTestRefusal(allow: true, baseUrl: 'modestummah.com'), isNotNull);
  });

  test('allows a non-production host when explicitly enabled', () {
    expect(liveTestRefusal(allow: true, baseUrl: 'http://127.0.0.1:3100'), isNull);
    expect(liveTestRefusal(allow: true, baseUrl: 'https://notmodestummah.com'), isNull);
  });
}
