import 'package:flutter/material.dart';

// La couleur d'une navette (`ShuttleType.color`) suit les couleurs partout où elles sont importées.
export 'shuttle_colors.dart';

/// Palette de couleurs XLCAB — identité « Orbite » (2026-10-10) : nuit
/// profonde, cyan électrique, point satellite. Les couleurs des navettes
/// (Partie 5 de la spécification) restent les repères de catégorie :
/// - Rose      : femmes & familles
/// - Bleue     : suburbain mixte
/// - Orange    : corporate / B2B
/// - Accessibilité : PMR
class AppColors {
  AppColors._(); // Constructeur privé : classe statique uniquement.

  // ── Marque Orbite ─────────────────────────────────────────────────────
  /// Cyan orbite : actions et accents sur fond sombre (12:1 sur la nuit).
  static const Color brand = Color(0xFF22D3EE);

  /// Cyan profond : même rôle sur fond clair (5,4:1 sur blanc, texte blanc dessus).
  static const Color brandDeep = Color(0xFF0E7490);

  /// Texte posé sur le cyan orbite (boutons du thème sombre).
  static const Color onBrand = Color(0xFF04202B);

  /// Point satellite du logo, signaux secondaires (fond sombre / fond clair).
  static const Color satellite = Color(0xFFF0ABFC);
  static const Color satelliteDeep = Color(0xFFA21CAF);

  // ── Couleurs des navettes (catégories de service) ─────────────────────
  static const Color primary = Color(0xFFE91E63); // Rose Navette
  static const Color secondary = Color(0xFF2196F3); // Bleu Navette
  static const Color tertiary = Color(0xFFFF9800); // Orange Corporate
  static const Color accessibility = Color(0xFF607D8B); // Neutre PMR

  /// Fond d'un bouton explicite à texte blanc, valable dans les deux thèmes
  /// (5,4:1). Les boutons du thème (ElevatedButton, FilledButton) suivent
  /// plutôt `ColorScheme.primary` : cyan orbite et texte sombre la nuit.
  static const Color primaryButton = brandDeep;

  /// Textes et contours d'action (boutons secondaires) en thème sombre.
  static const Color primaryOnDark = brand;

  // Textes et icônes aux couleurs des navettes, sur fond clair (≥ 4,5:1) :
  // les couleurs de catégorie y sont trop claires.
  static const Color secondaryText = Color(0xFF1565C0); // 5,7:1
  static const Color tertiaryText = Color(0xFFA85A00); // 5,1:1
  static const Color accessibilityText = Color(0xFF546E7A); // 5,4:1

  /// Segments secondaires du symbole quand il est posé sur le cyan.
  static const Color brandTint = Color(0xFFCFFAFE);

  // Conteneurs de sélection (puces, segments) : cyan pâle + cyan très foncé
  // en clair (≈ 6,6:1), l'inverse en sombre.
  static const Color selectionLight = Color(0xFFCFFAFE);
  static const Color onSelectionLight = Color(0xFF155E75);
  static const Color selectionDark = Color(0xFF164E63);
  static const Color onSelectionDark = Color(0xFFE8F1FF);

  // ── Couleurs sémantiques ─────────────────────────────────────────────
  static const Color success = Color(0xFF4CAF50);
  static const Color warning = Color(0xFFFFC107);
  static const Color error = Color(0xFFF44336);

  // ── Thème clair « Orbite Jour » (par défaut depuis le 2026-10-12) ─────
  // Fond bleu glacier très clair, cartes blanches, bordures bleutées : lumineux
  // sans être blanc cru. Les boutons pleins y gardent le cyan orbite vif avec
  // un texte presque noir (12:1) ; le cyan profond sert aux textes et contours.
  static const Color lightBackground = Color(0xFFF1F7FE);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightText = Color(0xFF0B1220);
  static const Color lightBorder = Color(0xFFCBDDF0);

  // ── Thème sombre « Orbite Nuit » (au choix dans le profil) ───────────
  static const Color darkBackground = Color(0xFF070B1A); // nuit
  static const Color darkSurface = Color(0xFF111936); // carte
  static const Color darkText = Color(0xFFE8F1FF);
  static const Color darkBorder = Color(0xFF2A3A66);

  /// Retourne la couleur d'identité associée à un type de navette.
  /// Types attendus : "rose", "bleue", "orange", "accessibility".
  static Color forShuttleType(String shuttleType) {
    switch (shuttleType) {
      case 'rose':
        return primary;
      case 'bleue':
        return secondary;
      case 'orange':
        return tertiary;
      case 'accessibility':
        return accessibility;
      default:
        return secondary;
    }
  }
}
