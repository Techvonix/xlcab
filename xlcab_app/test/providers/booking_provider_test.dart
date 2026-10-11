import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_app/providers/booking_provider.dart';
import 'package:xlcab_app/services/booking_service.dart';

import '../support/fakes.dart';

final now = DateTime(2026, 10, 1, 8, 0);

void main() {
  late FakeBookingService service;
  late ProviderContainer container;

  ProviderContainer makeContainer({Duration debounce = Duration.zero}) {
    final c = ProviderContainer(overrides: [
      bookingServiceProvider.overrideWithValue(service),
      clockProvider.overrideWithValue(() => now),
      quoteDebounceProvider.overrideWithValue(debounce),
    ]);
    // Providers autoDispose : on les garde en vie pendant le test.
    c.listen(bookingFormProvider, (_, __) {});
    c.listen(passengerQuoteProvider, (_, __) {});
    addTearDown(c.dispose);
    return c;
  }

  BookingFormNotifier form() => container.read(bookingFormProvider.notifier);

  void fillValidForm() {
    form()
      ..setOrigin(paris)
      ..setDestination(rouen)
      ..setDeparture(now.add(const Duration(hours: 3)));
  }

  setUp(() {
    service = FakeBookingService();
    container = makeContainer();
  });

  group('formulaire', () {
    test('valeurs par défaut : 1 passager, Navette Bleue, aucune option', () {
      final state = container.read(bookingFormProvider);
      expect(state.seats, 1);
      expect(state.shuttleType, ShuttleType.bleue);
      expect(state.withParcel, isFalse);
    });

    test('passagers bornés entre 1 et 7 (Partie 7)', () {
      form().setSeats(12);
      expect(container.read(bookingFormProvider).seats, 7);
      form().setSeats(0);
      expect(container.read(bookingFormProvider).seats, 1);
    });

    test('réduire les passagers réduit les sièges enfants', () {
      form()
        ..setSeats(4)
        ..setChildSeats(3)
        ..setSeats(2);
      expect(container.read(bookingFormProvider).childSeats, 2);
      form().setChildSeats(5);
      expect(container.read(bookingFormProvider).childSeats, 2);
    });

    test('inverser départ et arrivée', () {
      fillValidForm();
      form().swapAddresses();
      final state = container.read(bookingFormProvider);
      expect(state.origin, rouen);
      expect(state.destination, paris);
    });

    test('départ à moins de 2 h : invalide, aucun devis demandé', () async {
      form()
        ..setOrigin(paris)
        ..setDestination(rouen)
        ..setDeparture(now.add(const Duration(hours: 1, minutes: 59)));

      expect(container.read(bookingFormProvider).departureTooSoon(now), isTrue);
      expect(await container.read(passengerQuoteProvider.future), isNull);
      expect(service.quoteRequests, isEmpty);
    });

    test('départ et arrivée identiques : aucun devis demandé', () async {
      form()
        ..setOrigin(paris)
        ..setDestination(paris)
        ..setDeparture(now.add(const Duration(hours: 3)));
      expect(await container.read(passengerQuoteProvider.future), isNull);
      expect(service.quoteRequests, isEmpty);
    });
  });

  group('devis', () {
    test('formulaire complet : devis demandé avec les bons paramètres', () async {
      fillValidForm();
      form()
        ..setShuttleType(ShuttleType.rose)
        ..setSeats(3);

      final quote = await container.read(passengerQuoteProvider.future);

      expect(quote, baseQuote);
      final json = service.quoteRequests.last.toJson();
      expect(json['shuttleType'], 'rose');
      expect(json['seats'], 3);
      expect(json['scheduledAt'], endsWith('Z')); // envoyé en UTC
      // Jamais de distance ni de prix envoyés au serveur.
      expect(json.keys, isNot(contains('distanceKm')));
      expect(json.keys, isNot(contains('totalCents')));
    });

    test('le toggle colis redemande un devis (trajet mixte)', () async {
      fillValidForm();
      await container.read(passengerQuoteProvider.future);

      form().setWithParcel(true);
      final quote = await container.read(passengerQuoteProvider.future);

      expect(service.quoteRequests.last.withParcel, isTrue);
      expect(quote!.totalCents, 13146);
    });

    test('anti-rebond : des modifications rapprochées ne font qu’un seul appel', () async {
      container = makeContainer(debounce: const Duration(milliseconds: 50));
      fillValidForm();
      form()
        ..setSeats(2)
        ..setSeats(3)
        ..setSeats(4);

      await container.read(passengerQuoteProvider.future);

      expect(service.quoteRequests, hasLength(1));
      expect(service.quoteRequests.single.seats, 4);
    });
  });
}
