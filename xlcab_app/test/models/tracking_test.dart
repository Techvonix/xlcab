import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/models/tracking.dart';
import 'package:xlcab_app/models/trip.dart';

void main() {
  group('TrackingSnapshot.fromJson (GET /trips/:id/tracking)', () {
    final json = <String, dynamic>{
      'tripId': 't-1',
      'status': 'started',
      'shuttleType': 'rose',
      'origin': {'address': 'Gare de Lyon', 'lat': 48.84, 'lng': 2.37},
      'destination': {'address': 'Rouen', 'lat': 49.45, 'lng': 1.09},
      'scheduledAt': null,
      'driver': {
        'firstName': 'Nadia',
        'rating': 4.9,
        'phone': '+33600000000',
        'vehicle': {
          'brand': 'Renault', 'model': 'Trafic', 'color': 'Gris', 'plate': 'AB-123-CD',
          'dashcamActive': true, 'pmrEquipped': false,
        },
      },
      'lastPosition': {'lat': 49.1, 'lng': 1.8, 'heading': 300, 'speed': 92, 'recordedAt': '2026-10-01T10:00:00.000Z'},
    };

    test('lit la réponse complète du backend', () {
      final s = TrackingSnapshot.fromJson(json);
      expect(s.status, TripStatus.started);
      expect(s.driver!.vehicle!.description, 'Renault Trafic · Gris');
      expect(s.driver!.phone, '+33600000000');
      expect(s.lastPosition!.speedKmh, 92);
    });

    test('course sans chauffeur ni position', () {
      final s = TrackingSnapshot.fromJson({...json, 'driver': null, 'lastPosition': null});
      expect(s.driver, isNull);
      expect(s.lastPosition, isNull);
    });

    test('rejette une réponse sans adresses', () {
      expect(() => TrackingSnapshot.fromJson({...json, 'origin': null}), throwsFormatException);
    });
  });

  group('événements WebSocket (Module 3)', () {
    test('position', () {
      final p = LivePosition.fromSocket({
        'tripId': 't-1', 'driverId': 'd-1', 'lat': 49.1, 'lng': 1.8,
        'heading': null, 'speed': 70, 'eta': null, 'timestamp': 1790000000000,
      });
      expect(p!.lat, 49.1);
      expect(p.heading, isNull);
      expect(p.at, DateTime.fromMillisecondsSinceEpoch(1790000000000));
    });

    test('position invalide ignorée', () {
      expect(LivePosition.fromSocket({'lat': 'abc', 'lng': 1}), isNull);
      expect(LivePosition.fromSocket('pas une map'), isNull);
    });

    test('message : l’expéditeur vient du serveur', () {
      final m = ChatMessage.fromSocket({
        'tripId': 't-1', 'from': {'id': 'd-1', 'role': 'driver'}, 'text': 'Bonjour', 'timestamp': 1,
      });
      expect(m!.fromId, 'd-1');
      expect(ChatMessage.fromSocket({'text': 'sans expéditeur'}), isNull);
    });
  });
}
