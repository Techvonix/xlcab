import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

/// Position de l'appareil côté passager : alerte SOS (écran 9) et disponibilité
/// des navettes (écran 5). Jamais suivie en continu.
class LocationService {
  /// Position actuelle, ou null si la localisation est désactivée,
  /// refusée ou trop lente : le SOS part alors avec une position de
  /// repli plutôt que d'être bloqué.
  Future<({double lat, double lng})?> currentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        return null;
      }
      // API de geolocator 12 (desiredAccuracy / timeLimit).
      final p = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 5),
      );
      return (lat: p.latitude, lng: p.longitude);
    } catch (_) {
      return null;
    }
  }

  /// Position SANS demander l'autorisation : null si elle n'a pas déjà été
  /// accordée (écran 5 : simple confort, pas une raison de solliciter l'utilisateur).
  Future<({double lat, double lng})?> currentPositionIfAllowed() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission != LocationPermission.whileInUse && permission != LocationPermission.always) return null;
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      final p = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 4),
      );
      return (lat: p.latitude, lng: p.longitude);
    } catch (_) {
      return null;
    }
  }
}

final locationServiceProvider = Provider<LocationService>((ref) => LocationService());
