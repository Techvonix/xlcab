// Factures à régler par virement : IBAN (et BIC) du vendeur, réglés par INVOICE_SELLER_IBAN / INVOICE_SELLER_BIC.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

edit('src/invoices/invoice-pdf.ts', [
  ["import PDFDocument = require('pdfkit');", "import PDFDocument = require('pdfkit');\nimport { BankDetails, formatIban } from './bank-details';"],
  [
    "  lines: string[]; // adresse, identifiants (SIREN, TVA…), e-mail\n}",
    "  lines: string[]; // adresse, identifiants (SIREN, TVA…), e-mail\n  /** Vendeur d'une facture à régler par virement : compte à créditer, figé avec la facture. */\n  bank?: BankDetails | null;\n}",
  ],
  [
    "    const payment =\n      doc.kind === 'credit_note'\n        ? 'Remboursement effectué sur le moyen de paiement utilisé.'\n        : doc.paymentStatus === 'paid'\n          ? 'Facture acquittée : réglée par carte bancaire à la réservation.'\n          : `À régler avant le ${doc.dueDate ? date(doc.dueDate) : '—'} par virement.`;\n    pdf.text(t(payment), left, y, { width });",
    "    pdf.text(t(paymentInstruction(doc)), left, y, { width });",
  ],
  [
    "/** 123456 → « 1 234,56 € »",
    "/**\n * Mention de règlement. Facture à régler : compte à créditer et numéro de\n * facture à rappeler dans le libellé du virement, quand l'IBAN du vendeur\n * est configuré.\n */\nexport function paymentInstruction(doc: Pick<InvoiceDocument, 'number' | 'kind' | 'paymentStatus' | 'dueDate' | 'seller'>): string {\n  if (doc.kind === 'credit_note') return 'Remboursement effectué sur le moyen de paiement utilisé.';\n  if (doc.paymentStatus === 'paid') return 'Facture acquittée : réglée par carte bancaire à la réservation.';\n  const due = `À régler avant le ${doc.dueDate ? date(doc.dueDate) : '—'} par virement`;\n  const bank = doc.seller.bank;\n  if (!bank) return `${due}.`;\n  return `${due} sur le compte IBAN ${formatIban(bank.iban)}${bank.bic ? ` (BIC ${bank.bic})` : ''}, en rappelant le numéro ${doc.number} dans le libellé.`;\n}\n\n/** 123456 → « 1 234,56 € »",
  ],
]);

edit('src/invoices/invoices.service.ts', [
  [
    "    const seller = this.seller();\n    const year = new Date().getUTCFullYear();",
    "    const seller = this.seller();\n    // Facture à régler par virement : compte à créditer, figé avec la facture.\n    if (input.kind === 'invoice' && input.paymentStatus === 'due') {\n      seller.bank = bankDetailsFrom((k) => this.config.get<string>(k));\n      if (!seller.bank) {\n        this.logger.warn('Facture à régler émise sans IBAN : INVOICE_SELLER_IBAN absent ou invalide');\n        await this.audit.log({ action: 'invoice.bank_details_missing', entity: 'Invoice', metadata: { customerUserId: input.customerUserId ?? null, corporateId: input.corporateId ?? null } });\n      }\n    }\n    const year = new Date().getUTCFullYear();",
  ],
]);
{
  const f = R + 'src/invoices/invoices.service.ts';
  let s = fs.readFileSync(f, 'utf8');
  const first = s.indexOf("import { ");
  s = s.slice(0, first) + "import { bankDetailsFrom } from './bank-details';\n" + s.slice(first);
  // sellerComplete : l'équipe est alertée tant que l'IBAN manque.
  const from = "['INVOICE_SELLER_LEGAL_FORM', 'INVOICE_SELLER_CAPITAL', 'INVOICE_SELLER_ADDRESS', 'INVOICE_SELLER_SIREN', 'INVOICE_SELLER_RCS', 'INVOICE_SELLER_VAT_NUMBER', 'INVOICE_SELLER_REVTC']\n      .every((k) => !!this.config.get<string>(k));";
  if (!s.includes(from)) throw new Error('sellerComplete introuvable');
  s = s.replace(from, () => from.replace(';', '') + ' && bankDetailsFrom((k) => this.config.get<string>(k)) !== null;');
  fs.writeFileSync(f, s);
}

edit('.env.example', [
  [
    'INVOICE_SELLER_EMAIL="facturation@xlcab.com"',
    'INVOICE_SELLER_EMAIL="facturation@xlcab.com"\n# Compte à créditer, imprimé sur les factures à régler par virement (entreprises,\n# pénalités). Un IBAN absent ou dont la clé est fausse n\'est jamais imprimé.\nINVOICE_SELLER_IBAN=""              # ex. FR76 3000 6000 0112 3456 7890 189\nINVOICE_SELLER_BIC=""               # facultatif, ex. AGRIFRPP',
  ],
]);
console.log('ok');
