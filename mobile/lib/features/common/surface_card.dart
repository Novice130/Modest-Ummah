import 'package:flutter/material.dart';
import '../../core/theme/palette.dart';

/// One white panel on the tinted page.
///
/// Every card surface in the app is this widget, so the product page, the
/// grid cell and the sections below them share one radius, one border and one
/// fill — that repetition is what makes the screens read as one store.
class SurfaceCard extends StatelessWidget {
  const SurfaceCard({
    super.key,
    required this.child,
    this.padding,
    this.margin = const EdgeInsets.fromLTRB(10, 0, 10, 10),
    this.radius = 18,
    this.clip = false,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry margin;
  final double radius;

  /// Clip the contents to the radius. Needed whenever a photograph runs to
  /// the card's edge; skipped otherwise, since clipping costs a layer.
  final bool clip;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final borderRadius = BorderRadius.circular(radius);

    final card = Container(
      margin: margin,
      padding: padding,
      clipBehavior: clip ? Clip.antiAlias : Clip.none,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: borderRadius,
        border: Border.all(color: isDark ? Brand.hairlineDark : Brand.hairline),
      ),
      child: child,
    );

    if (onTap == null) return card;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: card,
    );
  }
}

/// The page colour the cards sit on.
Color pageBackdrop(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? Brand.backdropDark
        : Brand.backdrop;

/// The sale green, lifted in dark mode so a discounted price still reads as
/// a discount rather than as muted text.
Color dealColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Brand.dealDark : Brand.deal;

Color dealTint(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? Brand.dealTintDark
        : Brand.dealTint;
