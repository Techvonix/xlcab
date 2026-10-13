import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_core/services/trip_service.dart';
import 'package:xlcab_passenger/screens/market/line_search_screen.dart';
import 'package:xlcab_passenger/screens/market/request_detail_screen.dart';
import 'package:xlcab_passenger/services/payment_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';
import '../support/operator_fakes.dart';

// Paiement en ligne des lignes et de la bourse (Stripe Connect) côté client :
// feuille de paiement à la réservation d'une place, empreinte de carte au
// choix d'une proposition. Serveur et feuille Stripe simulés.

late FakeMarketService market;
late FakePresenter presenter;
late FakePaymentService payments;
late FakeTripService trips;
late GoRouter router;
final today = DateTime(2026, 10, 10, 9);

Future<void> pump(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1170, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('accueil'))),
      GoRoute(path: '/ecran', builder: (_, __) => screen),
      GoRoute(path: '/market/:a', builder: (_, s) => Scaffold(body: Text('route ${s.uri.path}'))),
      GoRoute(path: '/market/:a/:b', builder: (_, s) => Scaffold(body: Text('route ${s.uri.path}'))),
      GoRoute(path: '/booking/confirmation/:tripId', builder: (_, s) => Scaffold(body: Text('réservation ${s.pathParameters['tripId']}'))),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [
      marketServiceProvider.overrideWithValue(market),
      paymentSheetPresenterProvider.overrideWithValue(presenter),
      paymentServiceProvider.overrideWithValue(payments),
      tripServiceProvider.overrideWithValue(trips),
      clockProvider.overrideWithValue(() => today),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    ),
  ));
  router.push('/ecran');
  await tester.pumpAndSettle();
}

LineSearchResult departure() => LineSearchResult(
      departureId: 'd1',
      departureAt: DateTime(2026, 10, 12, 5),
      localTime: '05:00',
      origin: 'Porte Maillot, Paris',
      destination: 'Aéroport de Beauvais',
      perSeat: true,
      unitPriceCents: 2500,
      totalPriceCents: 5000,
      seatsLeft: 5,
      luggage: 10,
      operatorRatingCount: 0,
      durationMin: 75,
      operatorName: 'Djamel Navettes',
      vehicleLabel: 'Renault Trafic',
    );

MarketRequest request(RequestStatus status) => MarketRequest(
      id: 'r1',
      status: status,
      origin: porteMaillot,
      destination: beauvaisAirport,
      departureAt: DateTime(2026, 10, 13, 8),
      flexMin: 30,
      passengers: 6,
      luggage: 6,
      openOffers: 1,
    );

MarketOffer offer(String id, int price, String name, {OfferStatus status = OfferStatus.pending}) => MarketOffer(
      id: id,
      requestId: 'r1',
      priceCents: price,
      pickupAt: DateTime(2026, 10, 13, 8),
      includesReturn: false,
      status: status,
      validUntil: DateTime(2026, 10, 11, 9),
      operatorVerified: true,
      operatorRatingCount: 0,
      operatorName: name,
      vehicleLabel: 'Renault Trafic',
      vehicleCapacity: 8,
    );

