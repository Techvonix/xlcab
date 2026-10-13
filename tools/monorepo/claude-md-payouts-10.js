// CLAUDE.md : facture de pénalité.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  Restent : facture de pénalité à 30 j, puis essai réel avec les clés de test (`STRIPE_SECRET_KEY`,\n" +
  "  `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `--dart-define=STRIPE_PUBLISHABLE_KEY`,\n" +
  "  `LINE_PAYMENT_MODE=connect`).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  '  Facture de pénalité faite (2026-10-13, migration `penalty_invoice`) : `RescueService.tick` étape 5 →',
  '  `invoiceOverduePenalties` : pénalité `applied`, non soldée, sans facture, décidée depuis',
  '  `LINE_PENALTY_INVOICE_AFTER_DAYS` (30) → `InvoicesService.issuePenalty` (facture `due` du SOLDE, échéance + 30 j,',
  '  régime `penalty` hors champ TVA — à valider —, acheteur = le chauffeur), `DriverPenalty.invoiceId / invoicedAt`,',
  '  une seule facture par pénalité ; la retenue sur reversements continue ensuite. Paiement par virement enregistré',
  '  par l\'équipe : `POST /admin/penalties/:id/payment { amountCents, reference }` (2FA ; ≤ solde, écriture',
  '  conditionnelle, AuditLog `line.penalty.payment`) → alimente `collectedCents`, donc le bonus du secours. La facture',
  '  elle-même n\'est jamais modifiée (le solde vit sur la pénalité). Vues : `invoice { number, totalCents, dueDate }`',
  '  dans `/operators/me/cancellations` et `/admin/penalties` ; admin : `PenaltyPayment` dans « Bourse et lignes » ;',
  '  appli chauffeur : ligne dans « Mes annulations » (`payFacturePenalite`). LineBookingsModule importe InvoicesModule',
  '  (`RescueService` : InvoicesService en dernier paramètre @Optional). L\'IBAN de XLCAB ne figure pas sur la facture',
  '  (pas de variable prévue) : à ajouter avec les mentions du vendeur. Reste : essai réel avec les clés de test',
  '  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,',
  '  `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
