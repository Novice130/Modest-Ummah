import 'dart:convert';
import 'dart:typed_data';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/theme/palette.dart';
import '../../data/models/models.dart';

/// A product image that never pops in.
///
/// The API sends a ~24px base64 LQIP alongside intrinsic dimensions, so the
/// blur is painted immediately underneath while the real bytes stream in.
/// Without this a 2-column grid flashes empty rectangles on every scroll.
class ProductImage extends StatelessWidget {
  const ProductImage({
    super.key,
    required this.image,
    this.fit = BoxFit.cover,
  });

  final ApiImage? image;
  final BoxFit fit;

  static final _lqipCache = <String, Uint8List>{};

  static Uint8List? _decodeLqip(String dataUri) {
    if (dataUri.isEmpty) return null;
    final cached = _lqipCache[dataUri];
    if (cached != null) return cached;

    final comma = dataUri.indexOf(',');
    if (comma < 0) return null;
    try {
      final bytes = base64Decode(dataUri.substring(comma + 1));
      _lqipCache[dataUri] = bytes;
      return bytes;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final img = image;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final placeholderColor = isDark ? Brand.surfaceDark : const Color(0xFFEFEBE6);

    if (img == null || img.url.isEmpty) {
      return ColoredBox(color: placeholderColor, child: const SizedBox.expand());
    }

    final lqip = _decodeLqip(img.lqip);

    return Stack(
      fit: StackFit.expand,
      children: [
        if (lqip != null)
          Image.memory(lqip, fit: fit, gaplessPlayback: true)
        else
          ColoredBox(color: placeholderColor),
        CachedNetworkImage(
          imageUrl: img.absoluteUrl,
          fit: fit,
          fadeInDuration: const Duration(milliseconds: 220),
          placeholder: (_, __) => const SizedBox.shrink(),
          errorWidget: (_, __, ___) => ColoredBox(
            color: placeholderColor,
            child: Icon(Icons.image_not_supported_outlined,
                color: isDark ? Brand.inkMutedDark : Brand.inkMuted, size: 20),
          ),
        ),
      ],
    );
  }
}
