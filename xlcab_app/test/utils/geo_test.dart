import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/utils/geo.dart';

void main() {
  test('haversine : Paris Gare de Lyon → Rouen ≈ 115 km à vol d’oiseau', () {
    // Vérifié à la main : 67,2 km nord-sud, 93,2 km est-ouest → ≈ 114,9 km.
    expect(haversineKm(48.8443, 2.3744, 49.4488, 1.0942), closeTo(114.9, 0.5));
    expect(haversineKm(48.8, 2.3, 48.8, 2.3), 0);
  });

  test('ETA estimée : prudente (×1,3 route) et au moins 1 minute', () {
    // 114,8 km × 1,3 ≈ 149 km à 90 km/h ≈ 100 min
    expect(
      estimateEtaMinutes(fromLat: 48.8443, fromLng: 2.3744, toLat: 49.4488, toLng: 1.0942, speedKmh: 90),
      inInclusiveRange(95, 100),
    );
    expect(estimateEtaMinutes(fromLat: 48.8, fromLng: 2.3, toLat: 48.8, toLng: 2.3), 1);
  });

  test('ETA : une vitesse quasi nulle (bouchon, feu) ne donne pas une ETA infinie', () {
    final eta = estimateEtaMinutes(fromLat: 48.84, fromLng: 2.37, toLat: 48.86, toLng: 2.35, speedKmh: 0);
    expect(eta, lessThan(30)); // plancher de 20 km/h
  });

  test('avancement du trajet borné entre 0 et 1', () {
    double progressAt(double lat, double lng) => tripProgress(
          originLat: 48.8443, originLng: 2.3744, destLat: 49.4488, destLng: 1.0942,
          currentLat: lat, currentLng: lng,
        );
    expect(progressAt(48.8443, 2.3744), closeTo(0, 0.001));
    expect(progressAt(49.4488, 1.0942), closeTo(1, 0.001));
    expect(progressAt(49.15, 1.73), inInclusiveRange(0.4, 0.6));
    expect(progressAt(47.0, 4.0), 0); // chauffeur hors trajet
  });

  test('animation du marqueur : interpolation position et cap', () {
    final mid = lerpPosition(48.0, 2.0, 49.0, 1.0, 0.5);
    expect(mid.lat, 48.5);
    expect(mid.lng, 1.5);
    // 350° → 10° passe par 0°, pas par 180°.
    expect(lerpHeading(350, 10, 0.5), closeTo(0, 0.001));
    expect(lerpHeading(10, 350, 0.5), closeTo(0, 0.001));
  });
}
