// Espace sécurité : le test de l'écran de suivi utilise les doubles du partage.
const fs = require('fs');
const f = 'C:/xlcab/apps/passenger/test/screens/tracking_screen_test.dart';
let s = fs.readFileSync(f, 'utf8');
function rep(from, to) {
  const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
  if (!ok) throw new Error('motif introuvable : ' + from);
  s = s.replace(from, to);
}
rep("import '../support/fakes.dart';", "import '../support/fakes.dart';\nimport '../support/safety_fakes.dart';");
rep("import 'package:xlcab_core/services/api_service.dart';", "import 'package:xlcab_core/services/api_service.dart';\nimport 'package:xlcab_core/services/feedback_service.dart';");
rep("import 'package:xlcab_passenger/services/tracking_channel.dart';", "import 'package:xlcab_passenger/services/safety_service.dart';\nimport 'package:xlcab_passenger/services/tracking_channel.dart';");
rep('late FakeLocationService location;\nString? clipboard;', 'late FakeLocationService location;\nlate FakeSafetyService safety;\nlate FakePreferencesService prefs;\nfinal List<(String, String)> sms = [];');
rep(
  /  \/\/ Presse-papiers simulé \(bouton "Partager"\)\.\n[\s\S]*?addTearDown\(\(\) => tester\.binding\.defaultBinaryMessenger\.setMockMethodCallHandler\(SystemChannels\.platform, null\)\);\n\n/,
  '',
);
rep(
  '        locationServiceProvider.overrideWithValue(location),\n',
  '        locationServiceProvider.overrideWithValue(location),\n        // Espace sécurité : partage du trajet (serveur et messagerie SMS simulés).\n        safetyServiceProvider.overrideWithValue(safety),\n        feedbackServiceProvider.overrideWithValue(prefs),\n        smsComposerProvider.overrideWithValue((phone, body) async {\n          sms.add((phone, body));\n          return true;\n        }),\n',
);
rep('    location = FakeLocationService();\n    clipboard = null;', '    location = FakeLocationService();\n    safety = FakeSafetyService();\n    prefs = FakePreferencesService();\n    sms.clear();');
rep(
  /    testWidgets\('"Partager" copie un résumé du trajet', \(tester\) async \{[\s\S]*?\n    \}\);\n/,
  `    testWidgets('"Partager" ouvre la feuille de partage et prépare le SMS d’un contact', (tester) async {
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      await pumpTracking(tester);
      expect(find.text('Partager mon trajet'), findsNothing); // option désactivée : rien ne s'ouvre seul

      await tester.tap(find.widgetWithText(OutlinedButton, 'Partager'));
      await tester.pumpAndSettle();
      expect(find.text('Partager mon trajet'), findsOneWidget);
      await tester.tap(find.text('Envoyer à Maman'));
      await tester.pumpAndSettle();
      expect(sms.single.\$1, '0612345678');
      expect(sms.single.\$2, contains(sharedTripUrl));
    });

    testWidgets('partage à chaque trajet activé : la feuille se propose seule, une fois', (tester) async {
      prefs.autoShare = true;
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      await pumpTracking(tester);
      expect(find.text('Partager mon trajet'), findsOneWidget);
      expect(safety.shareCalls, 1);
    });

    testWidgets('partage déjà actif, ou aucun contact : rien ne s’ouvre seul', (tester) async {
      prefs.autoShare = true;
      await pumpTracking(tester); // aucun contact
      expect(find.text('Partager mon trajet'), findsNothing);

      await tester.pumpWidget(const SizedBox());
      safety.saved.add(const TrustedContact(id: 'c1', name: 'Maman', phone: '0612345678'));
      safety.sharing = true;
      await pumpTracking(tester);
      expect(find.text('Partager mon trajet'), findsNothing);
      expect(safety.shareCalls, 0);
    });
`,
);
fs.writeFileSync(f, s);
console.log('ok');
