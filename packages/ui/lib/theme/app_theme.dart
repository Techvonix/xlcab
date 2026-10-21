import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_typography.dart';

/// Assemble les ThemeData Material clair et sombre à partir des tokens
/// définis dans app_colors.dart, app_typography.dart et app_spacing.dart.
class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final background =
        isDark ? AppColors.darkBackground : AppColors.lightBackground;
    final surface = isDark ? AppColors.darkSurface : AppColors.lightSurface;
    final onSurface = isDark ? AppColors.darkText : AppColors.lightText;
    final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    // Identité Orbite. Textes, liens et contours : cyan électrique la nuit, cyan
    // profond le jour (le cyan vif serait illisible sur fond clair).
    final brand = isDark ? AppColors.brand : AppColors.brandDeep;
    final onBrand = isDark ? AppColors.onBrand : Colors.white;
    // Boutons pleins : cyan orbite vif et texte presque noir dans les DEUX thèmes
    // (12:1) — c'est ce qui donne au thème clair son énergie.
    const buttonFill = AppColors.brand;
    const onButtonFill = AppColors.onBrand;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: brand,
      onPrimary: onBrand,
      secondary: AppColors.secondary,
      onSecondary: Colors.white,
      // Utilisés par les puces et segments sélectionnés (FilterChip,
      // ChoiceChip, SegmentedButton) : contraste AA garanti.
      secondaryContainer: isDark ? AppColors.selectionDark : AppColors.selectionLight,
      onSecondaryContainer: isDark ? AppColors.onSelectionDark : AppColors.onSelectionLight,
      tertiary: AppColors.tertiary,
      onTertiary: Colors.white,
      // Textes d'erreur lisibles (AA) : rouge foncé le jour, rouge vif la nuit (5,3 sur la nuit).
      error: isDark ? AppColors.error : AppColors.errorOnLight,
      onError: Colors.white,
      surface: surface,
      onSurface: onSurface,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: background,
      colorScheme: colorScheme,
      fontFamily: 'Inter',

      textTheme: TextTheme(
        displayLarge: AppTypography.display.copyWith(color: onSurface),
        headlineLarge: AppTypography.h1.copyWith(color: onSurface),
        headlineMedium: AppTypography.h2.copyWith(color: onSurface),
        headlineSmall: AppTypography.h3.copyWith(color: onSurface),
        bodyMedium: AppTypography.body.copyWith(color: onSurface),
        bodyLarge: AppTypography.bodyBold.copyWith(color: onSurface),
        labelSmall: AppTypography.caption
            .copyWith(color: onSurface.withValues(alpha: 0.6)),
        labelLarge: AppTypography.button.copyWith(color: Colors.white),
      ),

      // ── Bouton primaire : couleur de marque, hauteur 52, rayon 12 ────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: buttonFill,
          foregroundColor: onButtonFill,
          minimumSize: const Size.fromHeight(AppSpacing.buttonHeight),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          ),
          textStyle: AppTypography.button,
          elevation: 0,
        ),
      ),

      // Boutons pleins (FilledButton) : mêmes couleurs que le bouton primaire.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(backgroundColor: buttonFill, foregroundColor: onButtonFill),
      ),

      // ── Boutons secondaires (contour) et textuels ────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: isDark ? AppColors.primaryOnDark : AppColors.primaryButton,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: isDark ? AppColors.primaryOnDark : AppColors.primaryButton,
        ),
      ),

      // ── Input : hauteur 56, focus bordure 2px Bleu ───────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: BorderSide(color: brand, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: const BorderSide(color: AppColors.error, width: 1.5),
        ),
      ),

      // ── Cartes : rayon 16 ─────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          // Le jour, une carte blanche sur fond glacier se détache par un liseré.
          side: isDark ? BorderSide.none : BorderSide(color: border),
        ),
      ),

      // ── Bottom sheets : rayon 24 en haut ─────────────────────────────
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppSpacing.radiusModal),
          ),
        ),
      ),

      // Barre du bas : blanche le jour, carte nuit le soir ; pas de teinte ajoutée par Material 3.
      navigationBarTheme: NavigationBarThemeData(backgroundColor: surface, surfaceTintColor: Colors.transparent),

      appBarTheme: AppBarTheme(
        backgroundColor: background,
        surfaceTintColor: Colors.transparent,
        foregroundColor: onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: AppTypography.h3.copyWith(color: onSurface),
      ),
    );
  }
}
