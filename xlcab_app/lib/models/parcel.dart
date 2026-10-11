import 'payment.dart';
import 'place.dart';
import 'package:xlcab_app/l10n/l10n.dart';

// Module Colis (Partie 7, écrans 11 et 12). Contrats :
// xlcab_backend/src/parcels (quote, réservation, suivi, chauffeur).

/// Limites décidées par le porteur de projet (rappelées dans le formulaire).
const parcelMaxWeightKg = 30.0;
const parcelMaxDimensionsCm = [120, 80, 80];

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
double? _double(Object? v) => v is num ? v.toDouble() : null;

/// Le colis tient-il dans 120 × 80 × 80 cm, dans n'importe quel sens ?
bool parcelFits(int length, int width, int height) {
  final dims = [length, width, height]..sort((a, b) => b.compareTo(a));
  for (var i = 0; i < 3; i++) {
    if (dims[i] > parcelMaxDimensionsCm[i]) return false;
  }
  return true;
}

/// Formulaire de l'écran 11.
class ParcelRequest {
  const ParcelRequest({
    required this.pickup,
    required this.delivery,
    required this.scheduledAt,
    required this.weightKg,
    required this.lengthCm,
    required this.widthCm,
    required this.heightCm,
    this.description = '',
    this.isFragile = false,
    this.recipientName = '',
    this.recipientPhone = '',
  });

  final Place pickup;
  final Place delivery;
  final DateTime scheduledAt;
  final double weightKg;
  final int lengthCm;
  final int widthCm;
  final int heightCm;
  final String description;
  final bool isFragile;
  final String recipientName;
  final String recipientPhone;

  Map<String, dynamic> toQuoteJson() => {
        'pickup': {'lat': pickup.lat, 'lng': pickup.lng},
        'delivery': {'lat': delivery.lat, 'lng': delivery.lng},
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        'weightKg': weightKg,
        'lengthCm': lengthCm,
        'widthCm': widthCm,
        'heightCm': heightCm,
      };

  Map<String, dynamic> toBookingJson(ParcelMode mode) => {
        ...toQuoteJson(),
        'mode': mode.apiValue,
        'pickupAddress': pickup.address,
        'deliveryAddress': delivery.address,
        'description': description.trim(),
        'isFragile': isFragile,
        'recipientName': recipientName.trim(),
        'recipientPhone': recipientPhone.trim(),
        // Case cochée obligatoirement dans le formulaire.
        'prohibitedItemsDeclined': true,
      };
}

enum ParcelMode {
  /// Avec une navette déjà prévue sur ce trajet (aller avec des passagers,
  /// ou retour d'un chauffeur qui rentrerait à vide).
  grafted('grafted'),

  /// Navette dédiée au colis.
  dedicated('dedicated');

  const ParcelMode(this.apiValue);
  final String apiValue;
}

class ParcelPrice {
  const ParcelPrice({required this.priceCents, required this.vatCents, required this.totalCents});

  final int priceCents;
  final int vatCents;
  final int totalCents;

  static ParcelPrice? fromJson(Object? v) {
    if (v is! Map || v['totalCents'] is! int) return null;
    return ParcelPrice(
      priceCents: _int(v['priceCents']) ?? 0,
      vatCents: _int(v['vatCents']) ?? 0,
      totalCents: v['totalCents'] as int,
    );
  }
}

/// Une des deux options du devis.
class ParcelOption {
  const ParcelOption({required this.available, this.reason, this.departureAt, this.onReturnLeg = false, this.price});

  final bool available;

  /// Raison de l'indisponibilité (ex. « Distance minimale : 60 km »).
  final String? reason;
  final DateTime? departureAt;

  /// Transporté sur le trajet retour d'un chauffeur (navette partagée).
  final bool onReturnLeg;
  final ParcelPrice? price;

  factory ParcelOption.fromJson(Object? v) {
    if (v is! Map) return const ParcelOption(available: false);
    final price = ParcelPrice.fromJson(v['quote']);
    return ParcelOption(
      available: v['available'] == true && price != null,
      reason: v['reason'] is String ? v['reason'] as String : null,
      departureAt: _date(v['departureAt']),
      onReturnLeg: v['onReturnLeg'] == true,
      price: price,
    );
  }
}

