import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/trip.dart';
import '../services/booking_service.dart';

/// Nombre de trajets affichés dans la section "Derniers trajets".
const int homeRecentTripsCount = 3;

/// Derniers trajets du passager connecté. autoDispose : rechargés à
/// chaque retour sur l'écran d'accueil, pas de données périmées.
final recentTripsProvider = FutureProvider.autoDispose<List<TripSummary>>(
  (ref) => ref
      .watch(bookingServiceProvider)
      .recentPassengerTrips(limit: homeRecentTripsCount),
);
