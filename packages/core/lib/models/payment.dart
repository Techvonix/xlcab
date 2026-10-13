/// Paramètres de la feuille de paiement Stripe, fournis par le serveur
/// (POST /bookings/passenger ou /payments/intent).
class PaymentSheetParams {
  const PaymentSheetParams({
    required this.tripId,
    required this.paymentIntentClientSecret,
    required this.customerId,
    required this.ephemeralKeySecret,
    required this.amountCents,
    required this.currency,
  });

  /// Course payée. Vide pour une empreinte de carte de la bourse : la course
  /// n'existe qu'une fois la proposition confirmée par l'opérateur.
  final String tripId;
  final String paymentIntentClientSecret;
  final String customerId;
  final String ephemeralKeySecret;

  /// Montant fixé par le serveur : c'est lui qui sera débité.
  final int amountCents;
  final String currency;

  factory PaymentSheetParams.fromJson(Object? data) {
    if (data is! Map ||
        data['tripId'] is! String ||
        data['paymentIntentClientSecret'] is! String ||
        data['customerId'] is! String ||
        data['ephemeralKeySecret'] is! String ||
        data['amountCents'] is! int) {
      throw const FormatException('Paramètres de paiement incomplets');
    }
    return PaymentSheetParams(
      tripId: data['tripId'] as String,
      paymentIntentClientSecret: data['paymentIntentClientSecret'] as String,
      customerId: data['customerId'] as String,
      ephemeralKeySecret: data['ephemeralKeySecret'] as String,
      amountCents: data['amountCents'] as int,
      currency: data['currency'] is String ? data['currency'] as String : 'EUR',
    );
  }
}

/// Réservation d'une place de ligne. [payment] est présent quand le paiement
/// en ligne est activé : la réservation n'est confirmée qu'une fois payée.
class LineBooking {
  const LineBooking({required this.tripId, this.payment});

  final String tripId;
  final PaymentSheetParams? payment;

  factory LineBooking.fromJson(Object? data) {
    if (data is! Map || data['tripId'] is! String) throw const FormatException('Réservation sans identifiant');
    return LineBooking(tripId: data['tripId'] as String, payment: data['payment'] == null ? null : PaymentSheetParams.fromJson(data['payment']));
  }
}

/// Choix d'une proposition de la bourse. [payment] est présent quand le
/// paiement en ligne est activé : la carte doit être autorisée (empreinte,
/// sans débit) pour que le choix soit transmis à l'opérateur.
class OfferChoice {
  const OfferChoice({this.payment});

  final PaymentSheetParams? payment;

  bool get needsCard => payment != null;

  factory OfferChoice.fromJson(Object? data) {
    final p = data is Map ? data['payment'] : null;
    if (p == null) return const OfferChoice();
    if (p is! Map || p['paymentIntentClientSecret'] is! String || p['customerId'] is! String || p['ephemeralKeySecret'] is! String || p['amountCents'] is! int) {
      throw const FormatException('Paramètres de paiement incomplets');
    }
    return OfferChoice(
      payment: PaymentSheetParams(
        tripId: '',
        paymentIntentClientSecret: p['paymentIntentClientSecret'] as String,
        customerId: p['customerId'] as String,
        ephemeralKeySecret: p['ephemeralKeySecret'] as String,
        amountCents: p['amountCents'] as int,
        currency: p['currency'] is String ? p['currency'] as String : 'EUR',
      ),
    );
  }
}

/// Issue de la feuille de paiement.
enum PaymentSheetOutcome { completed, canceled, failed }

class PaymentSheetResult {
  const PaymentSheetResult(this.outcome, [this.message]);
  final PaymentSheetOutcome outcome;
  final String? message;
}

/// Réponse de POST /trips/:id/cancel.
class CancelResult {
  const CancelResult({required this.feeCents, required this.refundedCents, required this.refundPending});

  final int feeCents;
  final int refundedCents;

  /// Remboursement à reprendre par l'équipe (incident Stripe).
  final bool refundPending;

  factory CancelResult.fromJson(Object? data) {
    final map = data is Map ? data : const {};
    return CancelResult(
      feeCents: map['feeCents'] is int ? map['feeCents'] as int : 0,
      refundedCents: map['refundedCents'] is int ? map['refundedCents'] as int : 0,
      refundPending: map['refundPending'] == true,
    );
  }
}
