import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_passenger/router.dart';
import 'package:xlcab_passenger/screens/booking/parcel_creation_screen.dart';
import 'package:xlcab_passenger/screens/booking/parcel_tracking_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/document_picker.dart';
import 'package:xlcab_core/services/parcel_service.dart';
import 'package:xlcab_passenger/services/payment_service.dart';
import 'package:xlcab_core/services/trip_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';
import '../support/operator_fakes.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/meeting_point.dart';
import 'package:xlcab_core/services/market_service.dart';

// Écrans 11 (création d'un envoi) et 12 (suivi). Serveur, Stripe, Google
// Places et appareil photo remplacés par des doubles.

late FakeParcelService parcels;
late FakeMarketService market;
late FakePaymentService payments;
late FakePresenter presenter;
late FakeTripService trips;
late FakeDocumentPicker picker;
late List<Place> addressQueue;

final now = DateTime(2026, 10, 10, 9);

Future<void> pump(WidgetTester tester, {String initial = AppRoutes.parcelCreation}) async {
  tester.view.physicalSize = const Size(1080, 9000);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: AppRoutes.parcelCreation, builder: (_, __) => const ParcelCreationScreen()),
    GoRoute(path: AppRoutes.parcelTracking, builder: (_, s) => ParcelTrackingScreen(parcelId: s.pathParameters['parcelId']!)),
  ]);

  await tester.pumpWidget(ProviderScope(
    overrides: [
      parcelServiceProvider.overrideWithValue(parcels),
      marketServiceProvider.overrideWithValue(market),
      paymentServiceProvider.overrideWithValue(payments),
      paymentSheetPresenterProvider.overrideWithValue(presenter),
      tripServiceProvider.overrideWithValue(trips),
      documentPickerProvider.overrideWithValue(picker),
      clockProvider.overrideWithValue(() => now),
      addressPickerProvider.overrideWithValue((_, __) async => addressQueue.removeAt(0)),
      pickupDateTimePickerProvider.overrideWithValue((_, __, ___) async => DateTime(2026, 10, 12, 14, 30)),
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
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> field(WidgetTester tester, String label, String value) async {
  final f = find.widgetWithText(TextFormField, label);
  await tester.ensureVisible(f);
  await tester.enterText(f, value);
}

/// Remplit tout le formulaire de l'écran 11 (date choisie : le 12 à 14 h 30).
Future<void> fillForm(WidgetTester tester, {String weight = '5', String length = '40'}) async {
  await tap(tester, find.text('Adresse d’enlèvement'));
  await tap(tester, find.text('Adresse de livraison'));
  await tap(tester, find.text('Date et heure d’enlèvement'));

  await field(tester, 'Poids (kg)', weight);
  await field(tester, 'Longueur (cm)', length);
  await field(tester, 'Largeur (cm)', '30');
  await field(tester, 'Hauteur (cm)', '20');
  await field(tester, 'Contenu (ex. carton de livres)', 'Carton de livres');
  await field(tester, 'Nom du destinataire', 'Marc Petit');
  await field(tester, 'Téléphone du destinataire', '06 12 34 56 78');
  await tap(tester, find.byType(Checkbox));
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    market = FakeMarketService();
    parcels = FakeParcelService();
    payments = FakePaymentService();
    presenter = FakePresenter();
    trips = FakeTripService();
    picker = FakeDocumentPicker();
    addressQueue = [paris, rouen];
  });

  group('écran 11 — création', () {
    testWidgets('devis : navette partagée et navette dédiée, la moins chère présélectionnée', (tester) async {
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));

      expect(parcels.lastRequest, isA<ParcelRequest>().having((r) => r.scheduledAt, 'heure', DateTime(2026, 10, 12, 14, 30)));
      expect(find.text('Navette partagée'), findsOneWidget);
      expect(find.text('Navette dédiée'), findsOneWidget);
      expect(find.textContaining('Payer 9,60'), findsOneWidget);

      await tap(tester, find.text('Navette dédiée'));
      expect(find.textContaining('Payer 155,83'), findsOneWidget);
    });

    testWidgets('ligne régulière qui prend des colis : proposée en premier, colis confié au départ', (tester) async {
    market.lineResults = [
      LineSearchResult(
        departureId: 'd-lyon', departureAt: DateTime(2026, 10, 12, 8), localTime: '08:00',
        origin: 'Porte d’Orléans', destination: 'Gare de Limoges', perSeat: true, unitPriceCents: 1500, totalPriceCents: 1500,
        seatsLeft: 4, luggage: 7, operatorRatingCount: 0, operatorName: 'Sami Navettes',
        board: const RoutePointView(stopId: 's1', name: 'Porte d’Orléans', address: 'Place du 25 Août 1944', transit: 'Métro 4'),
      ),
    ];
    await pump(tester);
    await fillForm(tester);
    await tap(tester, find.text('Voir les options et le prix'));
    expect(find.text('Ligne régulière · Sami Navettes'), findsOneWidget);
    expect(find.text('Métro 4'), findsOneWidget);
    expect(find.textContaining('Envoyer ·'), findsOneWidget); // présélectionnée : la moins chère

    await tap(tester, find.textContaining('Envoyer ·'));
    expect(market.calls, contains('bookLineParcel:d-lyon'));
    expect(market.lastLineParcel?.recipientName, isNotEmpty);
    expect(parcels.calls, isNot(contains(startsWith('book:'))));
  });

  testWidgets('trajet retour d’une navette : expliqué au client', (tester) async {
      parcels.quoteResult = const ParcelQuote(
        grafted: ParcelOption(available: true, onReturnLeg: true, price: ParcelPrice(priceCents: 800, vatCents: 160, totalCents: 960)),
        dedicated: dedicatedOption,
      );
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));
      expect(find.text('Navette partagée (trajet retour)'), findsOneWidget);
      expect(find.textContaining('qui rentrerait sinon à vide'), findsOneWidget);
    });

    testWidgets('option indisponible : raison affichée, non sélectionnable', (tester) async {
      parcels.quoteResult = const ParcelQuote(
        grafted: ParcelOption(available: false, reason: 'Aucune navette prévue sur ce trajet dans les 12 h suivant l’heure choisie'),
        dedicated: dedicatedOption,
      );
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));
      expect(find.textContaining('Aucune navette prévue'), findsOneWidget);
      expect(find.textContaining('Payer 155,83'), findsOneWidget);
    });

    testWidgets('paiement réussi : réservation, feuille Stripe, confirmation, suivi', (tester) async {
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));
      await tap(tester, find.textContaining('Payer 9,60'));

      expect(parcels.calls, ['quote', 'book:grafted']);
      expect(presenter.presented.single.amountCents, 960);
      expect(payments.calls, ['confirm:trip-parcel']);
      expect(find.text('Suivi du colis'), findsOneWidget);
    });

    testWidgets('feuille fermée puis nouvel essai : même réservation (pas de doublon)', (tester) async {
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.canceled));
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));
      await tap(tester, find.textContaining('Payer 9,60'));
      expect(find.textContaining('Paiement annulé'), findsOneWidget);

      await tap(tester, find.textContaining('Payer 9,60'));
      expect(parcels.calls.where((c) => c.startsWith('book')), hasLength(1));
      expect(payments.calls, ['resume:trip-parcel', 'confirm:trip-parcel']);
    });

    testWidgets('limites : plus de 30 kg ou plus de 120 × 80 × 80 cm refusés', (tester) async {
      await pump(tester);
      await fillForm(tester, weight: '35', length: '130');
      await tester.pump();
      expect(find.text('Trop grand : 120 × 80 × 80 cm maximum.'), findsOneWidget);
      await tap(tester, find.text('Voir les options et le prix'));
      expect(find.text('30 kg maximum'), findsOneWidget);
      expect(parcels.calls, isEmpty);
    });

    testWidgets('déclaration d’absence d’objets interdits exigée', (tester) async {
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.byType(Checkbox)); // décochée
      await tap(tester, find.text('Voir les options et le prix'));
      expect(find.textContaining('Confirmez que le colis ne contient aucun objet interdit'), findsOneWidget);
      expect(parcels.calls, isEmpty);
    });

    testWidgets('modifier le formulaire après le devis : le devis est à refaire', (tester) async {
      await pump(tester);
      await fillForm(tester);
      await tap(tester, find.text('Voir les options et le prix'));
      await field(tester, 'Poids (kg)', '12');
      await tester.pump();
      expect(find.text('Voir les options et le prix'), findsOneWidget);
    });

    testWidgets('accessibilité du formulaire', (tester) async {
      await pump(tester);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });
  });

  group('écran 12 — suivi', () {
    testWidgets('en attente : timeline, QR pour le chauffeur, code de remise à transmettre', (tester) async {
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      expect(find.text('En attente d’enlèvement'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Envoi confirmé : ')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Livré au destinataire : à venir')), findsOneWidget);
      expect(find.bySemanticsLabel('QR code du colis, à présenter au chauffeur à l’enlèvement'), findsOneWidget);
      expect(find.text('4821'), findsOneWidget);
      expect(find.textContaining('Transmettez ce code à Marc Petit'), findsOneWidget);
      expect(find.textContaining('Chauffeur : Nadia'), findsOneWidget);
    });

    testWidgets('colis au retour d’une navette : mode expliqué', (tester) async {
      parcels.detailResult = parcelDetailFor(onReturnLeg: true);
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      expect(find.textContaining('au retour d’un chauffeur XLCAB'), findsOneWidget);
    });

    testWidgets('livré : timeline complète, plus de QR ni de code', (tester) async {
      parcels.detailResult = parcelDetailFor(status: ParcelStatus.delivered, cancellable: false);
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      expect(find.text('Livré'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Livré au destinataire : 12 oct')), findsOneWidget);
      expect(find.text('4821'), findsNothing);
      expect(find.text('Annuler l’envoi'), findsNothing);
    });

    testWidgets('problème signalé : motif affiché', (tester) async {
      parcels.detailResult = parcelDetailFor(status: ParcelStatus.failed, cancellable: false);
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      expect(find.textContaining('Destinataire absent ou injoignable. Notre équipe vous recontacte.'), findsOneWidget);
    });

    testWidgets('annuler l’envoi : remboursement annoncé', (tester) async {
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      await tap(tester, find.text('Annuler l’envoi'));
      await tap(tester, find.widgetWithText(FilledButton, 'Annuler l’envoi'));
      expect(trips.cancelled, ['trip-parcel']);
      expect(find.textContaining('Remboursement de 121,86'), findsOneWidget);
    });

    testWidgets('photo du colis ajoutée', (tester) async {
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      await tap(tester, find.text('Ajouter une photo du colis'));
      expect(picker.sources, [DocumentSource.camera]);
      expect(parcels.calls, ['photo']);
    });

    testWidgets('erreur serveur : message et nouvel essai', (tester) async {
      parcels.nextError = const ApiException('Colis introuvable.');
      final failing = _FailingParcelService();
      parcels = failing;
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      expect(find.text('Colis introuvable.'), findsOneWidget);
      expect(find.text('Réessayer'), findsOneWidget);
    });

    testWidgets('accessibilité du suivi', (tester) async {
      await pump(tester, initial: AppRoutes.parcelTrackingFor(parcelId));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });
  });
}

class _FailingParcelService extends FakeParcelService {
  @override
  Future<ParcelDetail> detail(String parcelId) async => throw const ApiException('Colis introuvable.');
}
