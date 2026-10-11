import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/models/trip_detail.dart';
import 'package:xlcab_app/router.dart';
import 'package:xlcab_app/screens/booking/confirmation_screen.dart';
import 'package:xlcab_app/screens/booking/payment_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_app/services/payment_service.dart';
import 'package:xlcab_core/services/trip_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';

// Écrans 7 (Paiement) et 8 (Confirmation). Serveur et feuille Stripe
// remplacés par des doubles.

late FakePaymentService payments;
late FakePresenter presenter;
late FakeTripService trips;
final List<Uri> opened = [];

final draft = BookingDraft(
  request: PassengerQuoteRequest(
    origin: paris,
    destination: rouen,
    shuttleType: ShuttleType.bleue,
    departure: DateTime(2026, 10, 12, 14, 30),
    seats: 2,
    childSeats: 0,
    wifi: false,
    extraLuggage: false,
    withParcel: false,
  ),
  quote: baseQuote, // 121,86 €
);

TripDetail detailFor(TripStatus status) => TripDetail(
      id: 'trip-paid',
      status: status,
      shuttleType: ShuttleType.bleue,
      originAddress: paris.address,
      destinationAddress: rouen.address,
      scheduledAt: DateTime(2026, 10, 12, 14, 30),
      seats: 2,
      qrCode: '9b2e0000-0000-4000-8000-0000000000aa',
      totalCents: 12186,
    );

