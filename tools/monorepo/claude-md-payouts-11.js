// Alerte admin (IBAN) et CLAUDE.md : IBAN du vendeur sur les factures à régler.
const fs = require('fs');
for (const [lang, from, to] of [
  ['fr', 'TVA intracommunautaire, n° REVTC). Renseignez', 'TVA intracommunautaire, n° REVTC) ou IBAN absent des factures à régler par virement. Renseignez'],
  ['en', 'EU VAT number, REVTC no.). Set', 'EU VAT number, REVTC no.) or IBAN missing from invoices payable by bank transfer. Set'],
]) {
  const f = `C:/xlcab/xlcab_admin/src/lib/i18n/${lang}.ts`;
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(from)) throw new Error(`${lang} : alerte introuvable`);
  fs.writeFileSync(f, s.replace(from, () => to));
}

const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  (`RescueService` : InvoicesService en dernier paramètre @Optional). L'IBAN de XLCAB ne figure pas sur la facture\n" +
  "  (pas de variable prévue) : à ajouter avec les mentions du vendeur. Reste : essai réel avec les clés de test\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  (`RescueService` : InvoicesService en dernier paramètre @Optional). IBAN du vendeur (2026-10-13) :",
  '  `INVOICE_SELLER_IBAN` / `INVOICE_SELLER_BIC` (à renseigner par le porteur de projet dans `.env.local`),',
  '  `src/invoices/bank-details.ts` (contrôle modulo 97 : un IBAN faux n\'est JAMAIS imprimé), figé dans',
  '  `Invoice.seller.bank` pour toute facture `due` (pénalités ET factures mensuelles d\'entreprise), mention',
  '  `paymentInstruction` du PDF (IBAN, BIC, numéro de facture à rappeler) ; absent → AuditLog',
  '  `invoice.bank_details_missing` et `sellerComplete` faux (alerte de la page Factures de l\'admin). Reste : essai',
  '  réel avec les clés de test',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