class ParcelQuote {
  const ParcelQuote({required this.grafted, required this.dedicated});

  final ParcelOption grafted;
  final ParcelOption dedicated;

  factory ParcelQuote.fromJson(Map<String, dynamic> json) =>
      ParcelQuote(grafted: ParcelOption.fromJson(json['grafted']), dedicated: ParcelOption.fromJson(json['dedicated']));
}

/// Réponse de POST /bookings/parcel : colis créé + feuille de paiement.
class ParcelBooking {
  const ParcelBooking({required this.parcelId, required this.tripId, required this.payment});

  final String parcelId;
  final String tripId;
  final PaymentSheetParams payment;

  factory ParcelBooking.fromJson(Map<String, dynamic> json) {
    if (json['parcelId'] is! String || json['tripId'] is! String) {
      throw const FormatException('Réservation de colis incomplète');
    }
    return ParcelBooking(
      parcelId: json['parcelId'] as String,
      tripId: json['tripId'] as String,
      payment: PaymentSheetParams.fromJson(json['payment']),
    );
  }
}

/// Statuts du colis (écran 12 : timeline).
enum ParcelStatus {
  awaitingPayment('awaiting_payment'),
  pending('pending'),
  pickedUp('picked_up'),
  inTransit('in_transit'),
  delivered('delivered'),
  failed('failed'),
  cancelled('cancelled');

  const ParcelStatus(this.apiValue);
  final String apiValue;
  String get label => switch (this) {
        awaitingPayment => l10n.paiementEnAttente,
        pending => l10n.enAttenteDEnlevement,
        pickedUp => l10n.prisEnCharge,
        inTransit => l10n.enRoute,
        delivered => l10n.livre,
        failed => l10n.problemeSignale,
        cancelled => l10n.annule,
      };

  static ParcelStatus fromApi(Object? v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => ParcelStatus.pending);
}

/// GET /bookings/parcel/:id (expéditeur).
class ParcelDetail {
  const ParcelDetail({
    required this.id,
    required this.tripId,
    required this.status,
    required this.mode,
    required this.onReturnLeg,
    required this.pickupAddress,
    required this.deliveryAddress,
    required this.departureAt,
    required this.description,
    required this.weightKg,
    required this.isFragile,
    required this.hasPhoto,
    required this.recipientName,
    required this.recipientPhone,
    required this.totalCents,
    required this.createdAt,
    required this.pickedUpAt,
    required this.inTransitAt,
    required this.deliveredAt,
    required this.cancelledAt,
    required this.failureReason,
    required this.driverFirstName,
    required this.vehicleLabel,
    required this.qrCode,
    required this.deliveryCode,
    required this.cancellable,
  });

  final String id;
  final String tripId;
  final ParcelStatus status;
  final ParcelMode mode;
  final bool onReturnLeg;
  final String pickupAddress;
  final String deliveryAddress;
  final DateTime? departureAt;
  final String description;
  final double? weightKg;
  final bool isFragile;
  final bool hasPhoto;
  final String? recipientName;
  final String? recipientPhone;
  final int? totalCents;
  final DateTime? createdAt;
  final DateTime? pickedUpAt;
  final DateTime? inTransitAt;
  final DateTime? deliveredAt;
  final DateTime? cancelledAt;
  final String? failureReason;
  final String? driverFirstName;
  final String? vehicleLabel;

  /// À présenter au chauffeur à l'enlèvement.
  final String? qrCode;

  /// À transmettre au destinataire : il le donne au chauffeur à la remise.
  final String? deliveryCode;
  final bool cancellable;

