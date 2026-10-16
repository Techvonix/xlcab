import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/departure_guarantee.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_driver/providers/operator_provider.dart';
import 'package:xlcab_ui/screens/address_search_screen.dart' show addressPickerProvider;
import 'package:xlcab_driver/screens/operator/cancellations_screen.dart';
import 'package:xlcab_driver/screens/operator/departure_screen.dart';
import 'package:xlcab_driver/screens/operator/line_form_screen.dart';
import 'package:xlcab_driver/screens/operator/market_feed_screen.dart';
import 'package:xlcab_driver/screens/operator/my_lines_screen.dart';
import 'package:xlcab_driver/screens/operator/operator_section.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_driver/services/driver_device.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_driver/services/operator_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';
import '../support/operator_fakes.dart';

// Espace opérateur (bourse de transport, étape 3) : lignes régulières,
// départs, reprises, bourse, annulations. Serveur simulé.

late FakeOperatorService operators;
late FakeMarketService market;
late FakeQrScanner scanner;
late FakeLauncher launcher;
late List<Place> pickedPlaces;
late GoRouter router;

final today = DateTime(2026, 10, 10, 9);

/// Affiche [screen] au-dessus d'une page d'accueil (pour que « retour » fonctionne).
/// [height] : hauteur de l'écran de test en pixels physiques (÷ 3 = points). Les longs formulaires sont des
/// listes paresseuses : ce qui dépasse l'écran n'est pas construit, donc introuvable.
Future<void> pump(WidgetTester tester, Widget screen, {double height = 4200}) async {
  tester.view.physicalSize = Size(1170, height);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('accueil'))),
      GoRoute(path: '/ecran', builder: (_, __) => screen),
      // Destinations ouvertes depuis les écrans testés.
      GoRoute(path: '/driver/:a', builder: (_, s) => Scaffold(body: Text('route ${s.uri.path}'))),
      GoRoute(path: '/driver/:a/:b', builder: (_, s) => Scaffold(body: Text('route ${s.uri.path}'))),
    ],
  );
  var next = 0;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      operatorServiceProvider.overrideWithValue(operators),
      marketServiceProvider.overrideWithValue(market),
      qrScannerProvider.overrideWithValue(scanner),
      driverLauncherProvider.overrideWithValue(launcher),
      clockProvider.overrideWithValue(() => today),
      addressPickerProvider.overrideWithValue((_, __) async => pickedPlaces[next++ % pickedPlaces.length]),
      timePickerProvider.overrideWithValue((_, initial) async => const TimeOfDay(hour: 5, minute: 0)),
      datePickerProvider.overrideWithValue((_, first, last, initial) async => DateTime(2026, 10, 12)),
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

