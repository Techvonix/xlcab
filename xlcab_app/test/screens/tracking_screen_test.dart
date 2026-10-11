import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/tracking.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_app/screens/tracking/tracking_screen.dart';
import 'package:xlcab_app/screens/tracking/widgets/tracking_map.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/location_service.dart';
import 'package:xlcab_app/services/tracking_channel.dart';
import 'package:xlcab_core/services/trip_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';

// Tests de l'écran 9 (Suivi temps réel). Serveur, WebSocket, carte et
// localisation sont remplacés par des doubles de test.

late FakeTripService trips;
late FakeTrackingChannel channel;
late FakeLocationService location;
String? clipboard;

Future<void> pumpTracking(WidgetTester tester) async {
  // Téléphone de 360 × 2000 points : le panneau affiche tout son contenu.
  tester.view.physicalSize = const Size(1080, 6000);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  // Presse-papiers simulé (bouton "Partager").
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') clipboard = (call.arguments as Map)['text'] as String?;
    return null;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tripServiceProvider.overrideWithValue(trips),
        trackingChannelFactoryProvider.overrideWithValue(() => channel),
        locationServiceProvider.overrideWithValue(location),
        trackingMapBuilderProvider.overrideWithValue(
          (_, __, ___) => const ColoredBox(key: Key('fake-map'), color: Colors.grey),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const TrackingScreen(tripId: trackedTripId),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Pousse un événement temps réel puis laisse l'écran se mettre à jour.
Future<void> push(WidgetTester tester, TrackingEvent event) async {
  channel.push(event);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    trips = FakeTripService();
    channel = FakeTrackingChannel();
    location = FakeLocationService();
    clipboard = null;
  });

  group('contenu (Partie 7, écran 9)', () {
    testWidgets('carte plein écran, statut, chauffeur, véhicule et adresses', (tester) async {
      await pumpTracking(tester);

      expect(tester.getSize(find.byKey(const Key('fake-map'))), const Size(360, 2000));
      expect(find.text('En cours'), findsOneWidget);
      expect(find.text('Nadia'), findsOneWidget);
      expect(find.text('Renault Trafic · Gris'), findsOneWidget);
      expect(find.text('AB-123-CD'), findsOneWidget);
      expect(find.text('Dashcam'), findsOneWidget);
      expect(find.text(paris.address), findsOneWidget);
      expect(find.text(rouen.address), findsOneWidget);
    });

    testWidgets('ETA en minutes (chiffres tabulaires) dès la 1re position', (tester) async {
      await pumpTracking(tester);
      expect(find.textContaining('min'), findsNothing); // pas encore de position

      await push(tester, PositionEvent(LivePosition(lat: 49.15, lng: 1.73, speedKmh: 90, at: DateTime(2026))));

      expect(find.textContaining(RegExp(r'^≈ \d+ min$')), findsOneWidget);
      expect(find.text('avant l’arrivée à destination'), findsOneWidget);
    });

    testWidgets('chauffeur en route : ETA vers le point de prise en charge', (tester) async {
      trips.snapshot = snapshotFor(status: TripStatus.accepted);
      await pumpTracking(tester);
      await push(tester, PositionEvent(LivePosition(lat: 48.86, lng: 2.35, at: DateTime(2026))));
      expect(find.text('Chauffeur en route'), findsOneWidget);
      expect(find.text('avant l’arrivée du chauffeur'), findsOneWidget);
    });

    testWidgets('changement de statut reçu en direct', (tester) async {
      await pumpTracking(tester);
      await push(tester, const StatusEvent(TripStatus.completed));
      expect(find.text('Terminé'), findsOneWidget);
    });

    testWidgets('trajet introuvable : message clair', (tester) async {
      trips.error = const ApiException('Trajet introuvable.');
      await pumpTracking(tester);
      expect(find.text('Trajet introuvable.'), findsOneWidget);
    });
  });

  group('connexion', () {
    testWidgets('bandeau : connexion, puis rien en direct, puis mode dégradé', (tester) async {
      await pumpTracking(tester);
      expect(find.text('Connexion au suivi en direct…'), findsOneWidget);

      await push(tester, const ConnectionEvent(true));
      expect(find.textContaining('Connexion'), findsNothing);

      await push(tester, const ConnectionEvent(false));
      expect(find.text('Connexion perdue · mise à jour toutes les 10 s'), findsOneWidget);
    });

    testWidgets('mode dégradé : l’écran se met à jour toutes les 10 s', (tester) async {
      await pumpTracking(tester);
      await push(tester, const ConnectionEvent(false));
      final before = trips.calls;
      trips.snapshot = snapshotFor(status: TripStatus.completed);

      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();

      expect(trips.calls, before + 1);
      expect(find.text('Terminé'), findsOneWidget);
    });
  });

  group('actions', () {
    testWidgets('"Appeler" désactivé si le serveur ne fournit pas le numéro', (tester) async {
      trips.snapshot = snapshotFor(phone: null);
      await pumpTracking(tester);
      final button = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Appeler'));
      expect(button.onPressed, isNull);
    });

    testWidgets('"Message" : envoi et réception dans le chat', (tester) async {
      await pumpTracking(tester);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Message'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'J’arrive dans 2 min');
      await tester.tap(find.byTooltip('Envoyer'));
      await tester.pumpAndSettle();
      expect(channel.sentMessages, ['J’arrive dans 2 min']);

      await push(
        tester,
        MessageEvent(ChatMessage(fromId: 'driver-1', fromRole: 'driver', text: 'Je suis devant', at: DateTime(2026, 10, 1, 9, 5))),
      );
      expect(find.text('Je suis devant'), findsOneWidget);
    });

    testWidgets('"Partager" copie un résumé du trajet', (tester) async {
      await pumpTracking(tester);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Partager'));
      await tester.pumpAndSettle();

      expect(clipboard, contains(rouen.address));
      expect(clipboard, contains('AB-123-CD'));
      expect(find.textContaining('Infos du trajet copiées'), findsOneWidget);
    });
  });

  group('SOS', () {
    testWidgets('propose d’abord le 112, puis l’alerte XLCAB', (tester) async {
      await pumpTracking(tester);
      await tester.tap(find.bySemanticsLabel('SOS, alerte d’urgence'));
      await tester.pumpAndSettle();

      expect(find.text('Besoin d’aide ?'), findsOneWidget);
      expect(find.text('Appeler le 112'), findsOneWidget);
      expect(find.text('Alerter XLCAB'), findsOneWidget);
      expect(channel.sosSent, isEmpty, reason: 'rien n’est envoyé sans choix explicite');
    });

    testWidgets('alerte XLCAB envoyée avec la position de l’appareil', (tester) async {
      location.position = (lat: 49.0, lng: 1.9);
      await pumpTracking(tester);
      await tester.tap(find.bySemanticsLabel('SOS, alerte d’urgence'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alerter XLCAB'));
      await tester.pumpAndSettle();

      expect(channel.sosSent.single, (lat: 49.0, lng: 1.9));
      expect(find.text('Alerte envoyée à l’équipe XLCAB avec votre position.'), findsOneWidget);
    });

    testWidgets('alerte non transmise : invitation à appeler le 112', (tester) async {
      channel.sosAcknowledged = false;
      await pumpTracking(tester);
      await tester.tap(find.bySemanticsLabel('SOS, alerte d’urgence'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alerter XLCAB'));
      await tester.pumpAndSettle();

      expect(find.text('Alerte non transmise. Appelez le 112.'), findsOneWidget);
    });

    testWidgets('annuler n’envoie rien', (tester) async {
      await pumpTracking(tester);
      await tester.tap(find.bySemanticsLabel('SOS, alerte d’urgence'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Annuler'));
      await tester.pumpAndSettle();
      expect(channel.sosSent, isEmpty);
    });
  });

  group('accessibilité (Partie 5)', () {
    testWidgets('zones tactiles, libellés et contraste conformes', (tester) async {
      await pumpTracking(tester);
      await push(tester, PositionEvent(LivePosition(lat: 49.15, lng: 1.73, speedKmh: 90, at: DateTime(2026))));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });

    testWidgets('texte agrandi à 200 % : aucun débordement', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpTracking(tester);
      await push(tester, const ConnectionEvent(false));
      await push(tester, PositionEvent(LivePosition(lat: 49.15, lng: 1.73, speedKmh: 90, at: DateTime(2026))));
      expect(tester.takeException(), isNull);
    });
  });
}
