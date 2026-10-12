import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_driver/providers/driver_mode_provider.dart';
import 'package:xlcab_driver/screens/driver/driver_mode_screen.dart';
import 'package:xlcab_driver/screens/driver/widgets/offer_card.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_driver/services/driver_channel.dart';
import 'package:xlcab_core/services/document_picker.dart';
import 'package:xlcab_driver/services/driver_device.dart';
import 'package:xlcab_driver/services/operator_service.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';
import '../support/operator_fakes.dart';

// Écran 15 — mode chauffeur. Serveur, WebSocket, GPS, caméra et applis
// externes remplacés par des doubles pilotés par le test.

late FakeDriverModeService service;
late FakePositionSource gps;
late FakeQrScanner scanner;
late FakeLauncher launcher;
late FakeParcelService parcels;
late FakeDocumentPicker picker;
FakeOperatorService operators = FakeOperatorService();
final List<FakeDriverChannel> channels = [];

FakeDriverChannel get channel => channels.last;

const here = DevicePosition(lat: 48.84, lng: 2.37);

Future<void> pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 3000);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(ProviderScope(
    overrides: [
      driverModeProvider.overrideWith((ref) => DriverModeController(service, () {
            final c = FakeDriverChannel();
            channels.add(c);
            return c;
          }, gps, parcels)),
      documentPickerProvider.overrideWithValue(picker),
      qrScannerProvider.overrideWithValue(scanner),
      driverLauncherProvider.overrideWithValue(launcher),
      // Section opérateur du mode chauffeur : aucun appel réseau réel.
      operatorServiceProvider.overrideWithValue(operators),
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
      home: const DriverModeScreen(),
    ),
  ));
  await settle(tester);
}

/// pumpAndSettle est inutilisable quand le compte à rebours de l'offre
/// tourne (il redessine en continu) : on avance l'horloge par paliers.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Démonte l'écran : la session (GPS, timers, WebSocket) est arrêtée.
Future<void> finish(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
}

Future<void> goOnline(WidgetTester tester) async {
  await tester.tap(find.byType(Switch));
  await settle(tester);
}