  factory ParcelDetail.fromJson(Map<String, dynamic> json) {
    if (json['id'] is! String || json['tripId'] is! String) {
      throw const FormatException('Colis incomplet dans la réponse du serveur');
    }
    String? str(Object? v) => v is String ? v : null;
    final pickup = json['pickup'];
    final delivery = json['delivery'];
    final recipient = json['recipient'];
    final timeline = json['timeline'] is Map ? json['timeline'] as Map : const {};
    final driver = json['driver'];
    final vehicle = driver is Map ? driver['vehicle'] : null;
    return ParcelDetail(
      id: json['id'] as String,
      tripId: json['tripId'] as String,
      status: ParcelStatus.fromApi(json['status']),
      mode: json['mode'] == 'dedicated' ? ParcelMode.dedicated : ParcelMode.grafted,
      onReturnLeg: json['onReturnLeg'] == true,
      pickupAddress: pickup is Map ? str(pickup['address']) ?? '' : '',
      deliveryAddress: delivery is Map ? str(delivery['address']) ?? '' : '',
      departureAt: _date(json['departureAt']),
      description: str(json['description']) ?? '',
      weightKg: _double(json['weightKg']),
      isFragile: json['isFragile'] == true,
      hasPhoto: json['hasPhoto'] == true,
      recipientName: recipient is Map ? str(recipient['name']) : null,
      recipientPhone: recipient is Map ? str(recipient['phone']) : null,
      totalCents: _int(json['totalCents']),
      createdAt: _date(timeline['createdAt']),
      pickedUpAt: _date(timeline['pickedUpAt']),
      inTransitAt: _date(timeline['inTransitAt']),
      deliveredAt: _date(timeline['deliveredAt']),
      cancelledAt: _date(timeline['cancelledAt']),
      failureReason: str(json['failureReason']),
      driverFirstName: driver is Map ? str(driver['firstName']) : null,
      vehicleLabel: vehicle is Map
          ? [vehicle['brand'], vehicle['model'], vehicle['color'], vehicle['plate']].whereType<String>().join(' · ')
          : null,
      qrCode: str(json['qrCode']),
      deliveryCode: str(json['deliveryCode']),
      cancellable: json['cancellable'] == true,
    );
  }
}

/// Colis dans une mission du chauffeur (checklist colis, écran 15).
class ParcelTask {
  const ParcelTask({
    required this.id,
    required this.status,
    required this.description,
    required this.weightKg,
    required this.isFragile,
    required this.onReturnLeg,
    required this.pickup,
    required this.delivery,
    required this.senderFirstName,
    required this.senderPhone,
    required this.recipientName,
    required this.recipientPhone,
  });

  final String id;
  final ParcelStatus status;
  final String description;
  final double? weightKg;
  final bool isFragile;
  final bool onReturnLeg;
  final Place pickup;
  final Place delivery;
  final String? senderFirstName;
  final String? senderPhone;
  final String? recipientName;
  final String? recipientPhone;

  bool get toPickUp => status == ParcelStatus.pending;
  bool get onBoard => status == ParcelStatus.pickedUp || status == ParcelStatus.inTransit;
  bool get closed => !toPickUp && !onBoard;

  static Place _place(Object? v) => v is Map
      ? Place(
          address: v['address'] is String ? v['address'] as String : '',
          lat: _double(v['lat']) ?? 0,
          lng: _double(v['lng']) ?? 0)
      : const Place(address: '', lat: 0, lng: 0);

  static ParcelTask? fromJson(Object? v) {
    if (v is! Map || v['id'] is! String) return null;
    String? str(Object? x) => x is String ? x : null;
    final sender = v['sender'];
    final recipient = v['recipient'];
    return ParcelTask(
      id: v['id'] as String,
      status: ParcelStatus.fromApi(v['status']),
      description: str(v['description']) ?? '',
      weightKg: _double(v['weightKg']),
      isFragile: v['isFragile'] == true,
      onReturnLeg: v['onReturnLeg'] == true,
      pickup: _place(v['pickup']),
      delivery: _place(v['delivery']),
      senderFirstName: sender is Map ? str(sender['firstName']) : null,
      senderPhone: sender is Map ? str(sender['phone']) : null,
      recipientName: recipient is Map ? str(recipient['name']) : null,
      recipientPhone: recipient is Map ? str(recipient['phone']) : null,
    );
  }
}
