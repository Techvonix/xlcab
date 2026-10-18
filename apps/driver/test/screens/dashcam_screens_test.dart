import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_driver/screens/driver/dashcam_charter_screen.dart';
import 'package:xlcab_driver/services/dashcam_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/operator_fakes.dart';

// Caméra embarquée (CHARTE_CAMERA_EMBARQUEE.md) : charte à accepter, demandes de
// conservation de l'enregistrement après un incident. Serveur simulé.

late FakeDashcamService dashcam;

Future<void> pump(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(1080, 6000);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [dashcamServiceProvider.overrideWithValue(dashcam)],
    child: MaterialApp(
      theme: AppTheme.light,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: child),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));
  setUp(() => dashcam = FakeDashcamService());

  testWidgets('charte à lire puis accepter (version envoyée) ; une fois acceptée, la date s’affiche', (tester) async {
    dashcam.charterResult = const DashcamCharter(version: '2026-10-18', accepted: false);
    await pump(tester, const DashcamCharterScreen());
    expect(find.textContaining('reste dans la caméra du véhicule'), findsOneWidget);
    expect(find.textContaining('72 heures'), findsWidgets);

    await tester.tap(find.text('J’accepte la charte'));
    await tester.pumpAndSettle();
    expect(dashcam.calls, ['accept:2026-10-18']);
    expect(find.textContaining('Charte acceptée le'), findsOneWidget);
    expect(find.text('J’accepte la charte'), findsNothing);
  });

  testWidgets('mode chauffeur : charte manquante signalée ; demande de conservation confirmée', (tester) async {
    dashcam.charterResult = const DashcamCharter(version: '2026-10-18', accepted: false);
    dashcam.requests = [
      FootageRequest(incidentId: 'inc-1', requestedAt: DateTime(2026, 10, 18, 9), tripAt: DateTime(2026, 10, 17, 8), origin: 'Lyon', destination: 'Limoges'),
    ];
    await pump(tester, const DashcamNotices());
    expect(find.textContaining('Acceptez la charte caméra embarquée'), findsOneWidget);
    expect(find.text('Conservez l’enregistrement'), findsOneWidget);
    expect(find.textContaining('Lyon → Limoges'), findsOneWidget);

    await tester.tap(find.text('C’est noté, je l’ai conservé'));
    await tester.pumpAndSettle();
    expect(dashcam.calls, ['acknowledge:inc-1']);
  });

  testWidgets('rien à signaler : aucun bandeau', (tester) async {
    await pump(tester, const DashcamNotices());
    expect(find.byType(Card), findsNothing);
    expect(find.textContaining('charte'), findsNothing);
  });
}
