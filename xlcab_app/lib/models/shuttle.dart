import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Les 4 navettes XLCAB (Partie 1.3).
///
/// Chaque navette a un nom, un public cible et une icône en plus de sa
/// couleur : l'information n'est jamais portée par la couleur seule
/// (Partie 5 — Accessibilité).
enum ShuttleType {
  rose('rose', Icons.family_restroom),
  bleue('bleue', Icons.directions_bus_filled),
  orange('orange', Icons.business_center),
  accessibility('accessibility', Icons.accessible_forward);

  const ShuttleType(this.apiValue, this.icon);

  /// Valeur échangée avec l'API (`Trip.shuttleType`, Partie 4).
  final String apiValue;
  String get label => switch (this) {
        rose => l10n.navetteRose,
        bleue => l10n.navetteBleue,
        orange => l10n.navetteOrange,
        accessibility => l10n.navetteAccessibilite,
      };
  String get audience => switch (this) {
        rose => l10n.femmesFamilles,
        bleue => l10n.suburbainMixte,
        orange => l10n.corporateB2b,
        accessibility => l10n.personnesAMobiliteReduite,
      };
  final IconData icon;

  Color get color => AppColors.forShuttleType(apiValue);

  /// null si la valeur reçue de l'API est inconnue (version plus récente
  /// du backend, par exemple) : l'app ne doit pas planter pour autant.
  static ShuttleType? fromApi(String? value) {
    for (final type in values) {
      if (type.apiValue == value) return type;
    }
    return null;
  }
}

/// Une navette sur l'écran 5 (GET /api/v1/shuttles).
class ShuttleOffer {
  const ShuttleOffer({required this.type, required this.fromCents, this.available});

  final ShuttleType type;

  /// Prix TTC du trajet minimal (60 km en France), 1 passager, sans option.
  final int fromCents;

  /// Chauffeur de ce type en ligne à proximité ; null = inconnu (pas de position).
  final bool? available;
}

/// Réponse de GET /api/v1/shuttles.
class ShuttleOverview {
  const ShuttleOverview({required this.minTripKm, required this.currency, required this.offers});

  final int minTripKm;
  final String currency;
  final List<ShuttleOffer> offers;

  factory ShuttleOverview.fromJson(Map<String, dynamic> json) {
    final list = json['shuttles'];
    if (list is! List || json['minTripKm'] is! num) throw const FormatException('Navettes incomplètes');
    final offers = <ShuttleOffer>[];
    for (final raw in list) {
      if (raw is! Map) continue;
      final type = ShuttleType.fromApi(raw['type'] as String?);
      // Type inconnu (backend plus récent) : ignoré plutôt que de planter.
      if (type == null || raw['fromCents'] is! num) continue;
      offers.add(ShuttleOffer(type: type, fromCents: (raw['fromCents'] as num).toInt(), available: raw['available'] as bool?));
    }
    return ShuttleOverview(
      minTripKm: (json['minTripKm'] as num).toInt(),
      currency: json['currency'] is String ? json['currency'] as String : 'EUR',
      offers: offers,
    );
  }
}
