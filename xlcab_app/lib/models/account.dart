import 'package:xlcab_app/l10n/l10n.dart';
// Modèles de l'écran 13 (profil). Contrats : xlcab_backend/src/users et
// src/payments (moyens de paiement).

/// GET /users/me.
class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    this.phone,
    this.firstName,
    this.lastName,
    this.createdAt,
  });

  final String id;
  final String email;
  final String? phone;
  final String? firstName;
  final String? lastName;
  final DateTime? createdAt;

  String get displayName {
    final parts = [firstName, lastName].whereType<String>().where((s) => s.trim().isNotEmpty);
    return parts.isEmpty ? email : parts.join(' ');
  }

  /// Initiales de l'avatar (pas de photo de profil pour l'instant).
  String get initials {
    final source = [firstName, lastName].whereType<String>().where((s) => s.isNotEmpty).toList();
    if (source.isEmpty) return email.isEmpty ? '?' : email[0].toUpperCase();
    return source.map((s) => s[0].toUpperCase()).take(2).join();
  }

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    if (json['id'] is! String || json['email'] is! String) {
      throw const FormatException('Profil incomplet dans la réponse du serveur');
    }
    String? str(String k) => json[k] is String ? json[k] as String : null;
    final created = str('createdAt');
    return UserProfile(
      id: json['id'] as String,
      email: json['email'] as String,
      phone: str('phone'),
      firstName: str('firstName'),
      lastName: str('lastName'),
      createdAt: created == null ? null : DateTime.tryParse(created)?.toLocal(),
    );
  }
}

/// Carte enregistrée chez Stripe : jamais le numéro complet.
class SavedCard {
  const SavedCard({required this.id, this.brand, this.last4, this.expMonth, this.expYear});

  final String id;
  final String? brand;
  final String? last4;
  final int? expMonth;
  final int? expYear;

  String get brandLabel => switch (brand) {
        'visa' => 'Visa',
        'mastercard' => 'Mastercard',
        'amex' => 'American Express',
        'cartes_bancaires' => 'Carte Bancaire',
        null => l10n.carte,
        final other => other[0].toUpperCase() + other.substring(1),
      };

  String? get expiry =>
      expMonth == null || expYear == null ? null : '${expMonth.toString().padLeft(2, '0')}/${expYear! % 100}';

  bool isExpired([DateTime? now]) {
    if (expMonth == null || expYear == null) return false;
    final n = now ?? DateTime.now();
    return expYear! < n.year || (expYear == n.year && expMonth! < n.month);
  }

  static SavedCard? fromJson(Object? v) {
    if (v is! Map || v['id'] is! String) return null;
    return SavedCard(
      id: v['id'] as String,
      brand: v['brand'] is String ? v['brand'] as String : null,
      last4: v['last4'] is String ? v['last4'] as String : null,
      expMonth: v['expMonth'] is int ? v['expMonth'] as int : null,
      expYear: v['expYear'] is int ? v['expYear'] as int : null,
    );
  }
}

/// POST /payments/methods : ajout d'une carte dans la feuille Stripe.
class SetupSheetParams {
  const SetupSheetParams({required this.setupIntentClientSecret, required this.customerId, required this.ephemeralKeySecret});

  final String setupIntentClientSecret;
  final String customerId;
  final String ephemeralKeySecret;

  factory SetupSheetParams.fromJson(Object? data) {
    if (data is! Map ||
        data['setupIntentClientSecret'] is! String ||
        data['customerId'] is! String ||
        data['ephemeralKeySecret'] is! String) {
      throw const FormatException('Paramètres d’ajout de carte incomplets');
    }
    return SetupSheetParams(
      setupIntentClientSecret: data['setupIntentClientSecret'] as String,
      customerId: data['customerId'] as String,
      ephemeralKeySecret: data['ephemeralKeySecret'] as String,
    );
  }
}
