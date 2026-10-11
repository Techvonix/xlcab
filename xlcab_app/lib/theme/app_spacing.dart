import 'package:flutter/material.dart';

/// Échelle d'espacement, rayons de bordure et ombres — Partie 5.
///
/// L'échelle d'espacement suit une base de 4px, comme spécifié.
class AppSpacing {
  AppSpacing._();

  // ── Espacements (base 4) ─────────────────────────────────────────────
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
  static const double xxxl = 64;

  // ── Rayons de bordure ─────────────────────────────────────────────────
  static const double radiusButton = 12;
  static const double radiusCard = 16;
  static const double radiusInput = 12;
  static const double radiusModal = 24;
  // Avatars : utiliser BorderRadius.circular(size / 2) pour un cercle parfait.

  // ── Zone tactile minimale (accessibilité WCAG) ─────────────────────────
  static const double minTapTarget = 44;

  // ── Hauteurs de composants ─────────────────────────────────────────────
  static const double buttonHeight = 52;
  static const double inputHeight = 56;
  static const double etaBarHeight = 4;
}

/// Ombres XLCAB — 4 niveaux de profondeur.
class AppShadows {
  AppShadows._();

  static const List<BoxShadow> level1 = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.08),
      offset: Offset(0, 1),
      blurRadius: 3,
    ),
  ];

  static const List<BoxShadow> level2 = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.10),
      offset: Offset(0, 4),
      blurRadius: 12,
    ),
  ];

  static const List<BoxShadow> level3 = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.12),
      offset: Offset(0, 8),
      blurRadius: 24,
    ),
  ];

  /// Utilisée pour les éléments ancrés en bas de l'écran (bottom sheets).
  static const List<BoxShadow> level4 = [
    BoxShadow(
      color: Color.fromRGBO(0, 0, 0, 0.08),
      offset: Offset(0, -4),
      blurRadius: 16,
    ),
  ];
}

/// Durées d'animation standard — Partie 5.
class AppDurations {
  AppDurations._();

  static const Duration micro = Duration(milliseconds: 150);
  static const Duration standard = Duration(milliseconds: 300);
  static const Duration screenTransition = Duration(milliseconds: 500);

  static const Curve enterCurve = Curves.easeOut;
  static const Curve exitCurve = Curves.easeIn;
}
