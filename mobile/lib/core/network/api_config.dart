/// Where the app talks to.
///
/// Override at build time so a debug build can point at a laptop:
///   flutter run --dart-define=API_BASE_URL=http://192.168.0.132:3112
///
/// Note that an iOS simulator reaches the host over the LAN IP, not
/// localhost, and that ATS blocks plain http from a release build.
abstract final class ApiConfig {
  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://modestummah.com',
  );

  static const apiPrefix = '/api/v1';

  static String get apiBase => '$baseUrl$apiPrefix';

  /// Product images come back as root-relative paths ("/api/media/x.webp"),
  /// because the same payload feeds the web storefront.
  static String resolveMedia(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '$baseUrl$url';
  }
}
