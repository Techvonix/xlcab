// Tests de « Télécharger mes données » (appli passager) et double du service de compte.
const fs = require('fs');
function edit(file, steps) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(file, s);
}
edit('C:/xlcab/apps/passenger/test/support/fakes.dart', [
  [
    "  Future<void> deleteAccount(String password) => _act('delete:$password');\n",
    "  Future<void> deleteAccount(String password) => _act('delete:$password');\n\n  @override\n  Future<Uri> exportLink() async {\n    await _act('exportLink');\n    return Uri.parse('http://localhost:3000/api/v1/users/export/file?token=jeton-test');\n  }\n",
  ],
]);
edit('C:/xlcab/apps/passenger/test/screens/profile_screen_test.dart', [
  [
    "    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {\n      await pump(tester);\n      await expectAccessible(tester);\n    });\n  });\n\n  group('suppression du compte', () {",
    `    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      await pump(tester);
      await expectAccessible(tester);
    });
  });

  group('télécharger mes données (RGPD)', () {
    testWidgets('explication, puis lien ouvert dans le navigateur', (tester) async {
      await pump(tester);
      await tap(tester, find.text('Télécharger mes données'));
      expect(find.textContaining('valable 5 minutes'), findsOneWidget);
      expect(account.calls, isEmpty); // rien n'est demandé avant la confirmation

      await tap(tester, find.widgetWithText(FilledButton, 'Télécharger'));
      expect(account.calls, ['exportLink']);
      expect(opened.single.toString(), 'http://localhost:3000/api/v1/users/export/file?token=jeton-test');
      expect(find.text('Le téléchargement a démarré dans votre navigateur.'), findsOneWidget);
    });

    testWidgets('« Annuler » ne demande rien au serveur', (tester) async {
      await pump(tester);
      await tap(tester, find.text('Télécharger mes données'));
      await tap(tester, find.text('Annuler'));
      expect(account.calls, isEmpty);
      expect(opened, isEmpty);
    });

    testWidgets('quota du jour atteint : message du serveur, rien n’est ouvert', (tester) async {
      account.nextError = const ApiException('Trop d’exports aujourd’hui — réessayez demain');
      await pump(tester);
      await tap(tester, find.text('Télécharger mes données'));
      await tap(tester, find.widgetWithText(FilledButton, 'Télécharger'));
      expect(find.text('Trop d’exports aujourd’hui — réessayez demain'), findsOneWidget);
      expect(opened, isEmpty);
    });
  });

  group('suppression du compte', () {`,
  ],
]);
console.log('ok');