Future<void> pump(WidgetTester tester, {String initial = '/pay'}) async {
  tester.view.physicalSize = const Size(1080, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/pay', builder: (_, __) => PaymentScreen(draft: draft)),
    GoRoute(path: AppRoutes.confirmation, builder: (_, s) => ConfirmationScreen(tripId: s.pathParameters['tripId']!)),
    GoRoute(path: AppRoutes.home, builder: (_, __) => const Scaffold(body: Text('ACCUEIL'))),
    GoRoute(path: AppRoutes.tracking, builder: (_, s) => Scaffold(body: Text('SUIVI ${s.pathParameters['tripId']}'))),
  ]);

  await tester.pumpWidget(ProviderScope(
    overrides: [
      paymentServiceProvider.overrideWithValue(payments),
      paymentSheetPresenterProvider.overrideWithValue(presenter),
      tripServiceProvider.overrideWithValue(trips),
      externalLinkOpenerProvider.overrideWithValue((uri) async {
        opened.add(uri);
        return true;
      }),
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

Future<void> tapPay(WidgetTester tester) async {
  await tester.tap(find.textContaining('Payer'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    payments = FakePaymentService();
    presenter = FakePresenter();
    trips = FakeTripService()..tripDetail = detailFor(TripStatus.noDriver);
  });

  group('écran 7 — paiement', () {
    testWidgets('récapitulatif et conditions d’annulation affichés avant de payer', (tester) async {
      await pump(tester);
      expect(find.text(paris.address), findsOneWidget);
      expect(find.textContaining('Payer 121,86'), findsOneWidget);
      expect(find.textContaining('Gratuite jusqu’à 24 h avant'), findsOneWidget);
      expect(find.textContaining('XLCAB ne voit jamais votre numéro de carte'), findsOneWidget);
    });

    testWidgets('paiement réussi : réservation, feuille Stripe, confirmation, écran 8', (tester) async {
      trips.tripDetail = detailFor(TripStatus.searching);
      await pump(tester);
      await tapPay(tester);

      expect(payments.calls, ['book', 'confirm:trip-paid']);
      expect(presenter.presented.single.paymentIntentClientSecret, 'pi_1_secret_x');
      expect(find.text('Réservation confirmée'), findsOneWidget);
      expect(find.bySemanticsLabel('QR code d’embarquement, à présenter au chauffeur'), findsOneWidget);
    });

    testWidgets('feuille fermée puis nouvel essai : la même réservation est reprise (pas de doublon)', (tester) async {
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.canceled));
      await pump(tester);
      await tapPay(tester);
      expect(find.textContaining('Paiement annulé'), findsOneWidget);

      await tapPay(tester);
      expect(payments.calls, ['book', 'resume:trip-paid', 'confirm:trip-paid']);
    });

    testWidgets('paiement refusé : message de Stripe affiché', (tester) async {
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.failed, 'Votre carte a été refusée.'));
      await pump(tester);
      await tapPay(tester);
      expect(find.text('Votre carte a été refusée.'), findsOneWidget);
      expect(payments.calls, ['book']);
    });

    testWidgets('prix recalculé différent : nouveau montant affiché, seconde confirmation exigée', (tester) async {
      payments.amountCents = 12500;
      await pump(tester);
      await tapPay(tester);

      expect(presenter.presented, isEmpty, reason: 'aucun débit d’un montant non affiché');
      expect(find.textContaining('Le prix a été mis à jour : 125,00'), findsOneWidget);
      expect(find.textContaining('Payer 125,00'), findsOneWidget);

      await tapPay(tester);
      expect(presenter.presented.single.amountCents, 12500);
    });

    testWidgets('refus du serveur (ex. départ désormais trop proche) : message affiché', (tester) async {
      payments.error = const ApiException('Réservation au moins 2 h à l’avance');
      await pump(tester);
      await tapPay(tester);
      expect(find.text('Réservation au moins 2 h à l’avance'), findsOneWidget);
      expect(presenter.presented, isEmpty);
    });

    testWidgets('Stripe non configuré : message clair, aucune réservation créée', (tester) async {
      presenter.available = false;
      await pump(tester);
      await tapPay(tester);
      expect(find.textContaining('Paiement momentanément indisponible'), findsOneWidget);
      expect(payments.calls, isEmpty);
    });

    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      await pump(tester);
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });
  });

  group('écran 8 — confirmation', () {
    testWidgets('chauffeur attribué : bouton de suivi', (tester) async {
      trips.tripDetail = detailFor(TripStatus.accepted);
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      await tester.tap(find.text('Suivre ma course'));
      await tester.pumpAndSettle();
      expect(find.text('SUIVI trip-paid'), findsOneWidget);
    });

    testWidgets('annulation : confirmation, puis montant remboursé et frais annoncés', (tester) async {
      trips
        ..tripDetail = detailFor(TripStatus.accepted)
        ..cancelResult = const CancelResult(feeCents: 6093, refundedCents: 6093, refundPending: false);
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));

      await tester.tap(find.widgetWithText(OutlinedButton, 'Annuler la réservation'));
      await tester.pumpAndSettle();
      expect(find.text('Annuler la réservation ?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Annuler la réservation'));
      await tester.pumpAndSettle();

      expect(trips.cancelled, ['trip-paid']);
      expect(find.textContaining('Remboursement de 60,93'), findsOneWidget);
      expect(find.textContaining('frais : 60,93'), findsOneWidget);
    });

    testWidgets('course lointaine : heure d’attribution du chauffeur annoncée', (tester) async {
      final base = detailFor(TripStatus.pending);
      trips.tripDetail = TripDetail(
        id: base.id,
        status: base.status,
        shuttleType: base.shuttleType,
        originAddress: base.originAddress,
        destinationAddress: base.destinationAddress,
        scheduledAt: DateTime(2030, 10, 12, 14, 30),
        seats: base.seats,
        qrCode: base.qrCode,
        totalCents: base.totalCents,
        dispatchAt: DateTime(2030, 10, 12, 11, 30),
      );
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      expect(find.textContaining('Votre chauffeur sera attribué à partir du'), findsOneWidget);
      expect(find.textContaining('11:30'), findsOneWidget);
    });

    testWidgets('course terminée : facture téléchargeable (lien signé ouvert dans le navigateur)', (tester) async {
      final base = detailFor(TripStatus.completed);
      trips.tripDetail = TripDetail(
        id: base.id,
        status: base.status,
        shuttleType: base.shuttleType,
        originAddress: base.originAddress,
        destinationAddress: base.destinationAddress,
        scheduledAt: base.scheduledAt,
        seats: base.seats,
        qrCode: base.qrCode,
        totalCents: base.totalCents,
        invoiceId: 'inv-1',
        invoiceNumber: 'FA-2026-000001',
      );
      opened.clear();
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      expect(find.text('Course terminée'), findsOneWidget);
      await tester.tap(find.text('Télécharger la facture FA-2026-000001'));
      await tester.pumpAndSettle();
      expect(trips.invoiceLinks, ['inv-1']);
      expect(opened.single.path, '/api/v1/invoices/inv-1/file');
    });

    testWidgets('« Garder » n’annule rien', (tester) async {
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Annuler la réservation'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Garder'));
      await tester.pumpAndSettle();
      expect(trips.cancelled, isEmpty);
    });

    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });
  });
}
