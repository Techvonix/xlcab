import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/models/departure_guarantee.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/trip_detail.dart';

// Seuil de départ garanti : lecture des réponses du serveur.

void main() {
  test('en attente : seuil, échéance, passagers manquants', () {
    final g = DepartureGuarantee.fromJson({
      'minPassengers': 4, 'guaranteed': false, 'missed': false, 'deadline': '2026-10-19T06:00:00.000Z', 'missingPassengers': 2,
    })!;
    expect(g.pending, isTrue);
    expect(g.minPassengers, 4);
    expect(g.missingPassengers, 2);
    expect(g.deadline!.toUtc(), DateTime.utc(2026, 10, 19, 6));
  });

  test('garanti ou annulé : plus « en attente »', () {
    expect(DepartureGuarantee.fromJson({'minPassengers': 4, 'guaranteed': true})!.pending, isFalse);
    expect(DepartureGuarantee.fromJson({'minPassengers': 4, 'guaranteed': false, 'missed': true})!.pending, isFalse);
    expect(DepartureGuarantee.fromJson({'minPassengers': null, 'guaranteed': true})!.pending, isFalse);
    expect(DepartureGuarantee.fromJson(null), isNull);
  });

  test('départ d’un serveur plus ancien (sans seuil) : confirmé = garanti', () {
    final d = LineDeparture.fromJson({
      'id': 'd1', 'lineId': 'l1', 'direction': 'outbound', 'departureAt': '2026-10-20T06:00:00.000Z',
      'seatsTotal': 7, 'seatsBooked': 2, 'status': 'open',
    })!;
    expect(d.guaranteed, isTrue);
    expect(d.awaitingPassengers, isFalse);

    final withThreshold = LineDeparture.fromJson({
      'id': 'd2', 'lineId': 'l1', 'direction': 'outbound', 'departureAt': '2026-10-20T06:00:00.000Z',
      'seatsTotal': 7, 'seatsBooked': 2, 'status': 'open', 'minPassengers': 4, 'guaranteed': false,
    })!;
    expect(withThreshold.awaitingPassengers, isTrue);
  });

  test('ligne : seuil envoyé seulement en vente à la place', () {
    final line = RecurringLine.fromJson({'id': 'l1', 'pricingMode': 'per_seat', 'minPassengers': 4})!;
    expect(line.minPassengers, 4);
  });

  test('récapitulatif d’une place de ligne : état du seuil', () {
    final trip = TripDetail.fromJson({
      'id': 't1', 'status': 'accepted', 'source': 'line', 'origin': {'address': 'Lyon'}, 'destination': {'address': 'Limoges'},
      'lineGuarantee': {'minPassengers': 4, 'guaranteed': false, 'deadline': '2026-10-19T06:00:00.000Z'},
    });
    expect(trip.lineGuarantee!.pending, isTrue);
  });
}
