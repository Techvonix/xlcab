import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_app/models/shuttle.dart';
import 'package:xlcab_app/router.dart';
import 'package:xlcab_app/screens/booking/shuttle_selection_screen.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/services/booking_service.dart';
import 'package:xlcab_app/theme/app_theme.dart';
import 'package:xlcab_app/utils/formatters.dart';

// Écran 5 — choix de la navette : cartes, prix « à partir de », disponibilité.

const overview = ShuttleOverview(minTripKm: 60, currency: 'EUR', offers: [
  ShuttleOffer(type: ShuttleType.rose, fromCents: 7200, available: false),
  ShuttleOffer(type: ShuttleType.bleue, fromCents: 5400, available: true),
  ShuttleOffer(type: ShuttleType.orange, fromCents: 9000, available: false),
  ShuttleOffer(type: ShuttleType.accessibility, fromCents: 6000, available: false),
]);

Future<void> pump(WidgetTester tester, Future<ShuttleOverview> Function() load) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(initialLocation: AppRoutes.shuttleSelection, routes: [
    GoRoute(path: AppRoutes.shuttleSelection, builder: (_, __) => const ShuttleSelectionScreen()),
    GoRoute(
      path: AppRoutes.passengerBooking,
      builder: (_, s) => Scaffold(body: Text('RÉSERVATION ${s.uri.queryParameters['type']}')),
    ),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [shuttleOverviewProvider.overrideWith((ref) => load())],
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

void main() {
  setUpAll(() => initializeDateFormatting());

  testWidgets('quatre navettes : nom, public, prix à partir de, badge de disponibilité', (tester) async {
    await pump(tester, () async => overview);
    for (final type in ShuttleType.values) {
      expect(find.text(type.label), findsOneWidget);
      expect(find.text(type.audience), findsOneWidget);
    }
    expect(find.text('À partir de ${formatPrice(5400)}'), findsOneWidget);
    expect(find.text('À partir de ${formatPrice(9000)}'), findsOneWidget);
    expect(find.text('Disponible'), findsOneWidget);
    expect(find.text('Indisponible'), findsNWidgets(3));
    expect(find.text('Prix pour un trajet de 60 km, 1 passager, sans option.'), findsOneWidget);
    expect(find.textContaining('Vous pouvez réserver à l’avance'), findsOneWidget);
  });

  testWidgets('position non autorisée : prix affichés, aucun badge ni explication', (tester) async {
    await pump(tester, () async => ShuttleOverview(
          minTripKm: 60,
          currency: 'EUR',
          offers: [for (final o in overview.offers) ShuttleOffer(type: o.type, fromCents: o.fromCents)],
        ));
    expect(find.text('À partir de ${formatPrice(7200)}'), findsOneWidget);
    expect(find.text('Disponible'), findsNothing);
    expect(find.text('Indisponible'), findsNothing);
    expect(find.textContaining('Vous pouvez réserver à l’avance'), findsNothing);
  });

  testWidgets('choisir une navette ouvre la réservation avec cette navette', (tester) async {
    await pump(tester, () async => overview);
    await tester.tap(find.text('Navette Orange'));
    await tester.pumpAndSettle();
    expect(find.text('RÉSERVATION orange'), findsOneWidget);
  });

  testWidgets('erreur : message du serveur et « Réessayer »', (tester) async {
    await pump(tester, () async => throw const ApiException('Service momentanément indisponible. Réessayez plus tard.'));
    expect(find.text('Service momentanément indisponible. Réessayez plus tard.'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);
  });

  testWidgets('accessibilité (Partie 5) : cible tactile, libellé complet, contraste', (tester) async {
    final handle = tester.ensureSemantics();
    await pump(tester, () async => overview);
    expect(find.bySemanticsLabel('Navette Bleue, Suburbain mixte, disponible, à partir de ${formatPrice(5400)}'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    handle.dispose();
  });
}
