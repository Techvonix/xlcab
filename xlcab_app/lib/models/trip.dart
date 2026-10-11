import 'package:flutter/material.dart';
import 'shuttle.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Statuts de course, alignés sur le backend
/// (xlcab_backend/src/matching/matching.constants.ts).
enum TripStatus {
  pending('pending', Icons.schedule),
  searching('searching', Icons.person_search),
  noDriver('no_driver', Icons.person_off),
  accepted('accepted', Icons.directions_car),
  started('started', Icons.navigation),
  completed('completed', Icons.check_circle),
  cancelled('cancelled', Icons.cancel),

  /// Colis confié à une navette déjà prévue (aller ou retour).
  attached('attached', Icons.inventory_2_outlined),
  unknown('', Icons.help_outline);

  const TripStatus(this.apiValue, this.icon);

  final String apiValue;
  String get label => switch (this) {
        pending => l10n.enAttente,
        searching => l10n.rechercheDUnChauffeur,
        noDriver => l10n.aucunChauffeurDisponible,
        accepted => l10n.chauffeurEnRoute,
        started => l10n.enCours,
        completed => l10n.termine,
        cancelled => l10n.annule,
        attached => l10n.confieAUneNavette,
        unknown => l10n.statutInconnu,
      };
  final IconData icon;

  /// Un chauffeur est attribué : le suivi temps réel est disponible.
  bool get isTrackable => this == accepted || this == started;

  static TripStatus fromApi(String? value) {
    for (final status in values) {
      if (status != unknown && status.apiValue == value) return status;
    }
    return unknown;
  }
}

/// Résumé d'une course pour les listes (Home, historique).
///
/// Contrat attendu de GET /api/v1/bookings/passenger/history (module
/// Bookings) : un tableau JSON
/// d'objets { id, shuttleType, originAddress, destinationAddress,
/// scheduledAt, status, totalPriceCents, currency }.
class TripSummary {
  final String id;
  final ShuttleType? shuttleType;
  final String originAddress;
  final String destinationAddress;
  final DateTime? scheduledAt;
  final TripStatus status;
  final int? totalPriceCents;
  final String currency;

  const TripSummary({
    required this.id,
    required this.shuttleType,
    required this.originAddress,
    required this.destinationAddress,
    required this.scheduledAt,
    required this.status,
    required this.totalPriceCents,
    this.currency = 'EUR',
    this.paidByCompany = false,
    this.parcelId,
  });

  /// Envoi de colis : identifiant pour ouvrir son suivi (écran 12).
  final String? parcelId;

  /// Course facturée à l'entreprise (portail corporate) : rien à payer.
  final bool paidByCompany;

  /// Lève une FormatException si un champ obligatoire manque : une
  /// réponse mal formée doit afficher l'état d'erreur, pas un écran cassé.
  factory TripSummary.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final origin = json['originAddress'];
    final destination = json['destinationAddress'];
    if (id is! String || origin is! String || destination is! String) {
      throw const FormatException('Trajet incomplet dans la réponse du serveur');
    }
    final scheduledAt = json['scheduledAt'];
    final price = json['totalPriceCents'];
    final currency = json['currency'];
    final shuttleType = json['shuttleType'];
    final status = json['status'];
    return TripSummary(
      id: id,
      shuttleType: ShuttleType.fromApi(shuttleType is String ? shuttleType : null),
      originAddress: origin,
      destinationAddress: destination,
      scheduledAt: scheduledAt is String ? DateTime.tryParse(scheduledAt)?.toLocal() : null,
      status: TripStatus.fromApi(status is String ? status : null),
      totalPriceCents: price is int ? price : null,
      currency: currency is String ? currency : 'EUR',
      paidByCompany: json['paidByCompany'] == true,
      parcelId: json['parcelId'] is String ? json['parcelId'] as String : null,
    );
  }
}
