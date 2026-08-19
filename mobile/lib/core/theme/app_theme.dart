import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'palette.dart';

/// Fashion-retail typography: a serif for names and headings, a neutral sans
/// for everything functional. Letter-spacing on the small caps is what stops
/// the labels reading like a generic store template.
abstract final class AppText {
  static const _serif = 'PlayfairDisplay';
  static const _sans = 'Inter';

  static const display = TextStyle(
    fontFamily: _serif,
    fontSize: 34,
    height: 1.15,
    fontWeight: FontWeight.w500,
  );

  static const heading = TextStyle(
    fontFamily: _serif,
    fontSize: 24,
    height: 1.2,
    fontWeight: FontWeight.w500,
  );

  static const productName = TextStyle(
    fontFamily: _serif,
    fontSize: 16,
    height: 1.25,
    fontWeight: FontWeight.w400,
  );

  static const body = TextStyle(
    fontFamily: _sans,
    fontSize: 15,
    height: 1.5,
  );

  static const bodySmall = TextStyle(
    fontFamily: _sans,
    fontSize: 13,
    height: 1.45,
  );

  static const price = TextStyle(
    fontFamily: _sans,
    fontSize: 14,
    fontWeight: FontWeight.w500,
  );

  /// Category labels, section eyebrows, button text.
  static const overline = TextStyle(
    fontFamily: _sans,
    fontSize: 11,
    height: 1.2,
    fontWeight: FontWeight.w500,
    letterSpacing: 1.1,
  );

  static const button = TextStyle(
    fontFamily: _sans,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
  );
}

abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final background = isDark ? Brand.paperDark : Brand.cream;
    final surface = isDark ? Brand.surfaceDark : Colors.white;
    final ink = isDark ? Brand.inkDark : Brand.ink;
    final muted = isDark ? Brand.inkMutedDark : Brand.inkMuted;
    final hairline = isDark ? Brand.hairlineDark : Brand.hairline;

    final scheme = ColorScheme(
      brightness: brightness,
      primary: ink,
      onPrimary: background,
      secondary: Brand.gold,
      onSecondary: Brand.charcoal,
      error: Brand.sale,
      onError: Colors.white,
      surface: surface,
      onSurface: ink,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      fontFamily: 'Inter',
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,

      // Chrome gets out of the way; the photography carries the screen.
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        foregroundColor: ink,
        titleTextStyle: AppText.overline.copyWith(color: ink, fontSize: 12),
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),

      dividerTheme: DividerThemeData(color: hairline, thickness: 1, space: 1),

      textTheme: TextTheme(
        displayLarge: AppText.display.copyWith(color: ink),
        headlineMedium: AppText.heading.copyWith(color: ink),
        titleMedium: AppText.productName.copyWith(color: ink),
        bodyMedium: AppText.body.copyWith(color: ink),
        bodySmall: AppText.bodySmall.copyWith(color: muted),
        labelSmall: AppText.overline.copyWith(color: muted),
      ),

      // Square, full-width, high-contrast — the retail convention.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ink,
          foregroundColor: background,
          minimumSize: const Size.fromHeight(52),
          shape: const RoundedRectangleBorder(),
          textStyle: AppText.button,
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          minimumSize: const Size.fromHeight(52),
          side: BorderSide(color: ink),
          shape: const RoundedRectangleBorder(),
          textStyle: AppText.button,
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderSide: BorderSide(color: hairline)),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: hairline)),
        focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: ink)),
        labelStyle: AppText.bodySmall.copyWith(color: muted),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: background,
        selectedItemColor: ink,
        unselectedItemColor: muted,
        selectedLabelStyle: AppText.overline.copyWith(fontSize: 10),
        unselectedLabelStyle: AppText.overline.copyWith(fontSize: 10),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),

      // iOS swipe-back on every pushed route.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
