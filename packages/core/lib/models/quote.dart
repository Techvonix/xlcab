import 'place.dart';
import 'shuttle.dart';

/// Corps de POST /api/v1/bookings/passenger/quote
/// (xlcab_backend/src/bookings/dto/passenger-quote.dto.ts).
///
/// Ni distance ni prix : le serveur les recalcule. Un client modifié ne
/// peut donc pas choisir son tarif.
class PassengerQuoteRequest {
  const PassengerQuoteRequest({
    required this.origin,
    required this.destination,
    required this.shuttleType,
    required this.departure,
    required this.seats,
    required this.childSeats,
    required this.wifi,
    required this.extraLuggage,
    required this.withParcel,
  });

  final Place origin;
  final Place destination;
  final ShuttleType shuttleType;
  final DateTime departure;
  final int seats;
  final int childSeats;
  final bool wifi;
  final bool extraLuggage;
  final bool withParcel;

  Map<String, dynamic> toJson() => {
        'origin': {'lat': origin.lat, 'lng': origin.lng},
        'destination': {'lat': destination.lat, 'lng': destination.lng},
        'shuttleType': shuttleType.apiValue,
        // Toujours en UTC : le serveur compare à sa propre horloge.
        'scheduledAt': departure.toUtc().toIso8601String(),
        'seats': seats,
        'childSeats': childSeats,
        'wifi': wifi,
        'extraLuggage': extraLuggage,
        'withParcel': withParcel,
      };

  /// Corps de POST /bookings/passenger : la demande + les adresses lisibles.
  Map<String, dynamic> toBookingJson() => {
        ...toJson(),
        'originAddress': origin.address,
        'destinationAddress': destination.address,
      };
}

/// Ligne de TVA : transport de personnes (0 % en FR) ou colis (20 %).
class VatLine {
  const VatLine({
    required this.regime,
    required this.baseCents,
    required this.ratePercent,
    required this.vatCents,
  });

  final String regime; // "passenger" | "parcel"
  final int baseCents;
  final double ratePercent;
  final int vatCents;

  bool get isParcel => regime == 'parcel';

  factory VatLine.fromJson(Map<String, dynamic> json) {
    final regime = json['regime'];
    final base = json['baseCents'];
    final rate = json['ratePercent'];
    final vat = json['vatCents'];
    if (regime is! String || base is! int || rate is! num || vat is! int) {
      throw const FormatException('Ligne de TVA invalide');
    }
    return VatLine(regime: regime, baseCents: base, ratePercent: rate.toDouble(), vatCents: vat);
  }
}

/// Devis renvoyé par le serveur.
class PassengerQuote {
  const PassengerQuote({
    required this.distanceKm,
    required this.durationMin,
    required this.priceCents,
    required this.vatCents,
    required this.totalCents,
    required this.currency,
    required this.vatLines,
  });

  final double distanceKm;
  final int durationMin;
  final int priceCents; // HT
  final int vatCents;
  final int totalCents; // TTC
  final String currency;
  final List<VatLine> vatLines;

  factory PassengerQuote.fromJson(Map<String, dynamic> json) {
    final distance = json['distanceKm'];
    final duration = json['durationMin'];
    final price = json['priceCents'];
    final vat = json['vatCents'];
    final total = json['totalCents'];
    final currency = json['currency'];
    final lines = json['vatLines'];
    if (distance is! num ||
        duration is! int ||
        price is! int ||
        vat is! int ||
        total is! int ||
        currency is! String ||
        lines is! List) {
      throw const FormatException('Devis incomplet dans la réponse du serveur');
    }
    return PassengerQuote(
      distanceKm: distance.toDouble(),
      durationMin: duration,
      priceCents: price,
      vatCents: vat,
      totalCents: total,
      currency: currency,
      vatLines: lines.whereType<Map<String, dynamic>>().map(VatLine.fromJson).toList(),
    );
  }
}

/// Ce que l'écran de paiement reçoit : la demande et le devis affiché.
/// Le serveur recalculera le prix à la création de la réservation.
class BookingDraft {
  const BookingDraft({required this.request, required this.quote});

  final PassengerQuoteRequest request;
  final PassengerQuote quote;
}
