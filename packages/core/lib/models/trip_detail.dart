import 'shuttle.dart';
import 'trip.dart';

/// Réponse de GET /api/v1/trips/:id (module Trips du backend).
class TripDetail {
  const TripDetail({
    required this.id,
    required this.status,
    required this.shuttleType,
    required this.originAddress,
    required this.destinationAddress,
    required this.scheduledAt,
    required this.seats,
    required this.qrCode,
    required this.totalCents,
    this.dispatchAt,
    this.invoiceId,
    this.invoiceNumber,
  });

  /// Facture émise (course terminée ou frais d'annulation) : téléchargeable.
  final String? invoiceId;
  final String? invoiceNumber;

  /// Course en attente de chauffeur : heure de début de la recherche
  /// (le serveur sollicite les chauffeurs à partir de T − 3 h).
  final DateTime? dispatchAt;

  final String id;
  final TripStatus status;
  final ShuttleType? shuttleType;
  final String originAddress;
  final String destinationAddress;
  final DateTime? scheduledAt;
  final int? seats;

  /// QR d'embarquement : fourni par le serveur au seul passager.
  final String? qrCode;
  final int? totalCents;

  /// Le passager peut encore annuler (avant le départ).
  bool get isCancellable => const {
        TripStatus.pending,
        TripStatus.searching,
        TripStatus.noDriver,
        TripStatus.accepted,
      }.contains(status);

  factory TripDetail.fromJson(Map<String, dynamic> json) {
    final origin = json['origin'];
    final destination = json['destination'];
    final booking = json['booking'];
    final price = json['price'];
    if (json['id'] is! String || origin is! Map || destination is! Map) {
      throw const FormatException('Course incomplète dans la réponse du serveur');
    }
    final scheduled = json['scheduledAt'];
    final shuttle = json['shuttleType'];
    final status = json['status'];
    final dispatchAt = json['dispatchAt'];
    final invoice = json['invoice'];
    return TripDetail(
      invoiceId: invoice is Map && invoice['id'] is String ? invoice['id'] as String : null,
      invoiceNumber: invoice is Map && invoice['number'] is String ? invoice['number'] as String : null,
      dispatchAt: dispatchAt is String ? DateTime.tryParse(dispatchAt)?.toLocal() : null,
      id: json['id'] as String,
      status: TripStatus.fromApi(status is String ? status : null),
      shuttleType: ShuttleType.fromApi(shuttle is String ? shuttle : null),
      originAddress: origin['address'] is String ? origin['address'] as String : '',
      destinationAddress: destination['address'] is String ? destination['address'] as String : '',
      scheduledAt: scheduled is String ? DateTime.tryParse(scheduled)?.toLocal() : null,
      seats: booking is Map && booking['seats'] is int ? booking['seats'] as int : null,
      qrCode: booking is Map && booking['qrCode'] is String ? booking['qrCode'] as String : null,
      totalCents: price is Map && price['totalCents'] is int ? price['totalCents'] as int : null,
    );
  }
}
