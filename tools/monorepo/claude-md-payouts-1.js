// CLAUDE.md : Stripe Connect, étape 1.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const anchor = '- Migrations : `init_xlcab` appliquée sur la base locale ; toute modification de';
if (!s.includes(anchor)) throw new Error('ancre introuvable');
const add = [
  '- Stripe Connect (décisions du 2026-10-13 : le passager paie à la réservation sur la plateforme, la part de',
  '  l\'opérateur est REVERSÉE APRÈS LE TRAJET — « separate charges and transfers », le secours qui reprend un départ',
  '  est celui qu\'on paie — ; lignes et bourse d\'abord, courses instantanées inchangées ; compte de versement EXIGÉ',
  '  pour vendre). `LINE_PAYMENT_MODE` = `deferred` (défaut, tests, 503 en production) | `connect`',
  '  (`src/payouts/payment-mode.ts`, réexporté par line-bookings). Étape 1 faite, `src/payouts/payout-accounts.ts`',
  '  (migration `payout_accounts`) : `PayoutAccount` (userId, `stripeAccountId`, état recopié de Stripe : jamais',
  '  d\'identité ni d\'IBAN chez XLCAB), compte Stripe Express « transfers » seulement (idempotence',
  '  `payout-account-{userId}`), `GET /operators/me/payout-account` = { required, state none|incomplete|pending|ready,',
  '  ready, requirementsDue } (relu chez Stripe tant que pas prêt), `POST …/onboarding-link` (chauffeur validé + profil',
  '  opérateur, 10/h), `POST …/dashboard-link`, webhook `POST /api/v1/webhooks/stripe-connect` (secret DISTINCT',
  '  `STRIPE_CONNECT_WEBHOOK_SECRET`, `account.updated`), pages de retour publiques `/versements/retour|reprise`.',
  '  `PayoutAccountsService.assertReady` (403 `PAYOUT_ACCOUNT_REQUIRED`, sans effet en `deferred`) dans',
  '  `LinesService.confirm`, réouverture d\'un départ, `MarketService.propose` / confirmation. `readyAccountId` pour le',
  '  reversement. Restent : 2 encaissement à la réservation de ligne, 3 bourse, 4 reversement en fin de trajet +',
  '  remboursements + secours, 5 pénalités retenues, écrans (appli chauffeur : compte de versement ; passager :',
  '  feuille de paiement sur une ligne). En mode `connect`, réservation de ligne et bourse répondent 503 d\'ici là.',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(anchor, add + anchor));
console.log('ok');
