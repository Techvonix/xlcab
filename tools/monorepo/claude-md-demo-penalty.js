const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const anchor = '- Migrations : `init_xlcab` appliquée sur la base locale ; toute modification de';
if (!s.includes(anchor)) throw new Error('ancre');
const add = [
  '- Démo, pénalité et bonus (2026-10-13, `seed-demo.ts`) : Chris a 3 annulations comptées et une pénalité de 260 €',
  '  appliquée il y a 31 jours (45 € recouvrés) → le PLANIFICATEUR de l\'API émet la facture du solde (215 €) dans la',
  '  minute, par le vrai circuit ; Djamel a un bonus de reprise de 160 € en attente. La pénalité est sur Chris, pas',
  '  sur Djamel, pour ne pas fausser l\'essai Stripe (45 € attendus sur le reversement de Djamel). Les factures des',
  '  anciens comptes de démo ne sont pas effacées au reseed (numérotation continue).',
  '- PDF des factures (défaut corrigé le 2026-10-13) : la clé de stockage était `invoice-FA-…pdf`, refusée par',
  '  `LocalDiskStorage` (clés `uuid.ext` seulement) → hors tests, AUCUN PDF n\'était archivé et le téléchargement',
  '  échouait. Clé désormais `uuid.pdf` ; `assertStorageKey` appliqué aussi à `MemoryDocumentStorage` pour que les',
  '  tests voient ce genre d\'écart. Ne jamais lancer une appli sur le téléphone (`monkey`) sans regarder d\'abord ce',
  '  qui est au premier plan : le porteur de projet peut être en train de s\'en servir.',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(anchor, () => add + anchor));
console.log('ok');
