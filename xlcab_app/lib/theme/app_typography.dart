import 'package:flutter/material.dart';

/// Échelle typographique XLCAB — Partie 5 de la spécification maître.
///
/// Titres  : Poppins (400 / 600 / 700)
/// Corps   : Inter (400 / 600 / 700)
/// "Price" utilise des chiffres tabulaires pour un alignement propre.
class AppTypography {
  AppTypography._();

  static const String _headingFont = 'Poppins';
  static const String _bodyFont = 'Inter';

  static const TextStyle display = TextStyle(
    fontFamily: _headingFont,
    fontSize: 34,
    fontWeight: FontWeight.w700,
    height: 1.2,
  );

  static const TextStyle h1 = TextStyle(
    fontFamily: _headingFont,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    height: 1.25,
  );

  static const TextStyle h2 = TextStyle(
    fontFamily: _headingFont,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static const TextStyle h3 = TextStyle(
    fontFamily: _headingFont,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.3,
  );

  static const TextStyle body = TextStyle(
    fontFamily: _bodyFont,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.4,
  );

  static const TextStyle bodyBold = TextStyle(
    fontFamily: _bodyFont,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    height: 1.4,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: _bodyFont,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.3,
  );

  static const TextStyle button = TextStyle(
    fontFamily: _bodyFont,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 1.2,
  );

  /// Style pour les montants (prix). Chiffres tabulaires pour l'alignement
  /// dans les listes de trajets/factures.
  static const TextStyle price = TextStyle(
    fontFamily: _bodyFont,
    fontSize: 20,
    fontWeight: FontWeight.w700,
    height: 1.2,
    fontFeatures: [FontFeature.tabularFigures()],
  );
}
