import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/models/trip.dart';

void main() {
  group('TripSummary.fromJson', () {
    final json = <String, dynamic>{
      'id': 'trip-1',
      'shuttleType': 'bleue',
      'originAddress': 'Gare de Lyon, Paris',
      'destinationAddress': 'Gare de Rouen',
      'scheduledAt': '2026-10-01T12:30:00.000Z',
      'status': 'no_driver',
      'totalPriceCents': 12150,
      'currency': 'EUR',
    };

    test('lit une réponse complète du backend', () {
      final trip = TripSummary.fromJson(json);
      expect(trip.id, 'trip-1');
      expect(trip.shuttleType, ShuttleType.bleue);
      expect(trip.status, TripStatus.noDriver); // "no_driver" côté API
      expect(trip.totalPriceCents, 12150);
      expect(trip.scheduledAt, DateTime.utc(2026, 10, 1, 12, 30).toLocal());
    });

    test('tolère une navette ou un statut inconnus (backend plus récent)', () {
      final trip = TripSummary.fromJson({...json, 'shuttleType': 'violette', 'status': 'teleported'});
      expect(trip.shuttleType, isNull);
      expect(trip.status, TripStatus.unknown);
    });

    test('tolère des champs optionnels de mauvais type', () {
      final trip = TripSummary.fromJson({...json, 'shuttleType': 42, 'totalPriceCents': '12150'});
      expect(trip.shuttleType, isNull);
      expect(trip.totalPriceCents, isNull);
    });

    test('rejette un trajet sans identifiant ou sans adresse', () {
      expect(() => TripSummary.fromJson({...json}..remove('id')), throwsFormatException);
      expect(() => TripSummary.fromJson({...json, 'originAddress': null}), throwsFormatException);
    });
  });

  test('seuls accepted et started ouvrent le suivi temps réel', () {
    final trackable = TripStatus.values.where((s) => s.isTrackable).toSet();
    expect(trackable, {TripStatus.accepted, TripStatus.started});
  });
}
