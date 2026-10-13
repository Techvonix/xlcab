// scrollTo : d'abord faire exister le widget (liste paresseuse), puis l'amener réellement à l'écran.
const fs = require('fs');
const f = 'C:/xlcab/apps/passenger/test/screens/home_screen_test.dart';
let s = fs.readFileSync(f, 'utf8');
const from = "  // ensureVisible fait défiler jusqu'à ce que le widget soit réellement à l'écran (scrollUntilVisible\n  // s'arrête dès qu'il existe dans l'arbre, même sous le bord : le toucher tombait alors dans le vide).\n  await tester.ensureVisible(finder);\n  await tester.pumpAndSettle();";
if (!s.includes(from)) throw new Error('motif');
s = s.replace(from, () => "  // Deux temps : scrollUntilVisible fait exister le widget (liste paresseuse) mais s'arrête dès qu'il est dans\n  // l'arbre, même sous le bord de l'écran ; ensureVisible l'amène ensuite réellement à l'écran, pour qu'un\n  // toucher ne tombe pas dans le vide.\n  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);\n  await tester.ensureVisible(finder);\n  await tester.pumpAndSettle();");
fs.writeFileSync(f, s);
console.log('ok');
