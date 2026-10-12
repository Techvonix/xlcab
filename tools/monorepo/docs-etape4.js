// Étape 4 : chemins de l'ancienne appli dans le script des icônes, le guide de marque et CLAUDE.md.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8'); // le BOM éventuel reste en tête de chaîne
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = typeof from === 'string' ? s.split(from).join(to) : s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

// Icônes : les deux applications portent le même symbole.
edit('brand/generate-icons.ps1', [
  [
    "Write-Host 'Android (versions < 8 ; les autres utilisent l''icone adaptative vectorielle) :'\n",
    "# Les deux applications (passager et chauffeur) portent le même symbole.\nforeach ($app in 'apps\\passenger', 'apps\\driver') {\nWrite-Host \"$app - Android (versions < 8 ; les autres utilisent l'icone adaptative vectorielle) :\"\n",
  ],
  ['$android = "$root\\xlcab_app\\android\\app\\src\\main\\res"', '$android = "$root\\$app\\android\\app\\src\\main\\res"'],
  ["Write-Host 'iOS (opaques : l''App Store refuse la transparence) :'", "Write-Host \"$app - iOS (opaques : l'App Store refuse la transparence) :\""],
  ['$ios = "$root\\xlcab_app\\ios\\Runner\\Assets.xcassets"', '$ios = "$root\\$app\\ios\\Runner\\Assets.xcassets"'],
  ['Render-Symbol 360 "$ios\\LaunchImage.imageset\\LaunchImage@3x.png" $tones.night\n', 'Render-Symbol 360 "$ios\\LaunchImage.imageset\\LaunchImage@3x.png" $tones.night\n}\n'],
]);

edit('brand/README.md', [
  ['2. **App Flutter** : `xlcab_app/lib/widgets/xlcab_logo.dart`', '2. **Applications Flutter** (passager et chauffeur) : `packages/ui/lib/widgets/xlcab_logo.dart`'],
  ['3. **Android** : `xlcab_app/android/app/src/main/res/drawable/ic_launcher_foreground.xml`', '3. **Android**, dans CHACUNE des deux applis (`apps/passenger`, `apps/driver`) :\n   `android/app/src/main/res/drawable/ic_launcher_foreground.xml`'],
]);

edit('CLAUDE.md', [
  ['- `xlcab_app/` : app Flutter (projet complété par `flutter create`, polices Poppins/Inter OFL dans\n  `assets/fonts/`).', '- Applications Flutter : `apps/passenger` et `apps/driver` (voir « Deux applis » ci-dessus ; polices\n  Poppins/Inter OFL dans `packages/ui/lib/fonts/`).'],
  ['gen-l10n, `xlcab_app/l10n.yaml`, ARB `lib/l10n/app_fr.arb`', 'gen-l10n, `packages/core/l10n.yaml`, ARB `packages/core/lib/l10n/app_fr.arb`'],
  ['- Lancer `flutter analyze lib test` depuis `xlcab_app/` (lancé ailleurs, il peut répondre « No issues »', '- Lancer `flutter analyze .` DANS chaque paquet (`packages/core`, `packages/ui`, `apps/passenger`, `apps/driver` ;\n  lancé ailleurs, il peut répondre « No issues »'],
  ['App Flutter (depuis `xlcab_app/`) : `flutter pub get`, `flutter analyze`, `flutter test`,', 'Applications Flutter : `flutter pub get` depuis la racine `C:\\xlcab` ; `flutter analyze .`, `flutter test` et\n`flutter build apk` dans `apps/passenger` ou `apps/driver` (guide : `APPLICATIONS_MOBILES.md`). Exemple :'],
  ['  `xlcab_app/` N\'EXISTE PLUS.', '  L\'ancien dossier de l\'appli unique N\'EXISTE PLUS.'],
  [/Voir SETUP_INSTRUCTIONS\.md\./g, 'Voir APPLICATIONS_MOBILES.md.'],
]);
console.log('ok');
