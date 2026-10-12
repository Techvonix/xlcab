import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_core/providers/market_provider.dart';
import 'package:xlcab_passenger/screens/booking/parcel_creation_screen.dart' show addressPickerProvider, pickupDateTimePickerProvider;
import 'package:xlcab_passenger/screens/market/line_search_screen.dart';
import 'package:xlcab_passenger/screens/market/market_home_screen.dart';
import 'package:xlcab_passenger/screens/market/request_detail_screen.dart';
import 'package:xlcab_passenger/screens/market/request_form_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/operator_fakes.dart';

// Bourse côté client (étape 4) : lignes régulières (recherche, réservation),
// demandes de devis (publication, comparaison des propositions, choix).

late FakeMarketService market;
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
  var next = 0;
  final places = [porteMaillot, beauvaisAirport];
  await tester.pumpWidget(ProviderScope(
    overrides: [
      marketServiceProvider.overrideWithValue(market),
      clockProvider.overrideWithValue(() => today),
      addressPickerProvider.overrideWithValue((_, __) async => places[next++ % 2]),
      datePickerProvider.overrideWithValue((_, first, last, initial) async => DateTime(2026, 10, 12)),
      pickupDateTimePickerProvider.overrideWithValue((_, earliest, current) async => DateTime(2026, 10, 13, 8)),
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
      operatorName: 'Djamel Navettes',
      operatorRating: 4.8,
      operatorRatingCount: 52,
      vehicleLabel: 'Renault Trafic',
      durationMin: 75,
      reasons: const [MatchReason('pickup', 0.3), MatchReason('seats_left', 5), MatchReason('verified_operator', null)],
    );

MarketRequest request(RequestStatus status, {int openOffers = 0, String? tripId}) => MarketRequest(
      id: 'r1',
      status: status,
      origin: porteMaillot,
      destination: beauvaisAirport,
      departureAt: DateTime(2026, 10, 13, 8),
      flexMin: 30,
      passengers: 6,
      luggage: 6,
      openOffers: openOffers,
      tripId: tripId,
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

void main() {
  setUpAll(() => initializeDateFormatting('fr'));
  setUp(() => market = FakeMarketService());

  group('lignes régulières', () {
    testWidgets('recherche, résultat expliqué, réservation de 3 places', (tester) async {
      market.lineResults = [departure()];
      await pump(tester, const LineSearchScreen());
      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Plus : Places'));
      await tester.tap(find.text('Rechercher'));
      await tester.pumpAndSettle();
      expect(market.calls, ['searchLines:2026-10-11:2']); // demain par défaut

      expect(find.textContaining('Djamel Navettes · Renault Trafic'), findsOneWidget);
      expect(find.text('5 places libres'), findsOneWidget);
      expect(find.text('Opérateur vérifié'), findsOneWidget);
      expect(find.textContaining('par place'), findsOneWidget);

      await tester.tap(find.text('Réserver'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Plus : Places').last);
      await tester.tap(find.byTooltip('Plus : Sièges enfant'));
      await tester.pump();
      expect(find.textContaining('Confirmer ·'), findsOneWidget);
      await tester.tap(find.textContaining('Confirmer ·'));
      await tester.pumpAndSettle();
      expect(market.calls.last, 'bookLine:d1:3:1:0');
      expect(market.bookedSeatNumbers, isNull); // aucun siège choisi : attribution automatique
      expect(find.text('réservation trip-1'), findsOneWidget); // récapitulatif et QR
    });

    testWidgets('choix du siège : sièges pris désactivés, choix complet exigé, sièges transmis', (tester) async {
      market.lineResults = [departure()];
      final handle = tester.ensureSemantics();
      await pump(tester, const LineSearchScreen());
      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rechercher'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Réserver'));
      await tester.pumpAndSettle();

      // Sièges 2 et 5 déjà vendus : annoncés et non sélectionnables.
      expect(find.bySemanticsLabel('Siège 2, déjà pris'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '2')).onPressed, isNull);

      await tester.tap(find.byTooltip('Plus : Places').last); // 2 places
      await tester.pump();
      await tester.tap(find.widgetWithText(OutlinedButton, '3'));
      await tester.pump();
      expect(find.bySemanticsLabel('Siège 3, sélectionné'), findsOneWidget);
      // Choix partiel : la confirmation attend le second siège.
      expect(find.text('Encore 1 siège à choisir'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, '3')).onPressed, isNotNull);

      await tester.tap(find.widgetWithText(OutlinedButton, '4'));
      await tester.pump();
      expect(find.textContaining('à choisir'), findsNothing);
      await tester.tap(find.textContaining('Confirmer ·'));
      await tester.pumpAndSettle();
      expect(market.calls.last, 'bookLine:d1:2:0:0');
      expect(market.bookedSeatNumbers, [3, 4]);
      handle.dispose();
    });

    testWidgets('aucun départ : la demande de devis est proposée ; plus de places : message du serveur', (tester) async {
      await pump(tester, const LineSearchScreen());
      await tester.tap(find.text('Rechercher'));
      await tester.pump();
      expect(find.text('Choisissez le départ et l’arrivée.'), findsOneWidget);

      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rechercher'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Aucun départ de ligne ce jour-là'), findsOneWidget);
      await tester.tap(find.text('Demander des devis'));
      await tester.pumpAndSettle();
      expect(find.text('route /market/requests/new'), findsOneWidget);
    });

    testWidgets('accessibilité de la recherche et des résultats', (tester) async {
      market.lineResults = [departure()];
      await pump(tester, const LineSearchScreen());
      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rechercher'));
      await tester.pumpAndSettle();
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });
  });

  group('demandes de devis', () {
    testWidgets('publication : trajet, date, 6 passagers, besoin particulier', (tester) async {
      market.requests = [request(RequestStatus.published)];
      await pump(tester, const RequestFormScreen());
      await tester.tap(find.text('Publier la demande'));
      await tester.pump();
      expect(find.text('Choisissez le départ et l’arrivée.'), findsOneWidget);

      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Date et heure du départ'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byTooltip('Plus : Passagers'));
      }
      await tester.enterText(find.widgetWithText(TextField, 'Besoins particuliers (facultatif)'), 'Un siège bébé');
      await tester.tap(find.text('Publier la demande'));
      await tester.pumpAndSettle();

      final draft = market.createdRequest!;
      expect(draft.toJson(), containsPair('passengers', 6));
      expect(draft.toJson(), containsPair('flexMin', 30));
      expect(draft.toJson(), containsPair('needs', 'Un siège bébé'));
      expect(draft.toJson(), containsPair('publish', true));
      expect(draft.departureAt, DateTime(2026, 10, 13, 8));
      expect(find.text('route /market/requests/r-new'), findsOneWidget);
    });

    testWidgets('mes demandes : statut en clair, propositions reçues mises en avant', (tester) async {
      market.requests = [request(RequestStatus.offersReceived, openOffers: 2)];
      await pump(tester, const MarketHomeScreen());
      expect(find.text('Porte Maillot, Paris → Aéroport de Beauvais'), findsOneWidget);
      expect(find.text('2 propositions reçues'), findsOneWidget);
      await tester.tap(find.text('2 propositions reçues'));
      await tester.pumpAndSettle();
      expect(find.text('route /market/requests/r1'), findsOneWidget);
    });

    testWidgets('comparer et choisir : l’opérateur doit encore confirmer', (tester) async {
      market.requests = [request(RequestStatus.offersReceived, openOffers: 2)];
      market.requestOffers = [offer('o1', 18000, 'Djamel Navettes'), offer('o2', 21000, 'Chris Transports')];
      market.lineResults = [departure()];
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));

      expect(find.text('Djamel Navettes'), findsOneWidget);
      expect(find.text('Chris Transports'), findsOneWidget);
      expect(find.text('Pas encore de note'), findsNothing); // intégré à la ligne de détail
      expect(find.textContaining('Pas encore de note'), findsNWidgets(2));
      expect(find.text('Lignes régulières disponibles'), findsOneWidget); // un départ de ligne répond déjà

      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('doit encore confirmer sa disponibilité'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Choisir').last);
      await tester.pumpAndSettle();
      expect(market.calls, ['acceptOffer:o1']);
    });

    testWidgets('en attente de l’opérateur : plus de choix possible ; confirmée : accès à la réservation', (tester) async {
      market.requests = [request(RequestStatus.accepted)];
      market.requestOffers = [offer('o1', 18000, 'Djamel Navettes', status: OfferStatus.accepted)];
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));
      expect(find.text('En attente de confirmation'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Choisir'), findsNothing);

      market.requests = [request(RequestStatus.confirmed, tripId: 'trip-9')];
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));
      expect(find.text('Annuler la demande'), findsNothing); // l'annulation passe par la course
      await tester.tap(find.text('Voir ma réservation'));
      await tester.pumpAndSettle();
      expect(find.text('réservation trip-9'), findsOneWidget);
    });

    testWidgets('annulation de la demande ; erreur du serveur affichée', (tester) async {
      market.requests = [request(RequestStatus.published)];
      market.nextError = const ApiException('Cette demande ne peut plus être annulée');
      await pump(tester, const RequestDetailScreen(requestId: 'r1'));
      await tester.tap(find.text('Annuler la demande'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Annuler la demande'));
      await tester.pumpAndSettle();
      expect(market.calls, ['cancelRequest:r1']);
      expect(find.text('Cette demande ne peut plus être annulée'), findsOneWidget);
    });
  });
}
