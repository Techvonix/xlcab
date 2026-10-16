import 'departure_guarantee.dart';
import 'meeting_point.dart';
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
    this.seatNumbers = const [],
    this.source,
    this.originLat,
    this.originLng,
    this.destinationLat,
    this.destinationLng,
    this.invoiceId,
    this.invoiceNumber,
    this.lineGuarantee,
    this.meetingPoint,
  });

  /// Montée à un point de rencontre : nom, consignes d'accès, transports.
  final RoutePointView? meetingPoint;

  /// Place sur une ligne : seuil de départ garanti (« confirmé » ou « en attente de passagers »).
  final DepartureGuarantee? lineGuarantee;

  /// Facture émise (course terminée ou frais d'annulation) : téléchargeable.
  final String? invoiceId;
  final String? invoiceNumber;

  /// Course en attente de chauffeur : heure de début de la recherche
  /// (le serveur sollicite les chauffeurs à partir de T − 3 h).
  final DateTime? dispatchAt;

  /// instant | line | market (null : serveur plus ancien).
  final String? source;

  /// Réservation d'une place sur une ligne régulière.
  bool get isLine => source == 'line';

  /// Coordonnées des deux adresses : nécessaires pour proposer le trajet retour.
  final double? originLat;
  final double? originLng;
  final double? destinationLat;
  final double? destinationLng;

  final String id;
  final TripStatus status;
  final ShuttleType? shuttleType;
  final String originAddress;
  final String destinationAddress;
  final DateTime? scheduledAt;
  final int? seats;

  /// Sièges numérotés (ligne régulière vendue à la place), sinon vide.
  final List<int> seatNumbers;

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
      source: json['source'] is String ? json['source'] as String : null,
      lineGuarantee: DepartureGuarantee.fromJson(json['lineGuarantee']),
      meetingPoint: RoutePointView.fromJson(json['meetingPoint']),
      originLat: origin['lat'] is num ? (origin['lat'] as num).toDouble() : null,
      originLng: origin['lng'] is num ? (origin['lng'] as num).toDouble() : null,
      destinationLat: destination['lat'] is num ? (destination['lat'] as num).toDouble() : null,
      destinationLng: destination['lng'] is num ? (destination['lng'] as num).toDouble() : null,
      status: TripStatus.fromApi(status is String ? status : null),
      shuttleType: ShuttleType.fromApi(shuttle is String ? shuttle : null),
      originAddress: origin['address'] is String ? origin['address'] as String : '',
      destinationAddress: destination['address'] is String ? destination['address'] as String : '',
      scheduledAt: scheduled is String ? DateTime.tryParse(scheduled)?.toLocal() : null,
      seats: booking is Map && booking['seats'] is int ? booking['seats'] as int : null,
      seatNumbers: booking is Map && booking['seatNumbers'] is List
          ? (booking['seatNumbers'] as List).whereType<num>().map((n) => n.toInt()).toList()
          : const [],
      qrCode: booking is Map && booking['qrCode'] is String ? booking['qrCode'] as String : null,
      totalCents: price is Map && price['totalCents'] is int ? price['totalCents'] as int : null,
    );
  }
}
