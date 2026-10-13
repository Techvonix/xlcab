// CLAUDE.md : Stripe Connect, page admin des reversements.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  `apps/passenger/test/screens/market_payments_test.dart`. Restent : admin (page des reversements), bonus du\n" +
  "  secours par virement, puis essai réel avec les clés de test (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,\n" +
  "  `STRIPE_CONNECT_WEBHOOK_SECRET`, `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  `apps/passenger/test/screens/market_payments_test.dart` ; réservation d'une ligne revérifiée sur le téléphone en",
  '  mode `deferred`. Admin fait (2026-10-13) : page « Reversements » (`xlcab_admin`,',
  '  `features/payouts/PayoutsPage.tsx`, route `/reversements`, `api.payouts` / `api.retryPayout`, clés i18n `rv*`) :',
  '  par défaut ceux qui ne sont pas partis, « Intervention requise » après 10 échecs, relance manuelle, détail de la',
  '  retenue ; part recouvrée affichée sur les pénalités appliquées de « Bourse et lignes ». Tests :',
  '  `src/features/payouts.test.tsx` (mock d\'API séparé) ; page NON vue dans le navigateur (connexion admin + 2FA à',
  '  refaire après le seed). Restent : bonus du secours par virement, facture de pénalité à 30 j, puis essai réel',
  '  avec les clés de test (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,',
  '  `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
