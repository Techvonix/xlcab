// CLAUDE.md : Stripe Connect, étape 5.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  XLCAB, pas de reprise chez l'opérateur). Tests : `payouts/trip-payouts.integration.spec.ts`. Restent : 5\n" +
  "  pénalités retenues sur les reversements, écrans (appli chauffeur : compte de versement et reversements ;\n" +
  "  passager : feuilles de paiement ligne et bourse — `BookLineSheet` ignore encore `payment`, le statut d'offre\n" +
  "  `authorizing` n'est pas connu de l'appli ; admin : page des reversements).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  XLCAB, pas de reprise chez l'opérateur). Tests : `payouts/trip-payouts.integration.spec.ts`. Étape 5 faite",
  '  (2026-10-13, migration `payout_penalties`) : pénalités d\'annulation RETENUES sur les reversements. Le Payout naît',
  '  `draft` (jamais viré), `finalize` retient les `DriverPenalty` `applied` non soldées du chauffeur (jamais',
  '  pending / contested / cancelled), les plus anciennes d\'abord, par écriture conditionnelle sur `collectedCents` +',
  '  `PayoutDeduction` dans une transaction, puis fixe `grossCents` / `withheldCents` / `amountCents` et le statut',
  '  (pending, `withheld` = tout retenu, void). Plafond `PENALTY_WITHHOLD_PERCENT` (100 par défaut, À VALIDER).',
  '  `DriverPenalty.collectedCents` / `collectedAt` (soldée). Brouillon de plus de 5 min repris par `tick` sans double',
  '  retenue. Notification `payout.withheld` (reste dû). NON fait : paiement Stripe du `DriverBonus` de 160 € au',
  '  secours (ligne en base seulement), facture de pénalité à 30 j faute de reversements. Tests sensibles à',
  '  l\'horloge : mesurer depuis `nextAttemptAt`, pas depuis `Date.now()` (suite lente sous charge). Restent : écrans',
  '  (appli chauffeur : compte de versement et reversements ; passager : feuilles de paiement ligne et bourse —',
  '  `BookLineSheet` ignore encore `payment`, le statut d\'offre `authorizing` n\'est pas connu de l\'appli ; admin :',
  '  page des reversements), puis essai réel avec les clés de test.',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
