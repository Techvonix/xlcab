const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const anchor = '- Migrations : `init_xlcab` appliquée sur la base locale ; toute modification de';
if (!s.includes(anchor)) throw new Error('ancre');
const add = [
  '- Tests automatiques (2026-10-13, `.github/workflows/tests.yml`, PAS ENCORE ENVOYÉ : aucun dépôt distant, `gh`',
  '  absent) : GitHub Actions sur push `main` / PR / lancement manuel — Flutter 3.47.5 (analyse + tests de',
  '  `packages/core`, `packages/ui`, `apps/passenger`, `apps/driver`, journal en artefact), serveur (Node 22, `npm ci`,',
  '  `prisma generate`, tests, build), portails admin et entreprise. Aucun secret requis. Avant tout envoi : dépôt',
  '  PRIVÉ créé par le porteur de projet, accord explicite pour le `git push`. Historique vérifié le 2026-10-13 : aucun',
  '  secret (seulement des valeurs d\'exemple) ; CLAUDE.md cite l\'adresse Gmail du compte Google Cloud. Les tests',
  '  Flutter n\'ayant jamais tourné, s\'attendre à des échecs au premier passage.',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(anchor, () => add + anchor));
console.log('ok');
