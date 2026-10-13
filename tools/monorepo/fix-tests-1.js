// Corrections des tests jamais exécutés avant le premier passage sur GitHub (2026-10-13).
const fs = require('fs');
function edit(file, steps) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(file, s);
}
edit('C:/xlcab/apps/passenger/test/screens/driver_profile_screen_test.dart', [
  [
    "      await tester.tap(find.text('Ponctualité'));\n      await tester.tap(find.text('Ponctualité')); // retirée\n      await tester.pump();",
    "      await tester.tap(find.text('Ponctualité'));\n      // L'écran doit se redessiner entre deux touchers : sinon le second voit encore la pastille non cochée.\n      await tester.pump();\n      await tester.tap(find.text('Ponctualité')); // retirée\n      await tester.pump();",
  ],
]);
console.log('ok');
