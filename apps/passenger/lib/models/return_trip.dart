import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/models/trip_detail.dart';

/// Demande de trajet retour : les adresses d'une course, inversées, et le
/// même nombre de passagers. Transmise à l'écran de réservation qui convient.
class ReturnTripRequest {
  const ReturnTripRequest({required this.origin, required this.destination, this.seats = 1});

  final Place origin;
  final Place destination;
  final int seats;
}

/// Le retour proposé pour cette course, ou null si elle ne s'y prête pas :
/// colis, course annulée ou pas encore prise en charge, coordonnées absentes.
ReturnTripRequest? returnTripOf(TripDetail trip) {
  const eligible = {TripStatus.accepted, TripStatus.started, TripStatus.completed};
  final seats = trip.seats;
  final (oLat, oLng, dLat, dLng) = (trip.originLat, trip.originLng, trip.destinationLat, trip.destinationLng);
  if (seats == null || !eligible.contains(trip.status) || oLat == null || oLng == null || dLat == null || dLng == null) return null;
  return ReturnTripRequest(
    // Le retour part de l'arrivée de l'aller.
    origin: Place(address: trip.destinationAddress, lat: dLat, lng: dLng),
    destination: Place(address: trip.originAddress, lat: oLat, lng: oLng),
    seats: seats,
  );
}
