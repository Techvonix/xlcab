import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_passenger/providers/home_provider.dart';
import 'package:xlcab_passenger/router.dart';
import 'package:xlcab_passenger/screens/home/home_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

// Tests de l'écran 4 (Accueil passager). Les données viennent d'un
// override de recentTripsProvider : ni réseau ni backend nécessaires.

final _activeTrip = TripSummary(
  id: 'trip-1',
  shuttleType: ShuttleType.bleue,
  originAddress: 'Gare de Lyon, Paris',
  destinationAddress: 'Gare de Rouen',
  scheduledAt: DateTime(2026, 10, 1, 14, 30),
  status: TripStatus.accepted,
  totalPriceCents: 12150,
);

final _completedTrip = TripSummary(
  id: 'trip-2',
  shuttleType: ShuttleType.rose,
  originAddress: 'Lille Europe',
  destinationAddress: 'Arras',
  scheduledAt: DateTime(2026, 9, 12, 8, 0),
  status: TripStatus.completed,
  totalPriceCents: 9000,
);

/// Monte l'écran d'accueil dans un routeur de test. Les autres écrans
/// sont remplacés par des pages témoins pour vérifier la navigation.
Future<void> pumpHome(
  WidgetTester tester, {
  required Future<List<TripSummary>> Function() loadTrips,
  bool settle = true,
}) async {
  // Téléphone de 360 × 1400 points logiques.
  tester.view.physicalSize = const Size(1080, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: AppRoutes.home,
    routes: [
      GoRoute(path: AppRoutes.home, builder: (_, __) => const HomeScreen()),
      GoRoute(
        path: AppRoutes.passengerBooking,
        builder: (_, state) =>
            Scaffold(body: Text('ÉCRAN RÉSERVATION ${state.uri.queryParameters['type'] ?? ''}')),
      ),
      GoRoute(path: AppRoutes.shuttleSelection, builder: (_, __) => const Scaffold(body: Text('ÉCRAN CHOIX NAVETTE'))),
      GoRoute(path: AppRoutes.parcelCreation, builder: (_, __) => const Scaffold(body: Text('ÉCRAN COLIS'))),
      GoRoute(path: AppRoutes.profile, builder: (_, __) => const Scaffold(body: Text('ÉCRAN PROFIL'))),
      GoRoute(path: AppRoutes.driverOnboarding, builder: (_, __) => const Scaffold(body: Text('ÉCRAN CANDIDATURE'))),
      GoRoute(
        path: AppRoutes.tracking,
        builder: (_, state) => Scaffold(body: Text('ÉCRAN SUIVI ${state.pathParameters['tripId']}')),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [recentTripsProvider.overrideWith((ref) => loadTrips())],
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
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  // ensureVisible fait défiler jusqu'à ce que le widget soit réellement à l'écran (scrollUntilVisible
  // s'arrête dès qu'il existe dans l'arbre, même sous le bord : le toucher tombait alors dans le vide).
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  group('structure (Partie 7, écran 4)', () {
    testWidgets('affiche le header, les deux actions et les 4 navettes', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);

      expect(find.text('Bonjour'), findsOneWidget);
      expect(find.byTooltip('Mon profil'), findsOneWidget);
      expect(find.byTooltip('Notifications'), findsOneWidget);
      expect(find.text('Réserver un trajet'), findsOneWidget);
      expect(find.text('Envoyer un colis'), findsOneWidget);
      for (final type in ShuttleType.values) {
        expect(find.text(type.label), findsOneWidget);
      }
      // La barre de navigation appartient à la coque à onglets (PassengerShell), testée à part.
      expect(find.text('Accueil'), findsNothing);
    });

    testWidgets('le bouton Accessibilité est visible et ouvre son panneau', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);

      await tester.tap(find.byTooltip('Accessibilité'));
      await tester.pumpAndSettle();

      expect(find.text('Réserver une Navette Accessibilité'), findsOneWidget);
      expect(find.text('Sombre'), findsOneWidget);
    });

    testWidgets("n'affiche pas de badge Disponible sans donnée de disponibilité", (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      expect(find.text('Disponible'), findsNothing);
    });
  });

  group('navigation', () {
    testWidgets('"Réserver un trajet" ouvre le choix de la navette (écran 5)', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      await tester.tap(find.text('Réserver un trajet'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN CHOIX NAVETTE'), findsOneWidget);
    });

    testWidgets('"Envoyer un colis" ouvre la création de colis', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      await tester.tap(find.text('Envoyer un colis'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN COLIS'), findsOneWidget);
    });

    testWidgets('"Devenir chauffeur XLCAB" renvoie vers l’application XLCAB Driver', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      await scrollTo(tester, find.text('Devenir chauffeur XLCAB'));
      await tester.tap(find.text('Devenir chauffeur XLCAB'));
      await tester.pumpAndSettle();
      expect(find.text('Application XLCAB Driver'), findsOneWidget);
    });

    testWidgets('une carte navette transmet son type à la réservation', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      final card = find.text('Navette Accessibilité');
      await tester.ensureVisible(card); // 4e carte, hors écran à droite
      await tester.pumpAndSettle();
      await tester.tap(card);
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN RÉSERVATION accessibility'), findsOneWidget);
    });
  });

  group('derniers trajets', () {
    testWidgets('état de chargement', (tester) async {
      final never = Completer<List<TripSummary>>();
      await pumpHome(tester, loadTrips: () => never.future, settle: false);
      expect(find.bySemanticsLabel('Chargement de vos trajets'), findsOneWidget);
    });

    testWidgets('liste vide', (tester) async {
      await pumpHome(tester, loadTrips: () async => []);
      await scrollTo(tester, find.text("Aucun trajet pour l'instant"));
      expect(find.text("Aucun trajet pour l'instant"), findsOneWidget);
    });

    testWidgets('affiche adresses, statut en toutes lettres et prix', (tester) async {
      await pumpHome(tester, loadTrips: () async => [_activeTrip, _completedTrip]);
      await scrollTo(tester, find.text('Lille Europe'));

      expect(find.text('Gare de Lyon, Paris'), findsOneWidget);
      expect(find.text('→ Gare de Rouen'), findsOneWidget);
      // Statut porté par du texte, pas seulement par une couleur.
      expect(find.text('Chauffeur en route'), findsOneWidget);
      expect(find.text('Terminé'), findsOneWidget);
      expect(find.textContaining('121,50'), findsOneWidget);
    });

    testWidgets('un trajet avec chauffeur attribué ouvre le suivi temps réel', (tester) async {
      await pumpHome(tester, loadTrips: () async => [_activeTrip]);
      await scrollTo(tester, find.text('Gare de Lyon, Paris'));
      await tester.tap(find.text('Gare de Lyon, Paris'));
      await tester.pumpAndSettle();
      expect(find.text('ÉCRAN SUIVI trip-1'), findsOneWidget);
    });

    testWidgets("un trajet terminé n'ouvre pas le suivi", (tester) async {
      await pumpHome(tester, loadTrips: () async => [_completedTrip]);
      await scrollTo(tester, find.text('Lille Europe'));
      await tester.tap(find.text('Lille Europe'));
      await tester.pumpAndSettle();
      expect(find.textContaining('ÉCRAN SUIVI'), findsNothing);
    });

    testWidgets('erreur réseau : message clair et "Réessayer" relance le chargement', (tester) async {
      var calls = 0;
      await pumpHome(tester, loadTrips: () async {
        calls++;
        if (calls == 1) throw const ApiException('Pas de connexion internet. Vérifiez votre réseau.');
        return [];
      });

      await scrollTo(tester, find.text('Réessayer'));
      expect(find.text('Pas de connexion internet. Vérifiez votre réseau.'), findsOneWidget);

      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.text("Aucun trajet pour l'instant"), findsOneWidget);
    });
  });

  group('accessibilité (Partie 5)', () {
    testWidgets('chaque navette est annoncée par son nom et son public', (tester) async {
      final semantics = tester.ensureSemantics();
      await pumpHome(tester, loadTrips: () async => []);

      expect(find.bySemanticsLabel('Navette Rose, Femmes & familles'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Navette Accessibilité, Personnes à mobilité réduite'),
        findsOneWidget,
      );
      semantics.dispose();
    });

    // Vérificateurs d'accessibilité intégrés à Flutter : ils mesurent la
    // vraie zone tactile (y compris la marge invisible ajoutée autour des
    // IconButton), pour TOUS les éléments interactifs de l'écran.
    testWidgets('zones tactiles ≥ 44 × 44 (iOS) et ≥ 48 × 48 (Android)', (tester) async {
      await pumpHome(tester, loadTrips: () async => [_activeTrip]);
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    });

    testWidgets('tout élément interactif a un libellé pour le lecteur d’écran', (tester) async {
      await pumpHome(tester, loadTrips: () async => [_activeTrip]);
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    });

    // Le bouton primaire utilise le cyan profond (#0E7490) en thème clair : avec
    // le cyan vif #22D3EE sous un texte blanc, ce test échouerait.
    testWidgets('contraste du texte ≥ WCAG AA', (tester) async {
      await pumpHome(tester, loadTrips: () async => [_activeTrip]);
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });

    testWidgets('texte agrandi à 200 % : aucun débordement', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      await pumpHome(tester, loadTrips: () async => [_activeTrip, _completedTrip]);
      await scrollTo(tester, find.text('Lille Europe'));

      // Un débordement de RenderFlex est remonté comme exception de test.
      expect(tester.takeException(), isNull);
    });
  });
}
