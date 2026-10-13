// CLAUDE.md : Stripe Connect, étape 4.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  `market/market-payments.integration.spec.ts`. Restent : 4 reversement en fin de trajet + secours, 5 pénalités\n" +
  "  retenues, écrans (appli chauffeur : compte de versement ; passager : feuilles de paiement ligne et bourse —\n" +
  "  `BookLineSheet` ignore encore `payment`, le statut d'offre `authorizing` n'est pas connu de l'appli).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  '  `market/market-payments.integration.spec.ts`. Étape 4 faite (2026-10-13, migration `payouts`,',
  '  `src/payouts/trip-payouts.ts` ; le module est maintenant `src/payouts/payouts.module.ts`) : `Payout` (un par',
  '  course, `tripId` unique ; pending | paid | blocked = compte de versement pas prêt | failed | void).',
  '  `TripsService.complete` → `TripPayoutsService.onTripCompleted` (ne lève jamais) : course `line`/`market` terminée',
  '  ET payée en ligne seulement ; montant = `operatorShareCents` = TTC − TVA − `commissionCents` (comme l\'écran',
  '  Revenus), plafonné à ce qui reste encaissé ; bénéficiaire = `trip.driverId` à la fin (donc le SECOURS s\'il a',
  '  repris) ; `stripe.transfers.create` avec `source_transaction` = charge du paiement (part même si les fonds ne',
  '  sont pas disponibles), clé `payout-{id}-{compte}`. Reprises par `tick` (planificateur) : blocked chaque heure',
  '  (opérateur prévenu une fois), failed 5 min × 2ⁿ plafonné 6 h, 10 essais (`PAYOUT_MAX_ATTEMPTS`) puis main à',
  '  l\'équipe ; filet : courses terminées < 7 j sans Payout. `GET /operators/me/payouts` (failed montré `pending`,',
  '  aucun identifiant Stripe), admin 2FA `GET /admin/payouts`, `POST /admin/payouts/:id/retry`. NON traité : frais',
  '  d\'annulation retenus (gardés par XLCAB, à décider), remboursement admin APRÈS reversement (à la charge de',
  '  XLCAB, pas de reprise chez l\'opérateur). Tests : `payouts/trip-payouts.integration.spec.ts`. Restent : 5',
  '  pénalités retenues sur les reversements, écrans (appli chauffeur : compte de versement et reversements ;',
  '  passager : feuilles de paiement ligne et bourse — `BookLineSheet` ignore encore `payment`, le statut d\'offre',
  '  `authorizing` n\'est pas connu de l\'appli ; admin : page des reversements).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
