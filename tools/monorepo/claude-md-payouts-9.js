// CLAUDE.md : Stripe Connect, bonus de reprise.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  refaire après le seed). Restent : bonus du secours par virement, facture de pénalité à 30 j, puis essai réel\n" +
  "  avec les clés de test (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,\n" +
  "  `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  refaire après le seed). Bonus de reprise fait (2026-10-13, migration `driver_bonus_payout`) : `DriverBonus` a un",
  '  statut de virement (pending | paid | blocked | failed) ; `TripPayoutsService.payBonuses` (dans `tick`) vire les',
  '  160 € au secours dès que la pénalité liée est `applied` ET recouvrée À HAUTEUR DU BONUS (le secours passe avant',
  '  les avoirs passagers — règle À VALIDER) ; virement depuis le solde de la plateforme (pas de `source_transaction`),',
  '  clé `bonus-{id}-{compte}`, mêmes reprises que les reversements. `mine()` renvoie `bonuses`, admin',
  '  `GET /admin/payouts/bonuses`, `POST /admin/payouts/bonuses/:id/retry` (409 si la pénalité n\'est pas recouvrée).',
  '  Affiché dans l\'écran chauffeur (`RescueBonus`, clés `payBonus*`) et la page admin (`BonusesSection`, `rvBonus*`).',
  '  L\'APK chauffeur installé sur le téléphone date d\'AVANT l\'affichage des bonus : recompiler avant une démo.',
  '  Restent : facture de pénalité à 30 j, puis essai réel avec les clés de test (`STRIPE_SECRET_KEY`,',
  '  `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `--dart-define=STRIPE_PUBLISHABLE_KEY`,',
  '  `LINE_PAYMENT_MODE=connect`).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
