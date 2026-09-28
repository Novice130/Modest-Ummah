import 'dart:io';
import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() async {
  await integrationDriver(
    onScreenshot: (String name, List<int> imageBytes, [Map<String, dynamic>? args]) async {
      final File image = await File(name).create(recursive: true);
      await image.writeAsBytes(imageBytes);
      print('Saved screenshot: $name (${imageBytes.length} bytes)');
      return true;
    },
  );
}
