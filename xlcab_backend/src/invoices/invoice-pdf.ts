import PDFDocument = require('pdfkit');
import { BankDetails, formatIban } from './bank-details';

export interface Party {
  name: string;
  lines: string[]; // adresse, identifiants (SIREN, TVA…), e-mail
  /** Vendeur d'une facture à régler par virement : compte à créditer, figé avec la facture. */
  bank?: BankDetails | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
  regime: string; // passenger | parcel | cancellation | refund
  vatRate: number;
  vatCents: number;
  totalCents: number;
}

export interface InvoiceDocument {
  number: string;
  kind: 'invoice' | 'credit_note';
  issuedAt: Date;
  seller: Party;
  buyer: Party;
  lines: InvoiceLine[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  paymentStatus: 'paid' | 'due';
  dueDate?: Date | null;
  creditedNumber?: string | null;
  periodLabel?: string | null;
  /** Mentions légales en pied de facture (exonérations, pénalités…). */
  mentions: string[];
}

// Les polices standard PDF (Helvetica) ne couvrent que le jeu WinAnsi :
// on remplace les rares caractères hors jeu (flèches, espaces fines).
const sanitize = (s: string) =>
  s
    .replace(/→/g, '->')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7E -ÿ€’‘“”–—…œŒ]/g, '?');

/**
 * Mention de règlement. Facture à régler : compte à créditer et numéro de
 * facture à rappeler dans le libellé du virement, quand l'IBAN du vendeur
 * est configuré.
 */
export function paymentInstruction(doc: Pick<InvoiceDocument, 'number' | 'kind' | 'paymentStatus' | 'dueDate' | 'seller'>): string {
  if (doc.kind === 'credit_note') return 'Remboursement effectué sur le moyen de paiement utilisé.';
  if (doc.paymentStatus === 'paid') return 'Facture acquittée : réglée par carte bancaire à la réservation.';
  const due = `À régler avant le ${doc.dueDate ? date(doc.dueDate) : '—'} par virement`;
  const bank = doc.seller.bank;
  if (!bank) return `${due}.`;
  return `${due} sur le compte IBAN ${formatIban(bank.iban)}${bank.bic ? ` (BIC ${bank.bic})` : ''}, en rappelant le numéro ${doc.number} dans le libellé.`;
}

