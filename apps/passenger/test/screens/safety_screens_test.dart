import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_passenger/screens/profile/trusted_contacts_screen.dart';
import 'package:xlcab_passenger/screens/tracking/widgets/share_sheet.dart';
import 'package:xlcab_passenger/services/safety_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/safety_fakes.dart';

// Espace sécurité : écran des contacts de confiance et feuille de partage du
// trajet. Serveur, messagerie SMS et presse-papiers sont des doubles de test.

late FakeSafetyService safety;
late FakePreferencesService prefs;
final List<(String, String)> sms = [];
final List<String> copied = [];
bool smsAvailable = true;

Future<void> pump(WidgetTester tester, Widget home) async {
  tester.view.physicalSize = const Size(1080, 6000);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        safetyServiceProvider.overrideWithValue(safety),
        feedbackServiceProvider.overrideWithValue(prefs),
        smsComposerProvider.overrideWithValue((phone, body) async {
          sms.add((phone, body));
          return smsAvailable;
        }),
        clipboardWriterProvider.overrideWithValue((text) async => copied.add(text)),
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
        home: home,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Écran hôte : un bouton qui ouvre la feuille de partage.
Widget sheetHost() => Scaffold(
      body: Builder(
        builder: (context) => Center(
          child: FilledButton(onPressed: () => showShareSheet(context, 'trip-1'), child: const Text('OUVRIR')),
        ),
      ),
    );

Future<void> openSheet(WidgetTester tester) async {
  await pump(tester, sheetHost());
  await tester.tap(find.text('OUVRIR'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    safety = FakeSafetyService();
    prefs = FakePreferencesService();
    sms.clear();
    copied.clear();
    smsAvailable = true;
  });

  group('contacts de confiance', () {
    testWidgets('liste vide puis ajout : le numéro est nettoyé avant l’envoi', (tester) async {
      await pump(tester, const TrustedContactsScreen());
      expect(find.text('Aucun contact pour l’instant.'), findsOneWidget);

      await tester.tap(find.text('Ajouter un contact'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Nom'), ' Maman ');
      await tester.enterText(find.widgetWithText(TextFormField, 'Téléphone'), '06 12 34 56 78');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();

      expect(safety.saved.single.name, 'Maman');
      expect(safety.saved.single.phone, '0612345678');
      expect(find.text('Maman'), findsOneWidget);
      expect(find.text('Aucun contact pour l’instant.'), findsNothing);
    });

    testWidgets('nom vide ou numéro invalide : rien n’est envoyé', (tester) async {
      await pump(tester, const TrustedContactsScreen());
      await tester.tap(find.text('Ajouter un contact'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Téléphone'), 'abc');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();

      expect(find.text('Indiquez un nom'), findsOneWidget);
      expect(find.text('Numéro invalide'), findsOneWidget);
      expect(safety.saved, isEmpty);
    });

    testWidgets('suppression après confirmation', (tester) async {
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Karim', phone: '+33611223344'));
      await pump(tester, const TrustedContactsScreen());
      await tester.tap(find.byTooltip('Supprimer Karim'));
      await tester.pumpAndSettle();
      expect(find.text('Supprimer Karim ?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Supprimer'));
      await tester.pumpAndSettle();
      expect(safety.saved, isEmpty);
    });

    testWidgets('5 contacts : plus de bouton d’ajout', (tester) async {
      for (var i = 0; i < 5; i++) {
        safety.saved.add(TrustedContact(id: 'c$i', name: 'Contact $i', phone: '060000000$i'));
      }
      await pump(tester, const TrustedContactsScreen());
      expect(find.text('Ajouter un contact'), findsNothing);
      expect(find.textContaining('5 contacts au maximum'), findsOneWidget);
    });

    testWidgets('partage à chaque trajet : enregistré sur le compte ; échec → retour à l’état précédent', (tester) async {
      await pump(tester, const TrustedContactsScreen());
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(prefs.changes, [
        {'autoShareTrips': true},
      ]);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);

      prefs.updateError = const ApiException('Service indisponible');
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);
      expect(find.text('Service indisponible'), findsOneWidget);
    });

    testWidgets('« Préférer une conductrice » : présentée comme une préférence, enregistrée sur le compte', (tester) async {
      await pump(tester, const TrustedContactsScreen());
      expect(find.textContaining('Ce n’est pas une garantie'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch).last).value, isFalse);
      await tester.tap(find.byType(Switch).last);
      await tester.pumpAndSettle();
      expect(prefs.changes, [
        {'preferWomanDriver': true},
      ]);
      expect(tester.widget<Switch>(find.byType(Switch).last).value, isTrue);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse); // l'autre réglage ne bouge pas
    });

    testWidgets('erreur d’ajout affichée (ex. 5 contacts déjà enregistrés ailleurs)', (tester) async {
      safety.addError = const ApiException('5 contacts de confiance au maximum : supprimez-en un d’abord');
      await pump(tester, const TrustedContactsScreen());
      await tester.tap(find.text('Ajouter un contact'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Nom'), 'Lina');
      await tester.enterText(find.widgetWithText(TextFormField, 'Téléphone'), '0612345678');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();
      expect(find.textContaining('5 contacts de confiance au maximum'), findsOneWidget);
    });

    testWidgets('accessibilité : cibles tactiles, libellés, contraste', (tester) async {
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Karim', phone: '+33611223344'));
      final handle = tester.ensureSemantics();
      await pump(tester, const TrustedContactsScreen());
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });

  group('partage du trajet', () {
    testWidgets('ouvrir la feuille crée le lien ; « Envoyer à » prépare le SMS du contact', (tester) async {
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      await openSheet(tester);
      expect(safety.shareCalls, 1);
      expect(find.text('Partager mon trajet'), findsOneWidget);

      await tester.tap(find.text('Envoyer à Maman'));
      await tester.pumpAndSettle();
      expect(sms.single.$1, '0612345678');
      expect(sms.single.$2, contains(sharedTripUrl));
      expect(copied, isEmpty);
    });

    testWidgets('sans messagerie SMS : le lien est copié et l’utilisateur prévenu', (tester) async {
      smsAvailable = false;
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      await openSheet(tester);
      await tester.tap(find.text('Envoyer à Maman'));
      await tester.pumpAndSettle();
      expect(copied, [sharedTripUrl]);
      expect(find.textContaining('Le lien a été copié'), findsOneWidget);
    });

    testWidgets('sans contact : invitation à en ajouter, copie du lien possible', (tester) async {
      await openSheet(tester);
      expect(find.textContaining('Ajoutez des contacts de confiance'), findsOneWidget);
      await tester.tap(find.text('Copier le lien'));
      await tester.pumpAndSettle();
      expect(copied, [sharedTripUrl]);
      expect(find.text('Lien de suivi copié.'), findsOneWidget);
    });

    testWidgets('« Arrêter le partage » coupe le lien et ferme la feuille', (tester) async {
      await openSheet(tester);
      expect(safety.sharing, isTrue);
      await tester.tap(find.text('Arrêter le partage'));
      await tester.pumpAndSettle();
      expect(safety.sharing, isFalse);
      expect(find.text('Partager mon trajet'), findsNothing);
      expect(find.textContaining('le lien ne fonctionne plus'), findsOneWidget);
    });

    testWidgets('trajet terminé : message du serveur et « Réessayer », aucun lien proposé', (tester) async {
      safety.shareError = const ApiException('Ce trajet est terminé : il ne peut plus être partagé');
      await openSheet(tester);
      expect(find.textContaining('Ce trajet est terminé'), findsOneWidget);
      expect(find.text('Copier le lien'), findsNothing);
      expect(find.text('Réessayer'), findsOneWidget);
    });

    testWidgets('accessibilité de la feuille', (tester) async {
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      final handle = tester.ensureSemantics();
      await openSheet(tester);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });
}