Manifest manifest({bool ready = false, bool checkedIn = false, bool started = false, DepartureGuarantee? guarantee}) => Manifest(
      departureId: 'd1',
      guarantee: guarantee,
      departureAt: DateTime(2026, 10, 12, 5),
      origin: 'Porte Maillot, Paris',
      destination: 'Aéroport de Beauvais',
      ready: ready,
      seatsBooked: 5,
      passengers: [
        ManifestPassenger(tripId: 't1', firstName: 'Léa', phone: '+33622222222', seats: 3, childSeats: 1, checkedIn: checkedIn, started: started),
        ManifestPassenger(tripId: 't2', firstName: 'Tom', seats: 2, childSeats: 0, checkedIn: false, started: started),
      ],
    );

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    operators = FakeOperatorService();
    market = FakeMarketService();
    scanner = FakeQrScanner();
    launcher = FakeLauncher();
    pickedPlaces = [porteMaillot, beauvaisAirport];
  });

  group('mes lignes', () {
    testWidgets('ligne affichée (trajet, horaire, prix à la place) ; départs de la semaine confirmés en un geste', (tester) async {
      operators.myLines = [beauvaisLine(toConfirm: 5)];
      await pump(tester, const MyLinesScreen());

      expect(find.text('Porte Maillot, Paris → Aéroport de Beauvais'), findsOneWidget);
      expect(find.text('05:00 · Du lundi au vendredi'), findsOneWidget);
      expect(find.textContaining('par place · 8 places'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);
      expect(find.text('5 départs à confirmer'), findsNWidgets(2)); // carte d'action + pastille de la ligne

      await tester.tap(find.text('J’assure mes départs des 7 prochains jours'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['confirmDepartures:2026-10-17']);
      expect(find.text('5 départs confirmés'), findsOneWidget);
    });

    testWidgets('conditions opérateur non acceptées : pas de nouvelle ligne, renvoi vers le profil', (tester) async {
      operators.operatorProfile = const OperatorProfile(
        kind: 'independent', status: OperatorStatus.pending, perSeatAllowed: false, termsAccepted: false, termsVersion: '2026-10-09',
      );
      await pump(tester, const MyLinesScreen());
      expect(find.text('Acceptez les conditions générales opérateur pour publier vos lignes.'), findsOneWidget);

      await tester.tap(find.text('Nouvelle ligne'));
      await tester.pumpAndSettle();
      expect(find.text('route /driver/operator'), findsOneWidget);
    });

    testWidgets('accessibilité : contrastes, cibles tactiles, libellés', (tester) async {
      operators.myLines = [beauvaisLine(toConfirm: 2), beauvaisLine(status: LineStatus.paused, perSeat: false)];
      await pump(tester, const MyLinesScreen());
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });
  });

  group('nouvelle ligne', () {
    testWidgets('vente à la place indisponible sans licence vérifiée ; ligne publiée par véhicule', (tester) async {
      operators.operatorProfile = const OperatorProfile(
        kind: 'independent', status: OperatorStatus.verified, perSeatAllowed: false, termsAccepted: true, termsVersion: '2026-10-09',
      );
      await pump(tester, const LineFormScreen(), height: 7800);

      expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Par place')).onSelected, isNull);
      expect(find.textContaining('réservée aux licences de transport collectif'), findsOneWidget);

      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Renault Trafic · 8 places'));
      await tester.tap(find.text('Heure de départ'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Bagages par départ'), '10');
      await tester.enterText(find.widgetWithText(TextFormField, 'Prix du véhicule (TTC)'), '390');
      await tester.tap(find.text('Publier la ligne'));
      await tester.pumpAndSettle();

      final draft = operators.createdLine!;
      expect(draft.origin.address, 'Porte Maillot, Paris');
      expect(draft.destination.address, 'Aéroport de Beauvais');
      expect(draft.toJson(), containsPair('pricingMode', 'per_vehicle'));
      expect(draft.toJson(), containsPair('priceCents', 39000));
      expect(draft.toJson(), containsPair('departureTime', '05:00'));
      expect(draft.toJson(), containsPair('seats', 8)); // capacité du véhicule proposée par défaut
      expect(draft.toJson(), containsPair('daysOfWeek', [1, 2, 3, 4, 5]));
      expect(draft.toJson(), containsPair('startDate', '2026-10-11')); // demain par défaut
      expect(find.text('accueil'), findsOneWidget); // retour après publication
    });

    testWidgets('vente à la place avec seuil de départ garanti : seuil proposé (moitié des places), modifiable, envoyé', (tester) async {
      await pump(tester, const LineFormScreen(), height: 9000);
      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Renault Trafic · 8 places'));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextFormField, 'Bagages par départ'), '8');
      await tester.tap(find.text('Par place'));
      await tester.pump();
      expect(find.text('Seuil de départ garanti'), findsOneWidget);
      await tester.tap(find.text('Seuil de départ garanti'));
      await tester.pump();
      final field = find.widgetWithText(TextFormField, 'Je pars dès … passagers');
      expect(tester.widget<TextFormField>(field).controller!.text, '4');

      await tester.enterText(field, '9'); // plus que les places
      await tester.enterText(find.widgetWithText(TextFormField, 'Prix par place (TTC)'), '30');
      await tester.tap(find.text('Publier la ligne'));
      await tester.pumpAndSettle();
      expect(find.text('Entre 1 et le nombre de places'), findsOneWidget);
      expect(operators.createdLine, isNull);

      await tester.enterText(field, '5');
      await tester.tap(find.text('Publier la ligne'));
      await tester.pumpAndSettle();
      final json = operators.createdLine!.toJson();
      expect(json, containsPair('pricingMode', 'per_seat'));
      expect(json, containsPair('minPassengers', 5));
    });

    testWidgets('départ ponctuel : un jour, pas de retour ni de jours de la semaine, publié et mis en vente', (tester) async {
      await pump(tester, const LineFormScreen(oneOff: true), height: 8000);
      expect(find.text('Publier un départ'), findsOneWidget);
      expect(find.text('Retour le même jour'), findsNothing);
      expect(find.byType(FilterChip), findsNothing);

      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Renault Trafic · 8 places'));
      await tester.tap(find.text('Jour du départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Heure de départ'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Places par départ'), '3');
      await tester.enterText(find.widgetWithText(TextFormField, 'Bagages par départ'), '3');
      await tester.tap(find.text('Par place'));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextFormField, 'Prix par place (TTC)'), '35');
      await tester.tap(find.text('Publier et mettre en vente'));
      await tester.pumpAndSettle();

      expect(operators.calls, ['publishDeparture']);
      final json = operators.createdLine!.toOneOffJson();
      expect(json, containsPair('date', '2026-10-12'));
      expect(json, containsPair('departureTime', '05:00'));
      expect(json, containsPair('seats', 3));
      expect(json, containsPair('priceCents', 3500));
      expect(json.containsKey('daysOfWeek'), isFalse);
      expect(json.containsKey('startDate'), isFalse);
    });

    testWidgets('plus de places que le véhicule : refusé avant l’envoi ; erreur du serveur affichée', (tester) async {
      await pump(tester, const LineFormScreen(), height: 7800);
      await tester.tap(find.text('Départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Arrivée'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Renault Trafic · 8 places'));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextFormField, 'Places par départ'), '9');
      await tester.enterText(find.widgetWithText(TextFormField, 'Bagages par départ'), '4');
      await tester.enterText(find.widgetWithText(TextFormField, 'Prix du véhicule (TTC)'), '25,50');
      await tester.tap(find.text('Publier la ligne'));
      await tester.pumpAndSettle();
      expect(find.text('8 au plus'), findsWidgets);
      expect(operators.createdLine, isNull);

      await tester.enterText(find.widgetWithText(TextFormField, 'Places par départ'), '8');
      operators.nextError = const ApiException('20 lignes au maximum : fermez-en une d’abord');
      await tester.tap(find.text('Publier la ligne'));
      await tester.pumpAndSettle();
      expect(find.text('20 lignes au maximum : fermez-en une d’abord'), findsOneWidget);
    });
  });

  group('départ', () {
    testWidgets('liste d’embarquement, « Je suis en route », scan d’un QR', (tester) async {
      operators.currentManifest = manifest();
      await pump(tester, const DepartureScreen(departureId: 'd1'));

      expect(find.text('5 passagers · 2 réservations'), findsOneWidget);
      expect(find.text('Léa'), findsOneWidget);
      expect(find.text('3 places · 1 siège enfant'), findsOneWidget);
      expect(find.byTooltip('Appeler Léa'), findsOneWidget); // téléphone fourni par le serveur à T−60 min
      expect(find.byTooltip('Appeler Tom'), findsNothing);

      await tester.tap(find.text('Je suis en route'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['ready']);

      await tester.tap(find.text('Scanner le QR d’un passager'));
      await tester.pumpAndSettle();
      expect(operators.calls.last, 'checkIn:$boardingQr');
      expect(find.text('Léa est à bord.'), findsOneWidget);

      await tester.tap(find.byTooltip('Appeler Léa'));
      expect(launcher.calls, ['+33622222222']);
    });

    testWidgets('démarrage : avertit des réservations non scannées ; fin du départ', (tester) async {
      operators.currentManifest = manifest(ready: true, checkedIn: true);
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      await tester.tap(find.text('Démarrer le départ'));
      await tester.pumpAndSettle();
      expect(find.text('1 réservation n’a pas été scannée. Démarrer quand même ?'), findsOneWidget);
      await tester.tap(find.text('Démarrer'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['startDeparture']);

      operators.currentManifest = manifest(ready: true, checkedIn: true, started: true);
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      expect(find.text('Annuler ce départ'), findsNothing); // plus d'annulation en cours de route
      await tester.tap(find.text('Terminer le départ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Terminer'));
      await tester.pumpAndSettle();
      expect(operators.calls.last, 'completeDeparture');
    });

    testWidgets('annulation : règles rappelées, motif obligatoire, puis secours sollicité', (tester) async {
      operators.currentManifest = manifest();
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      await tester.tap(find.text('Annuler ce départ'));
      await tester.pumpAndSettle();
      expect(find.textContaining('pénalité de 260 €'), findsOneWidget);
      await tester.tap(find.text('Continuer'));
      await tester.pumpAndSettle();

      final submit = find.widgetWithText(FilledButton, 'Annuler le départ');
      expect(tester.widget<FilledButton>(submit).onPressed, isNull); // pas de motif
      await tester.enterText(find.byType(TextField), 'Panne moteur ce matin');
      await tester.pump();
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(operators.calls, ['cancelDeparture:Panne moteur ce matin']);
      expect(find.text('accueil'), findsOneWidget);
    });
  });

  group('seuil de départ garanti', () {
    const pending = DepartureGuarantee(guaranteed: false, minPassengers: 7);

    testWidgets('en attente : passagers manquants, seuil rappelé ; « Je pars quand même » après confirmation', (tester) async {
      operators.currentManifest = manifest(guarantee: pending);
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      expect(find.text('Encore 2 passagers pour confirmer le départ'), findsOneWidget);
      expect(find.text('Votre seuil : 7 passagers.'), findsOneWidget);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Je pars quand même'));
      await tester.pumpAndSettle();
      expect(find.text('Partir sans attendre le seuil ?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Je pars quand même'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['guaranteeDeparture']);
    });

    testWidgets('retrait avant le seuil : ni secours ni pénalité annoncés', (tester) async {
      operators.currentManifest = manifest(guarantee: pending);
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      await tester.tap(find.text('Annuler ce départ'));
      await tester.pumpAndSettle();
      expect(find.textContaining('sans chauffeur de secours et sans pénalité'), findsOneWidget);
      expect(find.textContaining('pénalité de 260 €'), findsNothing);
    });

    testWidgets('seuil atteint : « Départ confirmé », plus de bouton', (tester) async {
      operators.currentManifest = manifest(guarantee: const DepartureGuarantee(guaranteed: true, minPassengers: 4));
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      expect(find.text('Départ confirmé'), findsOneWidget);
      expect(find.text('Je pars quand même'), findsNothing);
    });

    testWidgets('accessibilité de la carte « en attente »', (tester) async {
      final handle = tester.ensureSemantics();
      operators.currentManifest = manifest(guarantee: pending);
      await pump(tester, const DepartureScreen(departureId: 'd1'));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });
  });

  group('mode chauffeur : reprises et réserves', () {
    Widget section() => const Scaffold(body: SingleChildScrollView(child: OperatorSection()));

    testWidgets('départ à reprendre en urgence : accepté, puis ouvert', (tester) async {
      final at = DateTime(2026, 10, 10, 14);
      operators.rescueOffers = [
        RescueOffer(
          id: 'o1', expiresAt: DateTime(2026, 10, 10, 9, 5), departureAt: at, localTime: '14:00', origin: 'Porte Maillot, Paris',
          destination: 'Aéroport de Beauvais', passengers: 7, totalPriceCents: 17500, fromBackupRole: true,
        ),
      ];
      operators.myAssignments = [
        Assignment(
          departureId: 'd9', departureAt: at, origin: 'Porte Maillot, Paris', destination: 'Aéroport de Beauvais',
          passengers: 7, bookings: 2, started: false, ready: true, rescued: true,
        ),
      ];
      await pump(tester, section());
      expect(find.text('Vous êtes réserve : ce départ a besoin de vous'), findsOneWidget);
      expect(find.textContaining('7 passagers'), findsWidgets);

      await tester.tap(find.text('Je reprends ce départ'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['answerRescue:true']);
      expect(find.text('route /driver/departures/d9'), findsOneWidget);
    });

    testWidgets('déjà repris par un autre : le message du serveur est affiché', (tester) async {
      operators.rescueOffers = [
        RescueOffer(
          id: 'o1', expiresAt: DateTime(2026, 10, 10, 9, 5), departureAt: DateTime(2026, 10, 10, 14), localTime: '14:00', origin: 'Paris',
          destination: 'Beauvais', passengers: 7, totalPriceCents: 17500, fromBackupRole: false,
        ),
      ];
      operators.nextError = const ApiException('Ce départ a déjà été repris');
      await pump(tester, section());
      expect(find.text('Urgent : un départ cherche un chauffeur'), findsOneWidget);
      await tester.tap(find.text('Je reprends ce départ'));
      await tester.pumpAndSettle();
      expect(find.text('Ce départ a déjà été repris'), findsOneWidget);
    });

    testWidgets('invitation de réserve : acceptée avec mon véhicule ; véhicule trop petit refusé', (tester) async {
      operators.roles = [
        const BackupRole(
          id: 'b1', rank: 2, status: BackupStatus.invited, origin: 'Porte Maillot, Paris', destination: 'Aéroport de Beauvais',
          departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5], seats: 8,
        ),
      ];
      await pump(tester, section());
      expect(find.text('Invitation : chauffeur de réserve n° 2'), findsOneWidget);
      await tester.tap(find.text('Accepter'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['answerBackup:true:v1']);

      operators.calls.clear();
      operators.fleet = [const OperatorVehicle(id: 'v2', brand: 'Peugeot', model: '5008', capacity: 6)];
      await pump(tester, section());
      await tester.tap(find.text('Accepter'));
      await tester.pumpAndSettle();
      expect(operators.calls, isEmpty);
      expect(find.text('Il faut un véhicule d’au moins 8 places passagers.'), findsOneWidget);
    });
  });

  group('bourse', () {
    MarketFeedItem request() => MarketFeedItem(
          id: 'r1', originArea: '75017 Paris', destinationArea: 'Aéroport de Beauvais-Tillé', distanceKm: 66,
          departureAt: DateTime(2026, 10, 12, 8), flexMin: 30, passengers: 6, luggage: 6, accessible: false, recurring: false,
          expiresAt: DateTime(2026, 10, 12, 7), needs: 'Un siège bébé',
        );

    testWidgets('demande compatible (zone approximative) et proposition de prix', (tester) async {
      market.items = [request()];
      await pump(tester, const MarketFeedScreen());
      expect(find.text('75017 Paris → Aéroport de Beauvais-Tillé'), findsOneWidget);
      expect(find.text('6 passagers'), findsOneWidget);
      expect(find.text('Un siège bébé'), findsOneWidget);

      await tester.tap(find.text('Faire une proposition'));
      await tester.pumpAndSettle();
      final send = find.widgetWithText(FilledButton, 'Envoyer la proposition');
      expect(tester.widget<FilledButton>(send).onPressed, isNull);
      await tester.tap(find.text('Renault Trafic · 8 places'));
      await tester.enterText(find.widgetWithText(TextField, 'Prix TTC'), '180');
      await tester.pump();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(market.calls, ['propose:r1:v1:18000:false']);
      expect(find.text('Proposition envoyée au client.'), findsOneWidget);
    });

    testWidgets('proposition choisie par le client : à reconfirmer', (tester) async {
      market.offers = [
        MarketOffer(
          id: 'of1', requestId: 'r1', priceCents: 18000, pickupAt: DateTime(2026, 10, 12, 8), includesReturn: false,
          status: OfferStatus.accepted, validUntil: DateTime(2026, 10, 11, 9), confirmDeadline: DateTime(2026, 10, 10, 11),
          operatorVerified: true, operatorRatingCount: 0,
        ),
      ];
      await pump(tester, const MarketFeedScreen());
      await tester.tap(find.text('Mes propositions (1 à confirmer)'));
      await tester.pumpAndSettle();
      expect(find.text('Choisie par le client : à confirmer'), findsOneWidget);
      await tester.tap(find.text('Je confirme ma disponibilité'));
      await tester.pumpAndSettle();
      expect(market.calls, ['confirm:of1']);
      expect(find.text('Réservation confirmée : la course est dans vos missions.'), findsOneWidget);
    });

    testWidgets('messagerie : le refus du serveur (coordonnées) est affiché', (tester) async {
      market.offers = [
        MarketOffer(
          id: 'of1', requestId: 'r1', priceCents: 18000, pickupAt: DateTime(2026, 10, 12, 8), includesReturn: false,
          status: OfferStatus.pending, validUntil: DateTime(2026, 10, 11, 9), operatorVerified: true, operatorRatingCount: 0,
        ),
      ];
      await pump(tester, const MarketFeedScreen());
      await tester.tap(find.text('Mes propositions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Messages'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Pas de téléphone ni d’e-mail'), findsOneWidget);

      market.nextError = const ApiException('Pas de coordonnées avant la confirmation : échangez par la messagerie XLCAB');
      await tester.enterText(find.widgetWithText(TextField, 'Votre message'), 'Appelez-moi au 06 12 34 56 78');
      await tester.tap(find.byTooltip('Envoyer'));
      await tester.pumpAndSettle();
      expect(find.text('Pas de coordonnées avant la confirmation : échangez par la messagerie XLCAB'), findsOneWidget);

      await tester.enterText(find.widgetWithText(TextField, 'Votre message'), 'Oui, siège bébé fourni.');
      await tester.tap(find.byTooltip('Envoyer'));
      await tester.pumpAndSettle();
      expect(find.text('Oui, siège bébé fourni.'), findsOneWidget);
    });
  });

  group('annulations', () {
    testWidgets('pénalité contestable : contestation envoyée avec son motif', (tester) async {
      operators.myCancellations = [
        DriverCancellation(
          id: 'c1', trigger: 'not_ready', minutesBefore: 60, status: CancellationStatus.counted, createdAt: DateTime(2026, 10, 9, 4),
          penalty: DriverPenalty(id: 'p1', amountCents: 26000, status: PenaltyStatus.pending, contestUntil: DateTime(2026, 10, 16)),
        ),
      ];
      await pump(tester, const CancellationsScreen());
      expect(find.text('« Je suis en route » non confirmé à 1 h du départ'), findsOneWidget);
      expect(find.textContaining('contestable pendant 7 jours'), findsOneWidget);

      await tester.tap(find.text('Contester la pénalité'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Application bloquée ce matin');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Contester'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['contest:Application bloquée ce matin']);
    });
  });
}