/** 123456 → « 1 234,56 € » (espace normale : compatible WinAnsi). */
export function euros(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${int},${String(abs % 100).padStart(2, '0')} €`;
}

const date = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);

/**
 * Symbole XLCAB (identité « Orbite »), vectoriel, carré de `size` points.
 * Géométrie identique à brand/xlcab-symbole.svg (voir brand/README.md).
 */
function drawSymbol(pdf: PDFKit.PDFDocument, x: number, y: number, size: number) {
  pdf.save().translate(x, y).scale(size / 120);
  // Identité Orbite, couleurs du fond clair : anneau, X (un trait continu,
  // deux segments arrêtés au croisement), point satellite.
  pdf.circle(60, 60, 53).lineWidth(4).stroke('#0E7490');
  pdf.lineWidth(10.5).lineCap('round');
  pdf.moveTo(32, 32).lineTo(88, 88).stroke('#0E7490');
  pdf.moveTo(88, 32).lineTo(69, 51).stroke('#0E7490');
  pdf.moveTo(32, 88).lineTo(51, 69).stroke('#0E7490');
  pdf.circle(104, 30.5, 8.5).fill('#A21CAF');
  pdf.restore();
  pdf.fillColor('#000000').strokeColor('#000000').lineWidth(1).lineCap('butt');
}

/** Génère le PDF (A4) d'une facture ou d'un avoir. */
export function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${doc.kind === 'invoice' ? 'Facture' : 'Avoir'} ${doc.number}`, Author: doc.seller.name } });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    const t = (s: string) => sanitize(s);
    const left = 48;
    const width = pdf.page.width - 96;

    // En-tête : symbole XLCAB et vendeur à gauche, titre et numéro à droite.
    drawSymbol(pdf, left, 46, 30);
    pdf.font('Helvetica-Bold').fontSize(16).text(t(doc.seller.name), left + 40, 48);
    pdf.font('Helvetica').fontSize(9);
    doc.seller.lines.forEach((l) => pdf.text(t(l)));
    pdf.font('Helvetica-Bold').fontSize(18).text(doc.kind === 'invoice' ? 'FACTURE' : 'AVOIR', left, 48, { width, align: 'right' });
    pdf.font('Helvetica').fontSize(10)
      .text(`N° ${t(doc.number)}`, { width, align: 'right' })
      .text(`Date : ${date(doc.issuedAt)}`, { width, align: 'right' });
    if (doc.creditedNumber) pdf.text(t(`Annule et remplace partiellement la facture ${doc.creditedNumber}`), { width, align: 'right' });
    if (doc.periodLabel) pdf.text(t(`Période : ${doc.periodLabel}`), { width, align: 'right' });

    // Acheteur.
    pdf.moveDown(2);
    const buyerTop = Math.max(pdf.y, 150);
    pdf.font('Helvetica-Bold').fontSize(10).text('Facturé à', left + width / 2, buyerTop);
    pdf.font('Helvetica').text(t(doc.buyer.name), left + width / 2);
    doc.buyer.lines.forEach((l) => pdf.text(t(l), left + width / 2));

    // Tableau des lignes.
    const cols = [
      { label: 'Désignation', x: left, w: 230, align: 'left' as const },
      { label: 'Qté', x: left + 232, w: 30, align: 'right' as const },
      { label: 'PU HT', x: left + 264, w: 70, align: 'right' as const },
      { label: 'TVA', x: left + 336, w: 40, align: 'right' as const },
      { label: 'Montant TVA', x: left + 378, w: 60, align: 'right' as const },
      { label: 'Total TTC', x: left + 440, w: width - 440, align: 'right' as const },
    ];
    let y = Math.max(pdf.y, buyerTop + 70) + 24;
    pdf.font('Helvetica-Bold').fontSize(9);
    cols.forEach((c) => pdf.text(c.label, c.x, y, { width: c.w, align: c.align }));
    y += 14;
    pdf.moveTo(left, y).lineTo(left + width, y).stroke();
    y += 6;
    pdf.font('Helvetica').fontSize(9);
    for (const l of doc.lines) {
      const rowHeight = Math.max(pdf.heightOfString(t(l.description), { width: cols[0].w }), 12);
      if (y + rowHeight > pdf.page.height - 160) {
        pdf.addPage();
        y = 48;
      }
      const cells = [
        t(l.description),
        String(l.quantity),
        euros(l.unitCents),
        `${String(l.vatRate).replace('.', ',')} %`,
        euros(l.vatCents),
        euros(l.totalCents),
      ];
      cells.forEach((v, i) => pdf.text(v, cols[i].x, y, { width: cols[i].w, align: cols[i].align }));
      y += rowHeight + 6;
    }
    pdf.moveTo(left, y).lineTo(left + width, y).stroke();

    // Totaux, avec TVA ventilée par taux (Partie 11.4 : deux régimes).
    y += 10;
    const byRate = new Map<number, { base: number; vat: number }>();
    for (const l of doc.lines) {
      const r = byRate.get(l.vatRate) ?? { base: 0, vat: 0 };
      r.base += l.unitCents * l.quantity;
      r.vat += l.vatCents;
      byRate.set(l.vatRate, r);
    }
    const total = (label: string, value: string, bold = false) => {
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
      pdf.text(t(label), left + width - 260, y, { width: 170, align: 'right' });
      pdf.text(value, left + width - 90, y, { width: 90, align: 'right' });
      y += bold ? 16 : 13;
    };
    total('Total HT', euros(doc.subtotalCents));
    for (const [rate, r] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      total(`TVA ${String(rate).replace('.', ',')} % sur ${euros(r.base)}`, euros(r.vat));
    }
    total(doc.kind === 'invoice' ? 'Total TTC' : 'Total TTC remboursé', euros(doc.totalCents), true);

    // Règlement et mentions légales.
    y += 12;
    pdf.font('Helvetica').fontSize(9);
    pdf.text(t(paymentInstruction(doc)), left, y, { width });
    pdf.moveDown(0.8);
    pdf.fontSize(8).fillColor('#444444');
    doc.mentions.forEach((m) => pdf.text(t(m), { width }).moveDown(0.3));
    pdf.end();
  });
}
