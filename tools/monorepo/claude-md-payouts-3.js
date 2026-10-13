// CLAUDE.md : Stripe Connect, étape 3.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  `line-bookings/line-payments.integration.spec.ts`. Restent : 3 bourse (encore 503 en `connect`), 4 reversement en\n" +
  "  fin de trajet + remboursements + secours, 5 pénalités retenues, écrans (appli chauffeur : compte de versement ;\n" +
  "  passager : feuille de paiement sur une ligne — `BookLineSheet` ignore encore `payment`).\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  '  `line-bookings/line-payments.integration.spec.ts`. Étape 3 faite (2026-10-13, migration `market_payments`,',
  '  décision : EMPREINTE DE CARTE au choix du client) : en `connect`, `POST /market/offers/:id/accept` → offre',
  '  `authorizing` (15 min, `AUTHORIZE_WINDOW_MIN` ; l\'opérateur la voit encore `pending`) + `payment` (PaymentIntent',
  '  `capture_method: manual`, `Payment.offerId`, clé `offer-payment-{offerId}-{tentative}`) ; `POST',
  '  /market/offers/:id/authorize` (ou `market.tick`) vérifie `requires_capture` au montant exact → `accepted`, opérateur',
  '  prévenu, 2 h ; `confirm` de l\'opérateur DÉBITE (`captureAuthorization`, clé `offer-capture-{paymentId}`) avant de',
  '  créer les courses — refus = 409, offre `expired`, client invité à rechoisir ; course non créée après débit =',
  '  `refundCapturedOffer`. Empreinte levée (`releaseAuthorization`, ne lève jamais) au refus, au délai, à',
  '  l\'annulation ou l\'échéance de la demande, à l\'abandon (offre de nouveau `pending`). Aller-retour = UN paiement :',
  '  `Payment.tripId` = l\'aller, `Trip.paidWithTripId` sur le retour, `PaymentsService.paymentOf` rembourse la part',
  '  de la course annulée seulement. MarketModule importe PaymentsModule. Tests :',
  '  `market/market-payments.integration.spec.ts`. Restent : 4 reversement en fin de trajet + secours, 5 pénalités',
  '  retenues, écrans (appli chauffeur : compte de versement ; passager : feuilles de paiement ligne et bourse —',
  '  `BookLineSheet` ignore encore `payment`, le statut d\'offre `authorizing` n\'est pas connu de l\'appli).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
