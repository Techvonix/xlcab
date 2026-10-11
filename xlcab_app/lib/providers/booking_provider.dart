import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import '../services/booking_service.dart';

// Règles de l'écran 6 (Partie 7). Le serveur les revérifie : elles ne
// servent ici qu'à guider l'utilisateur sans aller-retour réseau.
const int maxSeats = 7; // "passagers 1-7"
const Duration minLeadTime = Duration(hours: 2); // "Minimum 2h dans le futur"

/// Horloge injectable : les tests fixent "maintenant".
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Délai d'anti-rebond avant de demander un devis (0 dans les tests).
final quoteDebounceProvider = Provider<Duration>((ref) => const Duration(milliseconds: 500));

@immutable
class BookingFormState {
  const BookingFormState({
    this.shuttleType = ShuttleType.bleue,
    this.origin,
    this.destination,
    this.departure,
    this.seats = 1,
    this.childSeats = 0,
    this.wifi = false,
    this.extraLuggage = false,
    this.withParcel = false,
  });

  final ShuttleType shuttleType;
  final Place? origin;
  final Place? destination;
  final DateTime? departure;
  final int seats;
  final int childSeats;
  final bool wifi;
  final bool extraLuggage;
  final bool withParcel;

  /// Première heure de départ réservable.
  static DateTime earliestDeparture(DateTime now) => now.add(minLeadTime);

  bool departureTooSoon(DateTime now) =>
      departure != null && departure!.isBefore(earliestDeparture(now));

  bool get sameAddresses =>
      origin != null && destination != null && origin!.isSameAs(destination!);

  /// La demande de devis, ou null tant que le formulaire est incomplet
  /// ou invalide (aucun appel réseau inutile).
  PassengerQuoteRequest? toQuoteRequest(DateTime now) {
    if (origin == null || destination == null || departure == null) return null;
    if (sameAddresses || departureTooSoon(now)) return null;
    return PassengerQuoteRequest(
      origin: origin!,
      destination: destination!,
      shuttleType: shuttleType,
      departure: departure!,
      seats: seats,
      childSeats: childSeats,
      wifi: wifi,
      extraLuggage: extraLuggage,
      withParcel: withParcel,
    );
  }

  BookingFormState copyWith({
    ShuttleType? shuttleType,
    Place? origin,
    Place? destination,
    DateTime? departure,
    int? seats,
    int? childSeats,
    bool? wifi,
    bool? extraLuggage,
    bool? withParcel,
  }) {
    return BookingFormState(
      shuttleType: shuttleType ?? this.shuttleType,
      origin: origin ?? this.origin,
      destination: destination ?? this.destination,
      departure: departure ?? this.departure,
      seats: seats ?? this.seats,
      childSeats: childSeats ?? this.childSeats,
      wifi: wifi ?? this.wifi,
      extraLuggage: extraLuggage ?? this.extraLuggage,
      withParcel: withParcel ?? this.withParcel,
    );
  }
}

class BookingFormNotifier extends AutoDisposeNotifier<BookingFormState> {
  @override
  BookingFormState build() => const BookingFormState();

  void setShuttleType(ShuttleType type) => state = state.copyWith(shuttleType: type);

  void setOrigin(Place place) => state = state.copyWith(origin: place);

  void setDestination(Place place) => state = state.copyWith(destination: place);

  /// Inverse départ et arrivée (trajet retour).
  void swapAddresses() {
    state = BookingFormState(
      shuttleType: state.shuttleType,
      origin: state.destination,
      destination: state.origin,
      departure: state.departure,
      seats: state.seats,
      childSeats: state.childSeats,
      wifi: state.wifi,
      extraLuggage: state.extraLuggage,
      withParcel: state.withParcel,
    );
  }

  void setDeparture(DateTime departure) => state = state.copyWith(departure: departure);

  /// 1 à 7 passagers. Réduire le nombre de passagers réduit aussi les
  /// sièges enfants, qui ne peuvent pas être plus nombreux.
  void setSeats(int seats) {
    final value = seats.clamp(1, maxSeats);
    state = state.copyWith(seats: value, childSeats: min(state.childSeats, value));
  }

  void setChildSeats(int childSeats) =>
      state = state.copyWith(childSeats: childSeats.clamp(0, state.seats));

  void setWifi(bool value) => state = state.copyWith(wifi: value);

  void setExtraLuggage(bool value) => state = state.copyWith(extraLuggage: value);

  /// "Toggle colis" : le devis est recalculé automatiquement (Partie 7).
  void setWithParcel(bool value) => state = state.copyWith(withParcel: value);
}

final bookingFormProvider =
    NotifierProvider.autoDispose<BookingFormNotifier, BookingFormState>(BookingFormNotifier.new);

/// Devis courant : recalculé à chaque modification du formulaire
/// (Partie 7 : "Appel POST /bookings/passenger/quote à chaque
/// modification"), après un délai d'anti-rebond pour ne pas envoyer une
/// requête à chaque appui sur "+".
///
/// null = formulaire incomplet, aucun devis demandé.
final passengerQuoteProvider = FutureProvider.autoDispose<PassengerQuote?>((ref) async {
  final form = ref.watch(bookingFormProvider);
  final now = ref.watch(clockProvider)();
  final request = form.toQuoteRequest(now);
  if (request == null) return null;

  final service = ref.watch(bookingServiceProvider);
  final debounce = ref.watch(quoteDebounceProvider);

  // Si le formulaire change pendant l'attente ou la requête, ce calcul
  // est abandonné : la requête en vol est annulée et son résultat ignoré.
  final cancelToken = CancelToken();
  var abandoned = false;
  ref.onDispose(() {
    abandoned = true;
    cancelToken.cancel();
  });

  if (debounce > Duration.zero) {
    await Future<void>.delayed(debounce);
    if (abandoned) throw const _QuoteAbandoned();
  }
  return service.quotePassenger(request, cancelToken: cancelToken);
});

/// Signal interne : un devis plus récent a pris le relais.
class _QuoteAbandoned implements Exception {
  const _QuoteAbandoned();
}
