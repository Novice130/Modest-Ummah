import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_config.dart';

Future<bool> _openInBrowser(Uri uri) =>
    launchUrl(uri, mode: LaunchMode.externalApplication);

/// Privacy policy and terms, which the website already publishes. Sits on the
/// account tab, which is reachable signed in or out.
class LegalLinks extends StatelessWidget {
  const LegalLinks({super.key, this.launcher = _openInBrowser});

  final Future<bool> Function(Uri) launcher;

  static Uri get privacyUrl => Uri.parse('${ApiConfig.baseUrl}/privacy');
  static Uri get termsUrl => Uri.parse('${ApiConfig.baseUrl}/terms');

  Future<void> _open(BuildContext context, Uri uri) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    var opened = false;
    try {
      opened = await launcher(uri);
    } catch (e) {
      debugPrint('could not open $uri: $e');
    }
    if (!opened) {
      messenger?.showSnackBar(
        SnackBar(content: Text('Could not open the page. It is at $uri')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall;
    return SafeArea(
      top: false,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          TextButton(
            onPressed: () => _open(context, privacyUrl),
            child: Text('Privacy Policy', style: style),
          ),
          TextButton(
            onPressed: () => _open(context, termsUrl),
            child: Text('Terms of Service', style: style),
          ),
        ],
      ),
    );
  }
}
