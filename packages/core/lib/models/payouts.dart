// Compte de versement et reversements d'un opérateur (Stripe Connect).
// Contrats JSON de xlcab_backend/src/payouts. Aucun identifiant Stripe,
// aucune donnée bancaire : XLCAB ne connaît que l'état du compte.

String? _str(Object? v) => v is String ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

/// Où en est le compte de versement.
enum PayoutAccountState {
  /// Jamais commencé.
  none,

  /// Des informations restent à fournir à Stripe.
  incomplete,

  /// Dossier envoyé, vérification par Stripe en cours.
  pending,

  /// Versements possibles.
  ready;

  static PayoutAccountState fromApi(String? v) => switch (v) {
        'incomplete' => PayoutAccountState.incomplete,
        'pending' => PayoutAccountState.pending,
        'ready' => PayoutAccountState.ready,
        _ => PayoutAccountState.none,
      };
}

class PayoutAccount {
  const PayoutAccount({required this.required, required this.state, this.requirementsDue = 0});

  /// Faux tant que le paiement en ligne des lignes et de la bourse n'est pas activé.
  final bool required;
  final PayoutAccountState state;

  /// Nombre d'informations que Stripe attend encore.
  final int requirementsDue;

  bool get ready => state == PayoutAccountState.ready;

  /// Le compte bloque la mise en vente : exigé et pas encore prêt.
  bool get blocksSelling => required && !ready;

  factory PayoutAccount.fromJson(Map<String, dynamic>? json) {
    if (json == null || json['state'] is! String) throw const FormatException('Réponse incomplète du serveur');
    return PayoutAccount(
      required: json['required'] == true,
      state: PayoutAccountState.fromApi(_str(json['state'])),
      requirementsDue: _int(json['requirementsDue']) ?? 0,
    );
  }
}

/// État d'un reversement vu par l'opérateur.
enum PayoutStatus {
  /// En cours de virement (rien à faire).
  pending,

  /// Viré sur le compte de versement.
  paid,

  /// En attente : compte de versement à ouvrir ou à compléter.
  blocked,

  /// Entièrement retenu au titre d'une pénalité d'annulation.
  withheld;

  static PayoutStatus fromApi(String? v) => switch (v) {
        'paid' => PayoutStatus.paid,
        'blocked' => PayoutStatus.blocked,
        'withheld' => PayoutStatus.withheld,
        _ => PayoutStatus.pending,
      };
}

class Payout {
  const Payout({
    required this.id,
    required this.tripId,
    required this.amountCents,
    required this.grossCents,
    required this.withheldCents,
    required this.status,
    required this.createdAt,
    this.paidAt,
    this.originAddress,
    this.destinationAddress,
    this.scheduledAt,
  });

  final String id;
  final String tripId;

  /// Montant viré (revenu − retenue).
  final int amountCents;

  /// Revenu du trajet : prix hors taxes moins la commission XLCAB.
  final int grossCents;

  /// Part retenue pour une pénalité d'annulation.
  final int withheldCents;
  final PayoutStatus status;
  final DateTime createdAt;
  final DateTime? paidAt;
  final String? originAddress;
  final String? destinationAddress;
  final DateTime? scheduledAt;

  static Payout? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String || json['tripId'] is! String) return null;
    final amount = _int(json['amountCents']) ?? 0;
    return Payout(
      id: json['id'] as String,
      tripId: json['tripId'] as String,
      amountCents: amount,
      grossCents: _int(json['grossCents']) ?? amount,
      withheldCents: _int(json['withheldCents']) ?? 0,
      status: PayoutStatus.fromApi(_str(json['status'])),
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
      paidAt: _date(json['paidAt']),
      originAddress: _str(json['originAddress']),
      destinationAddress: _str(json['destinationAddress']),
      scheduledAt: _date(json['scheduledAt']),
    );
  }
}

/// Bonus de reprise : versé au chauffeur de secours qui a sauvé un départ,
/// une fois la pénalité du chauffeur remplacé recouvrée.
class RescueBonus {
  const RescueBonus({required this.id, required this.amountCents, required this.status, required this.createdAt, this.paidAt});

  final String id;
  final int amountCents;
  final PayoutStatus status;
  final DateTime createdAt;
  final DateTime? paidAt;

  static RescueBonus? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    return RescueBonus(
      id: json['id'] as String,
      amountCents: _int(json['amountCents']) ?? 0,
      status: PayoutStatus.fromApi(_str(json['status'])),
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
      paidAt: _date(json['paidAt']),
    );
  }
}

class PayoutSummary {
  const PayoutSummary({required this.paidCents, required this.pendingCents, required this.withheldCents, required this.items, this.bonuses = const []});

  final int paidCents;
  final int pendingCents;
  final int withheldCents;
  final List<Payout> items;
  final List<RescueBonus> bonuses;

  factory PayoutSummary.fromJson(Map<String, dynamic>? json) {
    if (json == null || json['items'] is! List) throw const FormatException('Réponse incomplète du serveur');
    return PayoutSummary(
      paidCents: _int(json['paidCents']) ?? 0,
      pendingCents: _int(json['pendingCents']) ?? 0,
      withheldCents: _int(json['withheldCents']) ?? 0,
      items: (json['items'] as List).map(Payout.fromJson).whereType<Payout>().toList(),
      bonuses: json['bonuses'] is List ? (json['bonuses'] as List).map(RescueBonus.fromJson).whereType<RescueBonus>().toList() : const [],
    );
  }
}