/// Ouvre la feuille de réservation du départ et confirme.
Future<void> bookDeparture(WidgetTester tester) async {
  await pump(tester, Scaffold(body: BookLineSheet(result: departure(), seats: 2)));
  await tester.tap(find.textContaining('Confirmer ·'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    market = FakeMarketService();
    presenter = FakePresenter();
    payments = FakePaymentService();
    trips = FakeTripService();
  });

  group('réservation d’une place de ligne', () {
    testWidgets('paiement en ligne : feuille de paiement, confirmation, puis récapitulatif', (tester) async {
      market.bookingPayment = sheetFor(tripId: 'trip-1', amountCents: 5000);
      await bookDeparture(tester);

      expect(presenter.presented.single.amountCents, 5000);
      expect(payments.calls, ['confirm:trip-1']);
      expect(trips.cancelled, isEmpty);
      expect(find.text('réservation trip-1'), findsOneWidget);
    });

    testWidgets('feuille de paiement fermée : réservation annulée tout de suite, message, pas de récapitulatif', (tester) async {
      market.bookingPayment = sheetFor(tripId: 'trip-1', amountCents: 5000);
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.canceled));
      await bookDeparture(tester);

      expect(trips.cancelled, ['trip-1']); // places rendues sans attendre les 30 minutes
      expect(payments.calls, isEmpty);
      expect(find.textContaining('Paiement non finalisé'), findsOneWidget);
      expect(find.text('réservation trip-1'), findsNothing);
      // Le passager peut réessayer.
      await tester.tap(find.textContaining('Confirmer ·'));
      await tester.pumpAndSettle();
      expect(find.text('réservation trip-1'), findsOneWidget);
    });

    testWidgets('carte refusée : le motif de Stripe est affiché et la réservation annulée', (tester) async {
      market.bookingPayment = sheetFor(tripId: 'trip-1', amountCents: 5000);
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.failed, 'Votre carte a été refusée.'));
      await bookDeparture(tester);
      expect(find.text('Votre carte a été refusée.'), findsOneWidget);
      expect(trips.cancelled, ['trip-1']);
    });

    testWidgets('paiement indisponible sur ce téléphone : réservation annulée, message clair', (tester) async {
      market.bookingPayment = sheetFor(tripId: 'trip-1', amountCents: 5000);
      presenter.available = false;
      await bookDeparture(tester);
      expect(presenter.presented, isEmpty);
      expect(trips.cancelled, ['trip-1']);
      expect(find.textContaining('Paiement momentanément indisponible'), findsOneWidget);
    });

    testWidgets('paiement différé (démo) : aucun passage par la feuille de paiement', (tester) async {
      await bookDeparture(tester);
      expect(presenter.presented, isEmpty);
      expect(payments.calls, isEmpty);
      expect(find.text('réservation trip-1'), findsOneWidget);
    });
  });

  group('choix d’une proposition de la bourse', () {
    Future<void> choose(WidgetTester tester) async {
      market.requests = [request(RequestStatus.offersReceived)];
      market.requestOffers = [offer('o1', 18000, 'Djamel Navettes')];
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));
      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').last);
      await tester.pumpAndSettle();
    }

    testWidgets('paiement en ligne : empreinte de carte, puis le choix part chez l’opérateur', (tester) async {
      market.choicePayment = sheetFor(tripId: '', amountCents: 18000);
      await choose(tester);
      expect(presenter.presented.single.amountCents, 18000);
      expect(market.calls, containsAllInOrder(['acceptOffer:o1', 'authorizeOffer:o1']));
      expect(find.textContaining('vous ne serez débité qu’à ce moment-là'), findsOneWidget);
    });

    testWidgets('feuille fermée avant la fin : le choix n’est pas transmis, 15 minutes pour valider', (tester) async {
      market.choicePayment = sheetFor(tripId: '', amountCents: 18000);
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.canceled));
      await choose(tester);
      expect(market.calls.where((c) => c.startsWith('authorizeOffer')), isEmpty);
      expect(find.textContaining('Vous avez 15 minutes pour la valider'), findsOneWidget);
    });

    testWidgets('carte à valider : le client rouvre la feuille de paiement depuis la proposition', (tester) async {
      market.requests = [request(RequestStatus.accepted)];
      market.requestOffers = [offer('o1', 18000, 'Djamel Navettes', status: OfferStatus.authorizing)];
      market.choicePayment = sheetFor(tripId: '', amountCents: 18000);
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));

      expect(find.text('Carte à valider'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Choisir'), findsNothing);
      await tester.tap(find.widgetWithText(FilledButton, 'Valider ma carte'));
      await tester.pumpAndSettle();
      expect(presenter.presented, hasLength(1));
      expect(market.calls, containsAllInOrder(['acceptOffer:o1', 'authorizeOffer:o1']));
    });

    testWidgets('refus du serveur à la validation : message affiché', (tester) async {
      market.choicePayment = sheetFor(tripId: '', amountCents: 18000);
      market.requests = [request(RequestStatus.offersReceived)];
      market.requestOffers = [offer('o1', 18000, 'Djamel Navettes')];
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));
      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').first);
      await tester.pumpAndSettle();
      market.authorizeError = const ApiException('Proposition expirée ou déjà traitée');
      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').last);
      await tester.pumpAndSettle();
      expect(find.text('Proposition expirée ou déjà traitée'), findsOneWidget);
    });

    testWidgets('paiement différé (démo) : choix transmis directement', (tester) async {
      await choose(tester);
      expect(presenter.presented, isEmpty);
      expect(market.calls, ['acceptOffer:o1']);
      expect(find.textContaining('l’opérateur doit confirmer'), findsOneWidget);
    });
  });
}
