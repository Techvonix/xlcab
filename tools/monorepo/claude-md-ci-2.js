const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf('- Tests automatiques (2026-10-13, `.github/workflows/tests.yml`, PAS ENCORE ENVOYÉ');
const end = s.indexOf('- Migrations : `init_xlcab` appliquée sur la base locale', start);
if (start < 0 || end < 0) throw new Error('bloc introuvable');
const block = [
  '- Tests automatiques (2026-10-13, `.github/workflows/tests.yml`) : dépôt PRIVÉ `https://github.com/Techvonix/xlcab`',
  '  (remote `origin`, branche `main`). GitHub Actions sur push / PR / lancement manuel : Flutter 3.47.5 (analyse +',
  '  tests de `packages/core`, `packages/ui`, `apps/passenger`, `apps/driver`, journal en artefact',
  '  `journal-flutter-N`), serveur (Node 24 — Jest exige >= 24.9 pour require(esm) —, `npm ci`, `prisma generate`,',
  '  tests, build), portails admin et entreprise. Aucun secret requis. TOUT EST VERT depuis le 3e passage',
  '  (2026-10-13) : 188 tests passager, 92 chauffeur, 606 serveur, 46 admin, 42 entreprise. C\'est désormais LE moyen',
  '  de faire tourner les tests Flutter (impossibles sur ce PC).',
  '  `git push` est REFUSÉ à Claude par le garde-fou de l\'application (sortie de données) : le porteur de projet le',
  '  lance lui-même (bouton Run ou PowerShell ouvert dans le dossier du projet). Résultats : il colle la page, envoie une capture, ou',
  '  télécharge l\'artefact du passage dans `Téléchargements` (`journal-flutter-2*.zip` = passager, `-3` = chauffeur ;',
  '  prendre le plus récent, à décompresser dans un dossier vide du scratchpad). `gh` absent, extension Chrome non',
  '  reliée. Leçons du premier passage (tests jamais exécutés auparavant) : `pump()` entre deux touchers sur le même',
  '  widget (sinon le second voit l\'ancien état) ; `scrollUntilVisible` s\'arrête dès que le widget existe, même sous',
  '  le bord → enchaîner `ensureVisible` + `pumpAndSettle` avant un toucher ; montants à comparer avec',
  '  `formatPrice(...)` (espace insécable avant « € ») ; formulaire en liste paresseuse plus haut que l\'écran de test',
  '  → `pump(..., height:)` ; chemins de fichiers relatifs au dossier de l\'appli (`../../packages/...`). `showToast`',
  '  REMPLACE le message affiché (`removeCurrentSnackBar`) au lieu de le mettre en file.',
  '',
].join('\n');
fs.writeFileSync(f, s.slice(0, start) + block + s.slice(end));
console.log('ok');
