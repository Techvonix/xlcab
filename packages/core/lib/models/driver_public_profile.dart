import 'shuttle.dart';
import 'package:xlcab_core/l10n/l10n.dart';

// Écran 10 (profil chauffeur) et écran 13 (adresses, préférences).
// Contrats : xlcab_backend/src/feedback et src/users/user-settings.ts.

/// Véhicule de la course, tel que montré au passager.
class PublicVehicle {
  const PublicVehicle({
    this.brand,
    this.model,
    this.color,
    this.plate,
    this.shuttleType,
    this.capacity,
    this.pmrEquipped = false,
    this.dashcamActive = false,
  });

  final String? brand;
  final String? model;
  final String? color;

  /// Masquée par le serveur une fois la course terminée.
  final String? plate;
  final ShuttleType? shuttleType;
  final int? capacity;
  final bool pmrEquipped;
  final bool dashcamActive;

  String get description => [brand, model, color].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

  factory PublicVehicle.fromJson(Map<String, dynamic> json) {
    String? str(String k) => json[k] is String ? json[k] as String : null;
    final type = str('shuttleType');
    return PublicVehicle(
      brand: str('brand'),
      model: str('model'),
      color: str('color'),
      plate: str('plate'),
      shuttleType: type == null ? null : ShuttleType.values.where((t) => t.apiValue == type).firstOrNull,
      capacity: json['capacity'] is num ? (json['capacity'] as num).toInt() : null,
      pmrEquipped: json['pmrEquipped'] == true,
      dashcamActive: json['dashcamActive'] == true,
    );
  }
}

/// GET /trips/:id/driver.
class DriverPublicProfile {
  const DriverPublicProfile({
    required this.firstName,
    this.rating,
    this.ratingCount = 0,
    this.totalTrips = 0,
    this.languages = const [],
    this.pmrTrained = false,
    this.vehicle,
    this.myRating,
    this.canRate = false,
  });

  final String firstName;

  /// Null tant qu'aucun passager n'a noté ce chauffeur.
  final double? rating;
  final int ratingCount;
  final int totalTrips;

  /// Codes ISO 639-1 (fr, en, ga…).
  final List<String> languages;
  final bool pmrTrained;
  final PublicVehicle? vehicle;

  /// Note déjà donnée par le passager pour cette course.
  final int? myRating;

  /// Course terminée depuis moins de 7 jours et pas encore notée.
  final bool canRate;

  DriverPublicProfile copyWith({int? myRating, bool? canRate}) => DriverPublicProfile(
        firstName: firstName,
        rating: rating,
        ratingCount: ratingCount,
        totalTrips: totalTrips,
        languages: languages,
        pmrTrained: pmrTrained,
        vehicle: vehicle,
        myRating: myRating ?? this.myRating,
        canRate: canRate ?? this.canRate,
      );

  factory DriverPublicProfile.fromJson(Map<String, dynamic> json) {
    if (json['firstName'] is! String) throw const FormatException('Profil chauffeur incomplet');
    final vehicle = json['vehicle'];
    final mine = json['myRating'];
    return DriverPublicProfile(
      firstName: json['firstName'] as String,
      rating: json['rating'] is num ? (json['rating'] as num).toDouble() : null,
      ratingCount: json['ratingCount'] is num ? (json['ratingCount'] as num).toInt() : 0,
      totalTrips: json['totalTrips'] is num ? (json['totalTrips'] as num).toInt() : 0,
      languages: (json['languages'] is List ? json['languages'] as List : []).whereType<String>().toList(),
      pmrTrained: json['pmrTrained'] == true,
      vehicle: vehicle is Map<String, dynamic> ? PublicVehicle.fromJson(vehicle) : null,
      myRating: mine is Map && mine['stars'] is num ? (mine['stars'] as num).toInt() : null,
      canRate: json['canRate'] == true,
    );
  }
}

/// Motifs du bouton « Signaler » (mêmes valeurs que le serveur).
enum ReportReason {
  comportement,
  conduite,
  vehicule,
  retard,
  autre;

  String get label => switch (this) {
        comportement => l10n.comportementDuChauffeur,
        conduite => l10n.conduiteDangereuse,
        vehicule => l10n.etatDuVehicule,
        retard => l10n.retardImportant,
        autre => l10n.autre,
      };
}

/// Nom affiché d'une langue parlée par le chauffeur.
String languageName(String code) =>
    {
      'fr': l10n.francais,
      'en': l10n.anglais,
      'ga': l10n.irlandais,
      'es': l10n.espagnol,
      'it': l10n.italien,
      'de': l10n.allemand,
      'pt': l10n.portugais,
      'ar': l10n.arabe,
    }[code] ??
    code.toUpperCase();

/// GET/POST /users/me/addresses.
class SavedAddress {
  const SavedAddress(
      {required this.id, required this.label, required this.address, required this.lat, required this.lng});

  final String id;
  final String label;
  final String address;
  final double lat;
  final double lng;

  factory SavedAddress.fromJson(Object? raw) {
    if (raw is! Map ||
        raw['id'] is! String ||
        raw['label'] is! String ||
        raw['address'] is! String ||
        raw['lat'] is! num ||
        raw['lng'] is! num) {
      throw const FormatException('Adresse favorite incomplète');
    }
    return SavedAddress(
      id: raw['id'] as String,
      label: raw['label'] as String,
      address: raw['address'] as String,
      lat: (raw['lat'] as num).toDouble(),
      lng: (raw['lng'] as num).toDouble(),
    );
  }
}

/// GET/PATCH /users/me/preferences.
class NotificationPreferences {
  const NotificationPreferences({this.push = true, this.email = true, this.sms = false, this.marketing = false, this.autoShareTrips = false, this.preferWomanDriver = false});

  final bool push;
  final bool email;
  final bool sms;

  /// Espace sécurité : proposer le partage du trajet aux contacts de confiance à chaque course.
  final bool autoShareTrips;

  /// Préférence (pas une exigence) : une conductrice est sollicitée en premier quand il y en a une.
  final bool preferWomanDriver;

  /// Offres et nouveautés : consentement explicite, jamais coché par défaut.
  final bool marketing;

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) => NotificationPreferences(
        push: json['notifyPush'] != false,
        email: json['notifyEmail'] != false,
        sms: json['notifySms'] == true,
        marketing: json['marketing'] == true,
        autoShareTrips: json['autoShareTrips'] == true,
        preferWomanDriver: json['preferWomanDriver'] == true,
      );
}
