// CLAUDE.md : Stripe Connect, étape 2.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  reversement. Restent : 2 encaissement à la réservation de ligne, 3 bourse, 4 reversement en fin de trajet +\n" +
  "  remboursements + secours, 5 pénalités retenues, écrans (appli chauffeur : compte de versement ; passager :\n" +
  "  feuille de paiement sur une ligne). En mode `connect`, réservation de ligne et bourse répondent 503 d'ici là.\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  '  reversement. Étape 2 faite (2026-10-13) : en `connect`, `POST /lines/bookings` crée la course en `awaiting_payment`',
  '  (places et sièges RETENUS, une seule par passager et départ même non payée) et renvoie `payment` (feuille Stripe,',
  '  `transfer_group` = `transferGroupOf(tripId)` = `trip_{id}`) ; `PaymentsService.markPaid` → `confirmPaidLineBooking` :',
  '  `accepted` auprès du chauffeur qui assure le départ À CET INSTANT (secours compris ; `searching` = sans chauffeur ;',
  '  départ `failed` ou parti = annulée + remboursée), jamais de dispatch ; `expireUnpaid` (30 min) et l\'abandon rendent',
  '  places et sièges ; Stripe en panne à la réservation = rien de retenu. `PaymentsService.available()`.',
  '  PaymentsModule importe OperatorsModule (LinesService en 9e paramètre @Optional). Tests :',
  '  `line-bookings/line-payments.integration.spec.ts`. Restent : 3 bourse (encore 503 en `connect`), 4 reversement en',
  '  fin de trajet + remboursements + secours, 5 pénalités retenues, écrans (appli chauffeur : compte de versement ;',
  '  passager : feuille de paiement sur une ligne — `BookLineSheet` ignore encore `payment`).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
