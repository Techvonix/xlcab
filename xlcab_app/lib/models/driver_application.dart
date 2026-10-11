import 'package:flutter/material.dart';
import 'shuttle.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Documents du parcours chauffeur, alignés sur le backend
/// (xlcab_backend/src/drivers/drivers.constants.ts).
enum DriverDocumentType {
  vehicleRegistration('vehicle_registration', Icons.description_outlined),
  vehicleInsurance('vehicle_insurance', Icons.verified_user_outlined),
  technicalControl('technical_control', Icons.fact_check_outlined),
  drivingLicense('driving_license', Icons.badge_outlined),
  vtcCard('vtc_card', Icons.credit_card),
  revtcProof('revtc_proof', Icons.assignment_outlined);

  const DriverDocumentType(this.apiValue, this.icon);

  final String apiValue;
  String get label => switch (this) {
        vehicleRegistration => l10n.carteGrise,
        vehicleInsurance => l10n.attestationDAssurance,
        technicalControl => l10n.controleTechnique,
        drivingLicense => l10n.permisDeConduire,
        vtcCard => l10n.carteProfessionnelleVtc,
        revtcProof => l10n.justificatifRevtcFacultatif,
      };
  final IconData icon;

  /// Étape 2 : documents du véhicule.
  static const vehicleDocuments = [vehicleRegistration, vehicleInsurance, technicalControl];

  /// Étape 3 : documents personnels (VTC, REVTC).
  static const personalDocuments = [drivingLicense, vtcCard, revtcProof];

  /// Obligatoires en France (carte VTC exigée, Partie 11.2).
  static const required = [vehicleRegistration, vehicleInsurance, technicalControl, drivingLicense, vtcCard];

  static DriverDocumentType? fromApi(String? value) {
    for (final t in values) {
      if (t.apiValue == value) return t;
    }
    return null;
  }
}

enum DriverApplicationStatus {
  /// Rien d'envoyé : le parcours s'affiche.
  draft,

  /// Dossier en cours de vérification par l'équipe XLCAB.
  pending,

  /// Compte chauffeur validé.
  approved;

  static DriverApplicationStatus fromApi(Object? value) => switch (value) {
        'pending' => pending,
        'approved' => approved,
        _ => draft,
      };
}

/// Réponse de GET /api/v1/drivers/me/profile et POST /api/v1/drivers/apply.
class DriverApplicationView {
  const DriverApplicationView({required this.status, required this.uploaded});

  final DriverApplicationStatus status;

  /// Documents déjà reçus par le serveur.
  final Set<DriverDocumentType> uploaded;

  factory DriverApplicationView.fromJson(Map<String, dynamic> json) {
    final docs = json['documents'];
    return DriverApplicationView(
      status: DriverApplicationStatus.fromApi(json['status']),
      uploaded: {
        if (docs is List)
          for (final d in docs.whereType<Map>())
            if (DriverDocumentType.fromApi(d['type'] is String ? d['type'] as String : null) case final t?) t,
      },
    );
  }
}

/// Saisies du parcours (étapes 1, 3 et 4), envoyées à l'étape 5.
@immutable
class DriverApplicationDraft {
  const DriverApplicationDraft({
    this.firstName = '',
    this.lastName = '',
    this.phone = '',
    this.languages = const {'fr'},
    this.licenseNumber = '',
    this.licenseExpiry,
    this.vtcCardNumber = '',
    this.vtcCardExpiry,
    this.revtcNumber = '',
    this.pmrTrained = false,
    this.brand = '',
    this.model = '',
    this.color = '',
    this.plate = '',
    this.capacity = 8,
    this.shuttleType = ShuttleType.bleue,
    this.pmrEquipped = false,
    this.dashcamInstalled = false,
    this.insuranceExpiry,
    this.technicalControlExpiry,
    this.consent = false,
  });

  final String firstName;
  final String lastName;
  final String phone;
  final Set<String> languages;
  final String licenseNumber;
  final DateTime? licenseExpiry;
  final String vtcCardNumber;
  final DateTime? vtcCardExpiry;
  final String revtcNumber;
  final bool pmrTrained;
  final String brand;
  final String model;
  final String color;
  final String plate;
  final int capacity;
  final ShuttleType shuttleType;
  final bool pmrEquipped;
  final bool dashcamInstalled;
  final DateTime? insuranceExpiry;
  final DateTime? technicalControlExpiry;
  final bool consent;

  static String _date(DateTime d) => DateTime.utc(d.year, d.month, d.day).toIso8601String();

  /// Corps de POST /api/v1/drivers/apply (DriverApplicationDto).
  Map<String, dynamic> toJson() => {
        'personal': {
          'firstName': firstName.trim(),
          'lastName': lastName.trim(),
          'phone': phone,
          'languages': languages.toList(),
        },
        'licenses': {
          'licenseNumber': licenseNumber.trim(),
          'licenseExpiry': _date(licenseExpiry!),
          if (vtcCardNumber.trim().isNotEmpty) 'vtcCardNumber': vtcCardNumber.trim(),
          if (vtcCardExpiry != null) 'vtcCardExpiry': _date(vtcCardExpiry!),
          if (revtcNumber.trim().isNotEmpty) 'revtcNumber': revtcNumber.trim(),
        },
        'vehicle': {
          'brand': brand.trim(),
          'model': model.trim(),
          'color': color.trim(),
          'plate': plate,
          'capacity': capacity,
          'shuttleType': shuttleType.apiValue,
          'pmrEquipped': pmrEquipped,
          'dashcamInstalled': dashcamInstalled,
          'insuranceExpiry': _date(insuranceExpiry!),
          'technicalControlExpiry': _date(technicalControlExpiry!),
        },
        'pmrTrained': pmrTrained,
        'consent': consent,
      };

  DriverApplicationDraft copyWith({
    String? firstName,
    String? lastName,
    String? phone,
    Set<String>? languages,
    String? licenseNumber,
    DateTime? licenseExpiry,
    String? vtcCardNumber,
    DateTime? vtcCardExpiry,
    String? revtcNumber,
    bool? pmrTrained,
    String? brand,
    String? model,
    String? color,
    String? plate,
    int? capacity,
    ShuttleType? shuttleType,
    bool? pmrEquipped,
    bool? dashcamInstalled,
    DateTime? insuranceExpiry,
    DateTime? technicalControlExpiry,
    bool? consent,
  }) {
    return DriverApplicationDraft(
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      phone: phone ?? this.phone,
      languages: languages ?? this.languages,
      licenseNumber: licenseNumber ?? this.licenseNumber,
      licenseExpiry: licenseExpiry ?? this.licenseExpiry,
      vtcCardNumber: vtcCardNumber ?? this.vtcCardNumber,
      vtcCardExpiry: vtcCardExpiry ?? this.vtcCardExpiry,
      revtcNumber: revtcNumber ?? this.revtcNumber,
      pmrTrained: pmrTrained ?? this.pmrTrained,
      brand: brand ?? this.brand,
      model: model ?? this.model,
      color: color ?? this.color,
      plate: plate ?? this.plate,
      capacity: capacity ?? this.capacity,
      shuttleType: shuttleType ?? this.shuttleType,
      pmrEquipped: pmrEquipped ?? this.pmrEquipped,
      dashcamInstalled: dashcamInstalled ?? this.dashcamInstalled,
      insuranceExpiry: insuranceExpiry ?? this.insuranceExpiry,
      technicalControlExpiry: technicalControlExpiry ?? this.technicalControlExpiry,
      consent: consent ?? this.consent,
    );
  }
}
