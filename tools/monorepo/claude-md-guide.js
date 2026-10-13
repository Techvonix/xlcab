const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from = "  `invoice.bank_details_missing` et `sellerComplete` faux (alerte de la page Factures de l'admin). Reste : essai\n  réel avec les clés de test\n";
if (!s.includes(from)) throw new Error('ancre');
s = s.replace(from, () => "  `invoice.bank_details_missing` et `sellerComplete` faux (alerte de la page Factures de l'admin). Guide du porteur\n  de projet : `GUIDE_STRIPE_CONNECT.md` (mode test, relais `stripe listen` = téléchargement à faire valider, scénario\n  d'essai : les formulaires d'identité Stripe et la saisie de carte sont faits PAR LUI). Reste : essai réel avec\n  les clés de test\n");
fs.writeFileSync(f, s);
console.log('ok');
