/// Adresse géocodée (départ ou arrivée d'un trajet).
class Place {
  const Place({
    required this.address,
    required this.lat,
    required this.lng,
    this.placeId,
  });

  final String address;
  final double lat;
  final double lng;

  /// Identifiant Google Places, si l'adresse vient de l'autocomplétion.
  final String? placeId;

  /// Même lieu : même identifiant Google, ou mêmes coordonnées.
  bool isSameAs(Place other) =>
      (placeId != null && placeId == other.placeId) || (lat == other.lat && lng == other.lng);
}

/// Suggestion de l'autocomplétion Google Places (pas encore géocodée).
class PlaceSuggestion {
  const PlaceSuggestion({
    required this.placeId,
    required this.mainText,
    required this.secondaryText,
  });

  final String placeId;
  final String mainText; // ex. "Gare de Lyon"
  final String secondaryText; // ex. "Paris, France"
}
