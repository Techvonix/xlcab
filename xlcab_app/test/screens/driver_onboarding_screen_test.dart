import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/driver_application.dart';
import 'package:xlcab_app/providers/booking_provider.dart';
import 'package:xlcab_app/providers/driver_onboarding_provider.dart';
import 'package:xlcab_app/screens/driver/driver_onboarding_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/document_picker.dart';
import 'package:xlcab_app/services/driver_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/fakes.dart';

late FakeDriverService service;
late FakeDocumentPicker picker;

Future<void> pumpOnboarding(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 4800);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        driverServiceProvider.overrideWithValue(service),
        documentPickerProvider.overrideWithValue(picker),
        clockProvider.overrideWithValue(() => now),
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
        home: const DriverOnboardingScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

DriverOnboardingController ctrl(WidgetTester tester) => ProviderScope.containerOf(
      tester.element(find.byType(DriverOnboardingScreen)),
    ).read(driverOnboardingProvider.notifier);

Future<void> tapNext(WidgetTester tester) async {
  await tester.tap(find.text('Suivant'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    service = FakeDriverService();
    picker = FakeDocumentPicker();
  });

  testWidgets('étape 1 sur 5 affichée avec sa progression', (tester) async {
    await pumpOnboarding(tester);
    expect(find.text('Étape 1 sur 5'), findsOneWidget);
    expect(find.text('Informations personnelles'), findsOneWidget);
    expect(find.text('Précédent'), findsNothing);
  });

  testWidgets('"Suivant" sur une étape incomplète liste ce qui manque', (tester) async {
    await pumpOnboarding(tester);
    await tapNext(tester);
    expect(find.text('Étape 1 sur 5'), findsOneWidget);
    expect(find.text('Prénom requis'), findsOneWidget);
    expect(find.text('Numéro de téléphone invalide'), findsOneWidget);
  });

  testWidgets('saisie → étape suivante, et "Précédent" conserve les saisies', (tester) async {
    await pumpOnboarding(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Prénom'), 'Nadia');
    await tester.enterText(find.widgetWithText(TextFormField, 'Nom'), 'Benali');
    await tester.enterText(find.widgetWithText(TextFormField, 'Téléphone mobile'), '06 12 34 56 78');
    await tapNext(tester);

    expect(find.text('Étape 2 sur 5'), findsOneWidget);
    expect(find.text('Documents du véhicule'), findsOneWidget);

    await tester.tap(find.text('Précédent'));
    await tester.pumpAndSettle();
    expect(find.text('Nadia'), findsOneWidget);
  });

  testWidgets('document : photo → envoi → "Reçu", annoncé au lecteur d’écran', (tester) async {
    await pumpOnboarding(tester);
    ctrl(tester).update((_) => completeDraft());
    await tapNext(tester);

    expect(find.bySemanticsLabel('Carte grise : Non envoyé'), findsOneWidget);
    await tester.tap(find.text('Photographier').first);
    await tester.pumpAndSettle();

    expect(picker.sources, [DocumentSource.camera]);
    expect(service.uploads, [DriverDocumentType.vehicleRegistration]);
    expect(find.bySemanticsLabel('Carte grise : Reçu — en attente de vérification'), findsOneWidget);
    expect(find.text('Reprendre la photo'), findsOneWidget);
  });

  testWidgets('étape 5 : consentement non pré-coché, envoi puis écran "en vérification"', (tester) async {
    await pumpOnboarding(tester);
    ctrl(tester).update((_) => completeDraft().copyWith(consent: false));
    for (final t in DriverDocumentType.required) {
      await ctrl(tester).pickAndUpload(t, DocumentSource.camera);
    }
    for (var i = 0; i < 4; i++) {
      await tapNext(tester);
    }
    expect(find.text('Étape 5 sur 5'), findsOneWidget);
    final consent = tester.widget<CheckboxListTile>(find.byType(CheckboxListTile));
    expect(consent.value, isFalse);

    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Envoyer mon dossier'));
    await tester.pumpAndSettle();

    expect(service.lastApplication, isNotNull);
    expect(find.text('Dossier en cours de vérification'), findsOneWidget);
  });

  testWidgets('refus du serveur affiché sur l’étape d’envoi', (tester) async {
    service.applyError = const ApiException('Ce véhicule est déjà enregistré');
    await pumpOnboarding(tester);
    ctrl(tester).update((_) => completeDraft());
    for (final t in DriverDocumentType.required) {
      await ctrl(tester).pickAndUpload(t, DocumentSource.camera);
    }
    for (var i = 0; i < 4; i++) {
      await tapNext(tester);
    }
    await tester.tap(find.text('Envoyer mon dossier'));
    await tester.pumpAndSettle();
    expect(find.text('Ce véhicule est déjà enregistré'), findsOneWidget);
  });

  testWidgets('dossier déjà envoyé : écran de statut, pas de formulaire', (tester) async {
    service.status = DriverApplicationStatus.pending;
    await pumpOnboarding(tester);
    expect(find.text('Dossier en cours de vérification'), findsOneWidget);
    expect(find.text('Suivant'), findsNothing);
  });

  testWidgets('compte validé : accès au mode chauffeur', (tester) async {
    service.status = DriverApplicationStatus.approved;
    await pumpOnboarding(tester);
    expect(find.text('Compte chauffeur validé'), findsOneWidget);
    expect(find.text('Passer en mode chauffeur'), findsOneWidget);
  });

  group('accessibilité (Partie 5)', () {
    for (final step in [0, 1, 3, 4]) {
      testWidgets('étape ${step + 1} : zones tactiles, libellés, contraste', (tester) async {
        await pumpOnboarding(tester);
        ctrl(tester).update((_) => completeDraft());
        for (final t in DriverDocumentType.required) {
          await ctrl(tester).pickAndUpload(t, DocumentSource.camera);
        }
        for (var i = 0; i < step; i++) {
          await tapNext(tester);
        }
        await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
      });
    }

    testWidgets('texte agrandi à 200 % : aucun débordement sur les 5 étapes', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pumpOnboarding(tester);
      ctrl(tester).update((_) => completeDraft());
      for (final t in DriverDocumentType.required) {
        await ctrl(tester).pickAndUpload(t, DocumentSource.camera);
      }
      for (var i = 0; i < 4; i++) {
        expect(tester.takeException(), isNull, reason: 'étape ${i + 1}');
        ctrl(tester).next();
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull, reason: 'étape 5');
    });
  });
}
