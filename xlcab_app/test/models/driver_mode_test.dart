import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/models/trip_detail.dart';

import '../support/fakes.dart';

void main() {
  group('MissionOffer.fromJson (événement mission:offer)', () {
    Map<String, dynamic> payload([Map<String, dynamic> over = const {}]) => {
          'tripId': offeredTripId,
          'type': 'passenger',
          'shuttleType': 'rose',
          'originAddress': 'Paris',
          'destinationAddress': 'Rouen',
          'distanceKm': 135.4,
          'scheduledAt': '2026-10-12T12:30:00.000Z',
          'seats': 3,
          'totalPriceCents': 12186,
          'pickupDistanceKm': 2.4,
          'expiresAt': DateTime.now().add(const Duration(seconds: 30)).millisecondsSinceEpoch,
          ...over,
        };

    test('lit l’offre complète', () {
      final o = MissionOffer.fromJson(payload())!;
      expect(o.tripId, offeredTripId);
      expect(o.seats, 3);
      expect(o.pickupDistanceKm, 2.4);
      expect(o.remaining().inSeconds, inInclusiveRange(28, 30));
    });

    test('offre inexploitable (sans identifiant ou échéance) : ignorée', () {
      expect(MissionOffer.fromJson(payload({'tripId': null})), isNull);
      expect(MissionOffer.fromJson(payload({'expiresAt': 'bientôt'})), isNull);
      expect(MissionOffer.fromJson('texte'), isNull);
    });

    test('horloge du téléphone en retard : compte à rebours borné à 30 s', () {
      final far = DateTime.now().add(const Duration(minutes: 10)).millisecondsSinceEpoch;
      expect(MissionOffer.fromJson(payload({'expiresAt': far}))!.remaining().inSeconds, lessThanOrEqualTo(30));
    });
  });

  group('Mission', () {
    test('démarrage possible seulement dans l’heure précédant le départ', () {
      final now = DateTime(2026, 10, 12, 12);
      expect(missionFor(scheduledAt: DateTime(2026, 10, 12, 12, 59)).canStart(now), isTrue);
      expect(missionFor(scheduledAt: DateTime(2026, 10, 12, 13, 1)).canStart(now), isFalse);
      expect(missionFor(status: TripStatus.started).canStart(now), isFalse);
    });

    test('liste : la course en cours passe avant la prochaine', () {
      final started = missionFor(status: TripStatus.started);
      final list = MissionList(upcoming: [missionFor(), started], recent: const []);
      expect(list.current, same(started));
    });

    test('fromJson : passager sans téléphone tant que la course est lointaine', () {
      final m = Mission.fromJson({
        'id': missionTripId,
        'status': 'accepted',
        'shuttleType': 'bleue',
        'origin': {'address': 'Paris', 'lat': 48.8, 'lng': 2.3},
        'destination': {'address': 'Rouen', 'lat': 49.4, 'lng': 1.1},
        'scheduledAt': '2026-10-15T08:00:00.000Z',
        'seats': 2,
        'passenger': {'firstName': 'Léa', 'phone': null},
      });
      expect(m.passengerFirstName, 'Léa');
      expect(m.passengerPhone, isNull);
    });
  });

  test('TripDetail : heure de début de la recherche de chauffeur', () {
    final d = TripDetail.fromJson({
      'id': 't1',
      'status': 'pending',
      'origin': {'address': 'Paris'},
      'destination': {'address': 'Rouen'},
      'dispatchAt': '2026-10-15T05:00:00.000Z',
    });
    expect(d.dispatchAt, DateTime.utc(2026, 10, 15, 5).toLocal());
  });
}
