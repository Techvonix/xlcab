import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/payouts.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_driver/screens/operator/cancellations_screen.dart';
import 'package:xlcab_driver/screens/operator/my_lines_screen.dart';
import 'package:xlcab_driver/screens/operator/payouts_screen.dart';
import 'package:xlcab_driver/services/driver_device.dart';
import 'package:xlcab_driver/services/operator_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/operator_fakes.dart';

// Compte de versement et reversements (Stripe Connect). Serveur simulé ;
// l'ouverture du navigateur est remplacée par un enregistreur.

late FakeOperatorService operators;
late List<Uri> opened;
late bool opens;
late GoRouter router;

Future<void> pump(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1170, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('accueil'))),
      GoRoute(path: '/ecran', builder: (_, __) => screen),
      GoRoute(path: '/driver/:a', builder: (_, s) => Scaffold(body: Text('route ${s.uri.path}'))),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [
      operatorServiceProvider.overrideWithValue(operators),
      externalLinkOpenerProvider.overrideWithValue((url) async {
        opened.add(url);
        return opens;
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
  router.push('/ecran');
  await tester.pumpAndSettle();
}

Payout payout({String id = 'p1', int amount = 4500, int? gross, int withheld = 0, PayoutStatus status = PayoutStatus.paid}) => Payout(
      id: id,
      tripId: 't-$id',
      amountCents: amount,
      grossCents: gross ?? amount,
      withheldCents: withheld,
      status: status,
      createdAt: DateTime(2026, 10, 12, 7),
      scheduledAt: DateTime(2026, 10, 12, 5),
      originAddress: 'Porte Maillot, Paris',
      destinationAddress: 'Aéroport de Beauvais',
    );

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    operators = FakeOperatorService();
    opened = [];
    opens = true;
  });

  group('compte de versement', () {
    testWidgets('aucun compte : explication et ouverture des pages de Stripe dans le navigateur', (tester) async {
      await pump(tester, const PayoutsScreen());
      expect(find.text('Aucun compte de versement'), findsOneWidget);
      expect(find.textContaining('XLCAB n’y a pas accès'), findsOneWidget);
      // Non exigé tant que le paiement en ligne n'est pas activé : pas d'avertissement.
      expect(find.textContaining('vous ne pouvez ni ouvrir un départ'), findsNothing);

      await tester.tap(find.text('Ouvrir mon compte de versement'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['onboardingLink']);
      expect(opened.single.toString(), 'https://connect.stripe.test/setup/acct_1/1');
    });

    testWidgets('exigé et pas prêt : avertissement sur la mise en vente', (tester) async {
      operators.account = const PayoutAccount(required: true, state: PayoutAccountState.incomplete, requirementsDue: 2);
      await pump(tester, const PayoutsScreen());
      expect(find.text('Compte de versement à compléter'), findsOneWidget);
      expect(find.text('Stripe attend encore 2 informations.'), findsOneWidget);
      expect(find.textContaining('vous ne pouvez ni ouvrir un départ'), findsOneWidget);
      expect(find.text('Compléter mon dossier'), findsOneWidget);
    });

    testWidgets('vérification en cours puis validé : accès à l’espace Stripe', (tester) async {
      operators.account = const PayoutAccount(required: true, state: PayoutAccountState.pending);
      await pump(tester, const PayoutsScreen());
      expect(find.text('Vérification en cours'), findsOneWidget);

      // Retour dans l'appli après les pages de Stripe : l'état est relu.
      operators.account = const PayoutAccount(required: true, state: PayoutAccountState.ready);
      final reads = operators.accountReads;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(operators.accountReads, greaterThan(reads));
      expect(find.text('Compte de versement validé'), findsOneWidget);
      expect(find.textContaining('vous ne pouvez ni ouvrir un départ'), findsNothing);

      await tester.tap(find.text('Voir mon espace Stripe'));
      await tester.pumpAndSettle();
      expect(operators.calls, ['dashboardLink']);
      expect(opened.single.host, 'connect.stripe.test');
    });

    testWidgets('refus du serveur ou navigateur indisponible : message, rien ne plante', (tester) async {
      operators.linkError = const ApiException('Complétez d’abord votre profil opérateur');
      await pump(tester, const PayoutsScreen());
      await tester.tap(find.text('Ouvrir mon compte de versement'));
      await tester.pumpAndSettle();
      expect(find.text('Complétez d’abord votre profil opérateur'), findsOneWidget);
      expect(opened, isEmpty);

      operators.linkError = null;
      opens = false;
      await tester.tap(find.text('Ouvrir mon compte de versement'));
      await tester.pumpAndSettle();
      expect(find.text('Impossible d’ouvrir la page de Stripe. Réessayez.'), findsOneWidget);
    });
  });

  group('reversements', () {
    testWidgets('totaux et liste : versé, en attente du compte, retenu pour une pénalité', (tester) async {
      operators.account = const PayoutAccount(required: true, state: PayoutAccountState.ready);
      operators.summary = PayoutSummary(paidCents: 6400, pendingCents: 4500, withheldCents: 9800, items: [
        payout(id: 'a', amount: 6400, gross: 16200, withheld: 9800),
        payout(id: 'b', amount: 4500, status: PayoutStatus.blocked),
        payout(id: 'c', amount: 0, gross: 4500, withheld: 4500, status: PayoutStatus.withheld),
      ]);
      await pump(tester, const PayoutsScreen());

      expect(find.text('64,00 €'), findsNWidgets(2)); // total versé et ligne
      expect(find.text('98,00 €'), findsOneWidget); // total retenu
      expect(find.text('En attente de votre compte de versement'), findsOneWidget);
      expect(find.text('Retenu pour une pénalité'), findsOneWidget);
      expect(find.textContaining('Revenu 162,00 € · retenu 98,00 €'), findsOneWidget);
      expect(find.textContaining('Porte Maillot, Paris → Aéroport de Beauvais'), findsNWidgets(3));

      await tester.tap(find.text('Voir mes annulations et pénalités'));
      await tester.pumpAndSettle();
      expect(find.text('route /driver/cancellations'), findsOneWidget);
    });

    testWidgets('aucun reversement : message clair, pas de ligne « Retenu »', (tester) async {
      await pump(tester, const PayoutsScreen());
      expect(find.text('Aucun reversement pour le moment.'), findsOneWidget);
      expect(find.text('Retenu'), findsNothing);
      expect(find.text('Voir mes annulations et pénalités'), findsNothing);
    });

    testWidgets('accessibilité : contrastes, cibles tactiles et libellés', (tester) async {
      operators.account = const PayoutAccount(required: true, state: PayoutAccountState.incomplete, requirementsDue: 1);
      operators.summary = PayoutSummary(paidCents: 4500, pendingCents: 0, withheldCents: 0, items: [payout()]);
      await pump(tester, const PayoutsScreen());
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });
  });

  testWidgets('« Mes lignes » rappelle d’ouvrir le compte de versement quand il bloque la mise en vente', (tester) async {
    operators.account = const PayoutAccount(required: true, state: PayoutAccountState.none);
    await pump(tester, const MyLinesScreen());
    expect(find.textContaining('Ouvrez votre compte de versement pour mettre vos départs en vente'), findsOneWidget);
    await tester.tap(find.textContaining('Ouvrez votre compte de versement pour mettre vos départs en vente'));
    await tester.pumpAndSettle();
    expect(find.text('route /driver/payouts'), findsOneWidget);
  });

  testWidgets('« Mes lignes » : aucun rappel si le compte est prêt ou non exigé', (tester) async {
    operators.account = const PayoutAccount(required: true, state: PayoutAccountState.ready);
    await pump(tester, const MyLinesScreen());
    expect(find.textContaining('Ouvrez votre compte de versement'), findsNothing);
  });

  testWidgets('annulations : la part de la pénalité déjà retenue est affichée', (tester) async {
    operators.myCancellations = [
      DriverCancellation(
        id: 'c1', trigger: 'driver_cancel', minutesBefore: 300, status: CancellationStatus.counted, createdAt: DateTime(2026, 10, 1, 4),
        penalty: const DriverPenalty(id: 'p1', amountCents: 26000, status: PenaltyStatus.applied, contestUntil: null, collectedCents: 16200),
      ),
    ];
    await pump(tester, const CancellationsScreen());
    expect(find.text('Déjà retenu sur vos reversements : 162,00 €'), findsOneWidget);
  });
}
