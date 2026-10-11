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
