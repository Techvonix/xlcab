import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/models/tracking.dart';
import 'package:xlcab_app/models/trip.dart';
import 'package:xlcab_app/providers/tracking_provider.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/services/location_service.dart';
import 'package:xlcab_app/services/tracking_channel.dart';
import 'package:xlcab_app/services/trip_service.dart';

import '../support/fakes.dart';

void main() {
  late FakeTripService trips;
  late FakeTrackingChannel channel;
  late FakeLocationService location;
  late ProviderContainer container;
  const poll = Duration(milliseconds: 40);

  TrackingState read() => container.read(trackingControllerProvider(trackedTripId));
  TrackingController controller() => container.read(trackingControllerProvider(trackedTripId).notifier);

  Future<void> settle([Duration d = const Duration(milliseconds: 10)]) => Future<void>.delayed(d);

  setUp(() async {
    trips = FakeTripService();
    channel = FakeTrackingChannel();
    location = FakeLocationService();
    container = ProviderContainer(overrides: [
      tripServiceProvider.overrideWithValue(trips),
      trackingChannelFactoryProvider.overrideWithValue(() => channel),
      locationServiceProvider.overrideWithValue(location),
      trackingPollIntervalProvider.overrideWithValue(poll),
    ]);
    addTearDown(container.dispose);
    container.listen(trackingControllerProvider(trackedTripId), (_, __) {});
    await settle();
  });

  test('charge le trajet puis ouvre le temps réel sur la bonne course', () {
    expect(read().snapshot!.driver!.firstName, 'Nadia');
    expect(read().status, TripStatus.started);
    expect(channel.startedTripId, trackedTripId);
  });

  test('trajet introuvable : message d’erreur, pas de connexion temps réel', () async {
    final unusedChannel = FakeTrackingChannel();
    final c = ProviderContainer(overrides: [
      tripServiceProvider.overrideWithValue(FakeTripService()..error = const ApiException('Trajet introuvable.')),
      trackingChannelFactoryProvider.overrideWithValue(() => unusedChannel),
    ]);
    addTearDown(c.dispose);
    c.listen(trackingControllerProvider('autre'), (_, __) {});
    await settle();

    expect(c.read(trackingControllerProvider('autre')).loadError, 'Trajet introuvable.');
    expect(unusedChannel.startedTripId, isNull);
  });

  test('positions, statut et messages reçus en temps réel', () async {
    channel
      ..push(const ConnectionEvent(true))
      ..push(PositionEvent(LivePosition(lat: 49.1, lng: 1.8, speedKmh: 90, at: DateTime(2026))))
      ..push(const StatusEvent(TripStatus.completed))
      ..push(MessageEvent(ChatMessage(fromId: 'driver-1', fromRole: 'driver', text: 'Je suis devant', at: DateTime(2026))));
    await settle();

    expect(read().connection, TrackingConnection.live);
    expect(read().position!.lat, 49.1);
    expect(read().status, TripStatus.completed);
    expect(read().messages.single.text, 'Je suis devant');
  });

  test('connexion perdue → polling toutes les 10 s ; rétablie → polling arrêté', () async {
    channel.push(const ConnectionEvent(true));
    await settle();
    final callsWhenLive = trips.calls;
    await settle(poll * 3);
    expect(trips.calls, callsWhenLive, reason: 'pas de polling en temps réel');

    channel.push(const ConnectionEvent(false));
    trips.snapshot = snapshotFor(
      lastPosition: LivePosition(lat: 49.3, lng: 1.4, at: DateTime(2026)),
    );
    await settle(poll * 3 + const Duration(milliseconds: 10));
    expect(read().connection, TrackingConnection.polling);
    expect(trips.calls, greaterThanOrEqualTo(callsWhenLive + 2));
    expect(read().position!.lat, 49.3, reason: 'position issue du polling');

    channel.push(const ConnectionEvent(true));
    await settle();
    final callsAfterReconnect = trips.calls;
    await settle(poll * 3);
    expect(trips.calls, callsAfterReconnect);
  });

  test('avant la 1re connexion temps réel, le polling assure déjà le suivi', () async {
    final before = trips.calls;
    await settle(poll * 2 + const Duration(milliseconds: 10));
    expect(trips.calls, greaterThan(before));
  });

  test('message : texte nettoyé et limité à 500 caractères', () {
    controller().sendMessage('   ');
    controller().sendMessage('  Bonjour  ');
    controller().sendMessage('x' * 600);
    expect(channel.sentMessages, ['Bonjour', 'x' * 500]);
  });

  group('SOS', () {
    test('envoie la position de l’appareil quand elle est disponible', () async {
      location.position = (lat: 49.0, lng: 1.9);
      expect(await controller().sendSos(), SosResult.sent);
      expect(channel.sosSent.single, (lat: 49.0, lng: 1.9));
    });

    test('localisation refusée : repli sur la dernière position du véhicule', () async {
      channel.push(PositionEvent(LivePosition(lat: 49.2, lng: 1.6, at: DateTime(2026))));
      await settle();
      await controller().sendSos();
      expect(channel.sosSent.single, (lat: 49.2, lng: 1.6));
    });

    test('ni localisation ni position véhicule : repli sur le point de départ', () async {
      await controller().sendSos();
      expect(channel.sosSent.single, (lat: paris.lat, lng: paris.lng));
    });

    test('sans accusé de réception du serveur : échec signalé', () async {
      channel.sosAcknowledged = false;
      expect(await controller().sendSos(), SosResult.failed);
    });
  });

  test('quitter l’écran ferme la connexion temps réel', () async {
    container.dispose();
    expect(channel.disposed, isTrue);
  });
}
