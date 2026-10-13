// Suite des corrections après le premier passage des tests sur GitHub (2026-10-13).
const fs = require('fs');
function edit(file, steps) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to, all] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = all ? s.split(from).join(to) : s.replace(from, () => to);
  }
  fs.writeFileSync(file, s);
}
const P = 'C:/xlcab/apps/passenger/test/screens/';
const D = 'C:/xlcab/apps/driver/test/screens/';

// Accueil : la barre du bas appartient à la coque à onglets (PassengerShell), plus à l'écran d'accueil ;
// « Devenir chauffeur » est sous le bord de l'écran de test : on l'amène vraiment à l'écran avant de toucher.
edit(P + 'home_screen_test.dart', [
  ["      expect(find.text('Accueil'), findsOneWidget); // barre de navigation\n", "      // La barre de navigation appartient à la coque à onglets (PassengerShell), testée à part.\n      expect(find.text('Accueil'), findsNothing);\n"],
  [
    "  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);",
    "  // ensureVisible fait défiler jusqu'à ce que le widget soit réellement à l'écran (scrollUntilVisible\n  // s'arrête dès qu'il existe dans l'arbre, même sous le bord : le toucher tombait alors dans le vide).\n  await tester.ensureVisible(finder);\n  await tester.pumpAndSettle();",
  ],
]);

// Demande de devis : l'écran doit se redessiner entre deux touchers sur « + ».
edit(P + 'market_screens_test.dart', [
  ["        await tester.tap(find.byTooltip('Plus : Passagers'));\n      }", "        await tester.tap(find.byTooltip('Plus : Passagers'));\n        await tester.pump(); // sinon chaque toucher repart de la même valeur affichée\n      }"],
]);

// Reversements : les montants sont formatés avec une espace insécable avant « € » ; comparer avec formatPrice.
edit(D + 'payouts_screen_test.dart', [
  ["      expect(find.text('64,00 €'), findsNWidgets(2)); // total versé et ligne", "      expect(find.text(formatPrice(6400)), findsNWidgets(2)); // total versé et ligne"],
  ["      expect(find.text('98,00 €'), findsOneWidget); // total retenu", "      expect(find.text(formatPrice(9800)), findsOneWidget); // total retenu"],
  ["      expect(find.textContaining('Revenu 162,00 € · retenu 98,00 €'), findsOneWidget);", "      expect(find.textContaining('Revenu ${formatPrice(16200)} · retenu ${formatPrice(9800)}'), findsOneWidget);"],
  ["    expect(find.text('Déjà retenu sur vos reversements : 162,00 €'), findsOneWidget);", "    expect(find.text('Déjà retenu sur vos reversements : ${formatPrice(16200)}'), findsOneWidget);"],
  ["import 'package:xlcab_core/services/api_service.dart';", "import 'package:xlcab_core/services/api_service.dart';\nimport 'package:xlcab_core/utils/formatters.dart';"],
]);

// Formulaire de ligne : liste paresseuse plus haute que l'écran de test → le bouton « Publier » n'existait pas.
edit(D + 'operator_screens_test.dart', [
  [
    "Future<void> pump(WidgetTester tester, Widget screen) async {\n  tester.view.physicalSize = const Size(1170, 4200);",
    "/// [height] : hauteur de l'écran de test en pixels physiques (÷ 3 = points). Les longs formulaires sont des\n/// listes paresseuses : ce qui dépasse l'écran n'est pas construit, donc introuvable.\nFuture<void> pump(WidgetTester tester, Widget screen, {double height = 4200}) async {\n  tester.view.physicalSize = Size(1170, height);",
  ],
  ["      await pump(tester, const LineFormScreen());", "      await pump(tester, const LineFormScreen(), height: 7800);", true],
]);

// Messages (showToast) : un nouveau message remplace celui qui est affiché au lieu d'attendre derrière lui.
edit('C:/xlcab/packages/ui/lib/widgets/async_widgets.dart', [
  [
    "void showToast(BuildContext context, String message) =>\n    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));",
    "/// Message bref en bas d'écran. Un nouveau message REMPLACE celui qui est affiché : sans cela il\n/// attendait 5 secondes derrière le précédent (deux actions de suite = information en retard).\nvoid showToast(BuildContext context, String message) => ScaffoldMessenger.of(context)\n  ..removeCurrentSnackBar()\n  ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));",
  ],
]);
console.log('ok');
