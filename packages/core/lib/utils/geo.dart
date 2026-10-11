import 'dart:math';

const double _earthRadiusKm = 6371;

/// Distance à vol d'oiseau entre deux points (formule de haversine).
double haversineKm(double lat1, double lng1, double lat2, double lng2) {
  double rad(double deg) => deg * pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a = sin(dLat / 2) * sin(dLat / 2) +
      cos(rad(lat1)) * cos(rad(lat2)) * sin(dLng / 2) * sin(dLng / 2);
  return 2 * _earthRadiusKm * asin(min(1, sqrt(a)));
}

// Estimation de l'ETA tant que le serveur n'en fournit pas (le Module 3
// envoie eta: null en attendant Google Directions). Volontairement
// prudente : route ≈ 1,3 × vol d'oiseau, vitesse plancher 20 km/h,
// 50 km/h si la vitesse est inconnue.
const double _roadFactor = 1.3;
const double _defaultSpeedKmh = 50;
const double _minSpeedKmh = 20;

/// Minutes restantes estimées (arrondi supérieur, au moins 1).
int estimateEtaMinutes({
  required double fromLat,
  required double fromLng,
  required double toLat,
  required double toLng,
  double? speedKmh,
}) {
  final km = haversineKm(fromLat, fromLng, toLat, toLng) * _roadFactor;
  final speed = max(speedKmh ?? _defaultSpeedKmh, _minSpeedKmh);
  return max(1, (km / speed * 60).ceil());
}

/// Avancement 0..1 entre un départ et une arrivée, d'après la distance
/// restante à vol d'oiseau.
double tripProgress({
  required double originLat,
  required double originLng,
  required double destLat,
  required double destLng,
  required double currentLat,
  required double currentLng,
}) {
  final total = haversineKm(originLat, originLng, destLat, destLng);
  if (total <= 0) return 1;
  final remaining = haversineKm(currentLat, currentLng, destLat, destLng);
  return (1 - remaining / total).clamp(0.0, 1.0);
}

/// Interpolation linéaire d'une position (animation du marqueur).
({double lat, double lng}) lerpPosition(
  double fromLat,
  double fromLng,
  double toLat,
  double toLng,
  double t,
) {
  return (lat: fromLat + (toLat - fromLat) * t, lng: fromLng + (toLng - fromLng) * t);
}

/// Interpolation d'un cap en degrés par le plus court chemin (350° → 10°
/// passe par 0°, pas par 180°).
double lerpHeading(double from, double to, double t) {
  final delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}