Future<void> tapText(WidgetTester tester, String text) async {
  final target = find.text(text).last;
  // ensureVisible ne suffit pas toujours (bas de liste) : on fait défiler la
  // liste principale jusqu'à ce que l'élément soit réellement touchable.
  if (find.byType(AlertDialog).evaluate().isEmpty && target.hitTestable().evaluate().isEmpty) {
    await tester.dragUntilVisible(target.hitTestable(), find.byType(ListView).first, const Offset(0, -200));
  }
  await tester.tap(target);
  await settle(tester);
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    service = FakeDriverModeService();
    gps = FakePositionSource();
    scanner = FakeQrScanner();
    launcher = FakeLauncher();
    parcels = FakeParcelService();
    picker = FakeDocumentPicker();
    operators = FakeOperatorService();
    channels.clear();
  });

  group('disponibilité', () {
    testWidgets('chauffeur jamais noté : « Pas encore de note », jamais une note par défaut', (tester) async {
      service.driverStatus = const DriverStatus(online: false, approved: true, totalTrips: 41);
      await pump(tester);
      expect(find.textContaining('Pas encore de note · 41 courses'), findsOneWidget);
      expect(find.textContaining('Note 5'), findsNothing);
    });

    testWidgets('hors ligne au lancement : note, aucune connexion temps réel (les revenus sont dans leur onglet)', (tester) async {
      await pump(tester);
      expect(find.text('Hors ligne'), findsOneWidget);
      expect(find.textContaining('Note 4,9 · 41 courses'), findsOneWidget);
      expect(channels, isEmpty);
      await finish(tester);
    });

    testWidgets('compte en attente de validation : pas de bouton en ligne', (tester) async {
      service.driverStatus = const DriverStatus(online: false, approved: false);
      await pump(tester);
      expect(find.textContaining('en cours de validation'), findsOneWidget);
      expect(find.byType(Switch), findsNothing);
      await finish(tester);
    });

    testWidgets('passage en ligne : serveur prévenu, WebSocket ouvert, position envoyée aussitôt puis toutes les 10 s', (tester) async {
      await pump(tester);
      await goOnline(tester);

      expect(service.calls, ['online:true']);
      expect(find.text('En ligne'), findsOneWidget);
      expect(find.textContaining('En attente de missions'), findsOneWidget);

      gps.positions.add(here);
      await tester.pump();
      expect(channel.locations, hasLength(1), reason: 'première position sans attendre');

      // Puis une toutes les 10 s : 3 envois de plus en 30 s.
      await tester.pump(const Duration(seconds: 30));
      expect(channel.locations, hasLength(4));
      await finish(tester);
    });

    testWidgets('localisation refusée : reste hors ligne, explication affichée', (tester) async {
      gps.access = LocationAccess.denied;
      await pump(tester);
      await goOnline(tester);
      expect(service.calls, isEmpty);
      expect(find.text('Hors ligne'), findsOneWidget);
      expect(find.textContaining('Autorisez l’accès à votre position'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('refus du serveur (document expiré) : raison affichée, reste hors ligne', (tester) async {
      service.nextError = const ApiException('Assurance ou contrôle technique expiré : envoyez le nouveau document');
      await pump(tester);
      await goOnline(tester);
      expect(find.textContaining('Assurance ou contrôle technique expiré'), findsOneWidget);
      expect(find.text('Hors ligne'), findsOneWidget);
      expect(channels, isEmpty);
      await finish(tester);
    });

    testWidgets('déjà en ligne au lancement (app relancée) : la session reprend seule', (tester) async {
      service.driverStatus = const DriverStatus(online: true, approved: true);
      await pump(tester);
      expect(channels, hasLength(1));
      expect(find.text('En ligne'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('passage hors ligne : serveur prévenu, GPS et WebSocket coupés', (tester) async {
      await pump(tester);
      await goOnline(tester);
      await tester.tap(find.byType(Switch));
      await settle(tester);

      expect(service.calls, ['online:true', 'online:false']);
      expect(channel.disposed, isTrue);
      gps.positions.add(here);
      await tester.pump(const Duration(seconds: 20));
      expect(channel.locations, isEmpty);
      await finish(tester);
    });
  });

  group('offres de mission', () {
    Future<void> receiveOffer(WidgetTester tester, [MissionOffer? offer]) async {
      await pump(tester);
      await goOnline(tester);
      channel.push(OfferReceived(offer ?? offerFor()));
      await settle(tester);
    }

    testWidgets('offre reçue : trajet, prise en charge, prix et compte à rebours ; aucune identité du passager', (tester) async {
      await receiveOffer(tester);
      expect(find.text('Nouvelle mission'), findsOneWidget);
      expect(find.text(paris.address), findsOneWidget);
      expect(find.textContaining('Prise en charge à 2,4 km'), findsOneWidget);
      expect(find.textContaining('3 passagers'), findsOneWidget);
      expect(find.descendant(of: find.byType(OfferCard), matching: find.textContaining('121,86')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r'^\d+ secondes pour répondre$')), findsOneWidget);
      await finish(tester);
    });

    testWidgets('accepter : réponse au serveur, missions rechargées, confirmation', (tester) async {
      await receiveOffer(tester);
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);

      await tapText(tester, 'Accepter');

      expect(service.calls.last, 'accept:$offeredTripId');
      expect(find.text('Nouvelle mission'), findsNothing);
      expect(find.text('Mission acceptée.'), findsOneWidget);
      expect(find.text('Prochaine mission'), findsOneWidget);
      expect(channel.watched, {missionTripId}, reason: 'statut de la course suivi (annulation passager)');
      await finish(tester);
    });

    testWidgets('acceptation trop tardive : message du serveur, offre retirée', (tester) async {
      await receiveOffer(tester);
      service.nextError = const ApiException('Offre expirée ou inexistante');
      await tapText(tester, 'Accepter');
      expect(find.text('Offre expirée ou inexistante'), findsOneWidget);
      expect(find.text('Nouvelle mission'), findsNothing);
      await finish(tester);
    });

    testWidgets('refuser : réponse au serveur, offre retirée', (tester) async {
      await receiveOffer(tester);
      await tapText(tester, 'Refuser');
      expect(service.calls.last, 'refuse:$offeredTripId');
      expect(find.text('Nouvelle mission'), findsNothing);
      await finish(tester);
    });

    testWidgets('sans réponse : l’offre disparaît à l’échéance des 30 s', (tester) async {
      await receiveOffer(tester);
      await tester.pump(const Duration(seconds: 31));
      await settle(tester);
      expect(find.text('Nouvelle mission'), findsNothing);
      expect(service.calls.where((c) => c.startsWith('accept')), isEmpty);
      await finish(tester);
    });

    testWidgets('expiration annoncée par le serveur : offre retirée et expliquée', (tester) async {
      await receiveOffer(tester);
      channel.push(const OfferExpired(offeredTripId));
      await settle(tester);
      expect(find.text('Nouvelle mission'), findsNothing);
      expect(find.textContaining('proposée à un autre chauffeur'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('offre en cours retrouvée au lancement (app revenue au premier plan)', (tester) async {
      service.driverStatus = DriverStatus(online: true, approved: true, offer: offerFor(left: const Duration(seconds: 12)));
      await pump(tester);
      expect(find.text('Nouvelle mission'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('accessibilité de l’offre : zones tactiles, libellés, contraste', (tester) async {
      await receiveOffer(tester);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await finish(tester);
    });
  });

  group('mission attribuée', () {
    testWidgets('scan du QR du passager puis démarrage', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);

      await tapText(tester, 'Scanner le QR et démarrer');

      expect(scanner.scans, 1);
      expect(service.calls, ['start:$missionTripId:$boardingQr']);
      expect(find.text('Passager embarqué, course démarrée.'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('QR étranger (pas un QR XLCAB) : refusé sans appel au serveur', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      scanner.next = 'https://exemple.com/promo';
      await pump(tester);
      await tapText(tester, 'Scanner le QR et démarrer');
      expect(service.calls, isEmpty);
      expect(find.textContaining('QR code non reconnu'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('démarrage sans scan : confirmation demandée', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);
      await tapText(tester, 'Démarrer sans scanner');
      expect(find.text('Démarrer sans scanner ?'), findsOneWidget);
      await tapText(tester, 'Démarrer');
      expect(service.calls, ['start:$missionTripId:-']);
      await finish(tester);
    });

    testWidgets('course dans 3 jours : pas de démarrage possible, téléphone non fourni', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(scheduledAt: DateTime.now().add(const Duration(days: 3)), phone: null)],
        recent: const [],
      );
      await pump(tester);
      expect(find.text('Scanner le QR et démarrer'), findsNothing);
      expect(find.textContaining('Démarrage possible 1 h avant'), findsOneWidget);
      expect(find.text('Appeler'), findsNothing);
      await finish(tester);
    });

    testWidgets('itinéraire vers le départ, appel du passager', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);
      await tapText(tester, 'Vers le départ');
      expect(launcher.navigations.single.address, paris.address);
      await tapText(tester, 'Appeler');
      expect(launcher.calls, ['+33611111111']);
      await finish(tester);
    });

    testWidgets('en course : itinéraire vers l’arrivée, fin de course confirmée, position toutes les 3 s', (tester) async {
      service
        ..driverStatus = const DriverStatus(online: true, approved: true)
        ..missionList = MissionList(upcoming: [missionFor(status: TripStatus.started)], recent: const []);
      await pump(tester);
      gps.positions.add(here);
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      expect(channel.locations, hasLength(2), reason: 'cadence 3 s en course');

      await tapText(tester, 'Vers l’arrivée');
      expect(launcher.navigations.single.address, rouen.address);

      await tapText(tester, 'Terminer la course');
      await tapText(tester, 'Terminer');
      expect(service.calls, ['complete:$missionTripId']);
      await finish(tester);
    });

    testWidgets('désistement : confirmation puis envoi', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);
      await tapText(tester, 'Me désister de cette course');
      await tapText(tester, 'Me désister');
      expect(service.calls, ['withdraw:$missionTripId']);
      await finish(tester);
    });

    testWidgets('course annulée par le passager : prévenu, liste rechargée', (tester) async {
      service
        ..driverStatus = const DriverStatus(online: true, approved: true)
        ..missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);
      service.missionList = const MissionList(upcoming: [], recent: []);

      channel.push(const MissionStatusChanged(missionTripId, 'cancelled'));
      await settle(tester);

      expect(find.text('Une de vos courses a été annulée.'), findsOneWidget);
      expect(find.text('Prochaine mission'), findsNothing);
      await finish(tester);
    });

    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor()], recent: const []);
      await pump(tester);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await finish(tester);
    });
  });

  group('colis (checklist)', () {
    testWidgets('colis à l’aller : scan à l’enlèvement, puis remise avec code + photo', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor(parcels: [taskFor()])], recent: const []);
      scanner.next = parcelQr;
      await pump(tester);

      expect(find.textContaining('Colis (0/1 traité)'), findsOneWidget);
      expect(find.textContaining('FRAGILE'), findsOneWidget);
      await tapText(tester, 'Scanner le colis');
      expect(parcels.calls, ['pickup:$parcelId:$parcelQr']);
      expect(find.text('Colis à bord.'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('remise : code du destinataire puis photo obligatoire', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(status: TripStatus.started, parcels: [taskFor(status: ParcelStatus.inTransit)])],
        recent: const [],
      );
      await pump(tester);
      await tapText(tester, 'Remettre le colis');
      final confirm = find.widgetWithText(FilledButton, 'Photographier et valider');
      expect(tester.widget<FilledButton>(confirm).onPressed, isNull, reason: 'code à 4 chiffres requis');
      await tester.enterText(find.widgetWithText(TextField, 'Code de remise'), '4821');
      await tester.pump();
      await tapText(tester, 'Photographier et valider');

      expect(picker.sources, [DocumentSource.camera]);
      expect(parcels.calls, ['deliver:$parcelId:4821']);
      expect(find.text('Colis remis. Merci !'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('code erroné : message du serveur affiché', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(status: TripStatus.started, parcels: [taskFor(status: ParcelStatus.inTransit)])],
        recent: const [],
      );
      parcels.nextError = const ApiException('Code de remise incorrect (4 essai(s) restant(s))');
      await pump(tester);
      await tapText(tester, 'Remettre le colis');
      await tester.enterText(find.widgetWithText(TextField, 'Code de remise'), '0000');
      await tester.pump();
      await tapText(tester, 'Photographier et valider');
      expect(find.textContaining('4 essai(s) restant(s)'), findsOneWidget);
      await finish(tester);
    });

    testWidgets('signaler un problème : motif choisi puis envoyé', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(status: TripStatus.started, parcels: [taskFor(status: ParcelStatus.inTransit)])],
        recent: const [],
      );
      await pump(tester);
      await tapText(tester, 'Signaler un problème');
      await tapText(tester, 'Destinataire absent ou injoignable');
      await tapText(tester, 'Signaler');
      expect(parcels.calls, ['fail:$parcelId:Destinataire absent ou injoignable']);
      await finish(tester);
    });

    testWidgets('colis du retour annoncés pendant l’aller : le chauffeur sait qu’il ne rentrera pas à vide', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor(parcels: [taskFor(onReturnLeg: true)])], recent: const []);
      await pump(tester);
      expect(find.textContaining('1 colis à ramener au retour'), findsOneWidget);
      // Pas d'action sur ce colis tant que la course aller n'est pas terminée.
      expect(find.text('Scanner le colis'), findsNothing);
      await finish(tester);
    });

    testWidgets('étape retour : course aller terminée, colis à récupérer puis à ramener', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(status: TripStatus.completed, parcels: [taskFor(onReturnLeg: true)])],
        recent: const [],
      );
      scanner.next = parcelQr;
      await pump(tester);

      expect(find.text('Retour : colis à ramener'), findsOneWidget);
      expect(find.text('Terminer la course'), findsNothing);
      expect(find.text('Me désister de cette course'), findsNothing);
      await tapText(tester, 'Itinéraire du retour');
      expect(launcher.navigations.single.address, rouen.address, reason: 'enlèvement du colis retour, à l’arrivée de l’aller');
      await tapText(tester, 'Scanner le colis');
      expect(parcels.calls, ['pickup:$parcelId:$parcelQr']);
      await finish(tester);
    });

    testWidgets('navette colis dédiée : scan du colis puis démarrage', (tester) async {
      service.missionList = MissionList(
        upcoming: [missionFor(type: 'parcel', parcels: [taskFor()])],
        recent: const [],
      );
      scanner.next = parcelQr;
      await pump(tester);
      expect(find.text('Navette colis'), findsOneWidget);
      expect(find.text('Démarrer sans scanner'), findsNothing);
      await tapText(tester, 'Scanner le colis et démarrer');
      expect(parcels.calls, ['pickup:$parcelId:$parcelQr']);
      expect(service.calls, ['start:$missionTripId:-']);
      await finish(tester);
    });

    testWidgets('accessibilité de la checklist', (tester) async {
      service.missionList = MissionList(upcoming: [missionFor(parcels: [taskFor()])], recent: const []);
      await pump(tester);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await finish(tester);
    });
  });
}
