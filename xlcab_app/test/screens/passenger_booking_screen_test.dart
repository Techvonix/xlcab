import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_app/providers/booking_provider.dart';
import 'package:xlcab_app/router.dart';
import 'package:xlcab_app/screens/booking/passenger_booking_screen.dart';
import 'package:xlcab_app/screens/booking/widgets/booking_map.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_app/services/booking_service.dart';
import 'package:xlcab_core/services/places_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

import '../support/fakes.dart';

// Tests de l'écran 6 (Réservation passager). Réseau, Google Places et
// carte Google sont remplacés par des doubles de test.

final now = DateTime(2026, 10, 1, 8, 0);
const mapKey = Key('fake-map');

late FakeBookingService bookingService;
late FakePlacesService placesService;

Future<void> pumpBooking(WidgetTester tester, {String query = ''}) async {
  // Téléphone de 360 × 1600 points : tout le formulaire est construit.
  tester.view.physicalSize = const Size(1080, 4800);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: '${AppRoutes.passengerBooking}$query',
    routes: [
      GoRoute(
        path: AppRoutes.passengerBooking,
        builder: (_, state) => PassengerBookingScreen(
          initialShuttleType: ShuttleType.fromApi(state.uri.queryParameters['type']),
        ),
      ),
      GoRoute(
        path: AppRoutes.payment,
        builder: (_, state) =>
            Scaffold(body: Text('ÉCRAN PAIEMENT ${(state.extra as BookingDraft).quote.totalCents}')),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingServiceProvider.overrideWithValue(bookingService),
        placesServiceProvider.overrideWithValue(placesService),
        bookingMapBuilderProvider.overrideWithValue((_, __) => const ColoredBox(key: mapKey, color: Colors.grey)),
        clockProvider.overrideWithValue(() => now),
        quoteDebounceProvider.overrideWithValue(Duration.zero),
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
    ),
  );
  await tester.pumpAndSettle();
}

BookingFormNotifier formOf(WidgetTester tester) => ProviderScope.containerOf(
      tester.element(find.byType(PassengerBookingScreen)),
    ).read(bookingFormProvider.notifier);

Future<void> fillValidForm(WidgetTester tester) async {
  formOf(tester)
    ..setOrigin(paris)
    ..setDestination(rouen)
    ..setDeparture(now.add(const Duration(hours: 3)));
  await tester.pumpAndSettle();
}

