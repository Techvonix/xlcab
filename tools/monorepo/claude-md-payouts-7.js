// CLAUDE.md : Stripe Connect, écrans de l'appli passager.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  ARB `pay*`. Tests : `test/screens/payouts_screen_test.dart`. Restent : passager (feuilles de paiement ligne et\n" +
  "  bourse — `BookLineSheet` ignore encore `payment`, le statut d'offre `authorizing` n'est pas connu de l'appli),\n" +
  "  admin (page des reversements), puis essai réel avec les clés de test.\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  ARB `pay*`. Tests : `test/screens/payouts_screen_test.dart` ; écran vérifié sur le téléphone (sans Stripe : état",
  '  « aucun compte », 503 affiché proprement). Écrans passager faits (2026-10-13, analyse propre, tests écrits non',
  '  exécutables ici) : `MarketService.bookLine` renvoie `LineBooking { tripId, payment? }`, `acceptOffer` renvoie',
  '  `OfferChoice { payment? }` (+ `authorizeOffer`), modèles dans `core/models/payment.dart` (pour une empreinte,',
  '  `PaymentSheetParams.tripId` est vide), `OfferStatus.authorizing`. `BookLineSheet._pay` : feuille Stripe',
  '  (`paymentSheetPresenterProvider`) puis `/payments/confirm` ; abandon / refus / Stripe indisponible sur le',
  '  téléphone = course ANNULÉE tout de suite (`tripServiceProvider.cancel`, places rendues). Bourse :',
  '  `RequestDetailScreen._accept` → feuille → `authorizeOffer` ; feuille fermée = offre « Carte à valider » avec',
  '  bouton « Valider ma carte » (même empreinte, 15 min). Sans `payment` (mode `deferred`), parcours inchangés.',
  '  Clés ARB `mkcPaiementAbandonne`, `mkcCarte*`, `mkcValiderMaCarte`. Tests :',
  '  `apps/passenger/test/screens/market_payments_test.dart`. Restent : admin (page des reversements), bonus du',
  '  secours par virement, puis essai réel avec les clés de test (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,',
  '  `STRIPE_CONNECT_WEBHOOK_SECRET`, `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