/// Le bouton "Payer" (ElevatedButton à l'intérieur de PrimaryButton).
ButtonStyleButton payButton(WidgetTester tester) => tester.widget<ButtonStyleButton>(
      find.descendant(of: find.byType(PrimaryButton), matching: find.bySubtype<ButtonStyleButton>()),
    );

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    bookingService = FakeBookingService();
    placesService = FakePlacesService();
  });

  group('structure (Partie 7, écran 6)', () {
    testWidgets('la carte occupe 30 % de la hauteur', (tester) async {
      await pumpBooking(tester);
      expect(tester.getSize(find.byKey(mapKey)).height, closeTo(1600 * 0.3, 0.5));
    });

    testWidgets('formulaire vide : "Payer" désactivé, aucun devis demandé', (tester) async {
      await pumpBooking(tester);
      expect(payButton(tester).enabled, isFalse);
      expect(find.text('Renseignez le départ, l’arrivée et la date pour obtenir un prix.'), findsOneWidget);
      expect(bookingService.quoteRequests, isEmpty);
    });

    testWidgets('la navette passée en paramètre est présélectionnée', (tester) async {
      await pumpBooking(tester, query: '?type=rose');
      expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Navette Rose')).selected, isTrue);
      expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Navette Bleue')).selected, isFalse);
    });
  });

  group('adresses', () {
    testWidgets('recherche avec autocomplétion puis retour au formulaire', (tester) async {
      await pumpBooking(tester);

      await tester.tap(find.bySemanticsLabel('Départ : non renseigné'));
      await tester.pumpAndSettle();
      expect(find.text('Adresse de départ'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Gare de Ly');
      await tester.pump(const Duration(milliseconds: 350)); // anti-rebond
      await tester.pumpAndSettle();
      expect(placesService.queries, ['Gare de Ly']);

      await tester.tap(find.text('Gare de Lyon'));
      await tester.pumpAndSettle();

      expect(find.text('Adresse de départ'), findsNothing); // écran refermé
      expect(find.text(paris.address), findsOneWidget);
    });

    testWidgets("pas de recherche avant 3 caractères", (tester) async {
      await pumpBooking(tester);
      await tester.tap(find.bySemanticsLabel('Arrivée : non renseigné'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Ro');
      await tester.pump(const Duration(milliseconds: 350));
      expect(placesService.queries, isEmpty);
    });

    testWidgets('arrivée identique au départ : erreur visible', (tester) async {
      await pumpBooking(tester);
      formOf(tester)
        ..setOrigin(paris)
        ..setDestination(paris);
      await tester.pumpAndSettle();
      expect(find.text("L'arrivée doit être différente du départ"), findsOneWidget);
    });
  });

  group('devis et paiement', () {
    testWidgets('formulaire complet : récapitulatif et "Payer" avec le montant', (tester) async {
      await pumpBooking(tester);
      await fillValidForm(tester);

      expect(find.textContaining('135,4 km'), findsOneWidget);
      expect(find.text('Total TTC'), findsOneWidget);
      expect(find.text('Transport passagers (HT)'), findsOneWidget);
      expect(payButton(tester).enabled, isTrue);
      expect(find.textContaining('Payer 121,86'), findsOneWidget);

      await tester.tap(find.byType(PrimaryButton));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN PAIEMENT 12186'), findsOneWidget);
    });

    testWidgets('le toggle colis recalcule le prix et affiche la ligne colis à 20 %', (tester) async {
      await pumpBooking(tester);
      await fillValidForm(tester);

      await tester.tap(find.text('Ajouter un colis'));
      await tester.pumpAndSettle();

      expect(bookingService.quoteRequests.last.withParcel, isTrue);
      expect(find.text('Colis (HT)'), findsOneWidget);
      expect(find.textContaining('TVA 20 %'), findsOneWidget);
      expect(find.textContaining('Payer 131,46'), findsOneWidget);
    });

    testWidgets('refus du serveur (moins de 60 km) : message affiché, paiement bloqué', (tester) async {
      bookingService.quoteError = const ApiException('Distance minimale : 60 km');
      await pumpBooking(tester);
      await fillValidForm(tester);

      expect(find.text('Distance minimale : 60 km'), findsOneWidget);
      expect(payButton(tester).enabled, isFalse);
    });

    testWidgets('départ à moins de 2 h : erreur sur le champ, aucun devis', (tester) async {
      await pumpBooking(tester);
      formOf(tester)
        ..setOrigin(paris)
        ..setDestination(rouen)
        ..setDeparture(now.add(const Duration(hours: 1)));
      await tester.pumpAndSettle();

      expect(find.textContaining('Réservation au moins 2 h à l’avance'), findsOneWidget);
      expect(bookingService.quoteRequests, isEmpty);
      expect(payButton(tester).enabled, isFalse);
    });
  });

  group('passagers et options', () {
    testWidgets('compteur de passagers de 1 à 7', (tester) async {
      await pumpBooking(tester);
      // L'IconButton contient son infobulle : on le retrouve par ancêtre.
      final add = find.ancestor(of: find.byTooltip('Ajouter un passager'), matching: find.byType(IconButton));
      final remove = find.ancestor(of: find.byTooltip('Retirer un passager'), matching: find.byType(IconButton));

      expect(tester.widget<IconButton>(remove).onPressed, isNull); // déjà à 1
      for (var i = 0; i < 6; i++) {
        await tester.tap(add);
        await tester.pump();
      }
      expect(tester.widget<IconButton>(add).onPressed, isNull); // bloqué à 7
      expect(find.text('7'), findsOneWidget);
    });

    testWidgets('options en accordéon : repliées, puis dépliées', (tester) async {
      await pumpBooking(tester);
      expect(find.text('Wi-Fi à bord'), findsNothing);

      await tester.tap(find.text('Options'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Wi-Fi à bord'));
      await tester.pumpAndSettle();

      expect(find.text('Wi-Fi'), findsOneWidget); // résumé sous "Options"
    });
  });

  group('accessibilité (Partie 5)', () {
    testWidgets('zones tactiles, libellés et contraste conformes', (tester) async {
      await pumpBooking(tester);
      await fillValidForm(tester);
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      // Inclut les puces de navette sélectionnées (texte sur conteneur).
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });

    testWidgets('le compteur est annoncé avec sa valeur', (tester) async {
      await pumpBooking(tester);
      expect(
        tester.getSemantics(find.bySemanticsLabel('Passagers')),
        matchesSemantics(label: 'Passagers', value: '1 passager', increasedValue: '2 passagers', hasIncreaseAction: true),
      );
    });

    testWidgets('texte agrandi à 200 % : aucun débordement', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpBooking(tester);
      await fillValidForm(tester);
      // Colis activé par l'état : ce test vise le débordement de la ligne
      // colis ; l'interrupteur lui-même est testé dans "devis et paiement".
      formOf(tester).setWithParcel(true);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Total TTC'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.takeException(), isNull);
    });
  });
}
