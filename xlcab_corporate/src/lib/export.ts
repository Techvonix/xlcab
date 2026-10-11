import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatAmount, formatDateTime, formatEuros, formatMonth, statusLabel } from './format';
import { shuttleLabel, type Invoice } from './types';
import { t } from '@/lib/i18n';

// Exports du relevé mensuel (Partie 9, Module 9) : "export CSV/PDF avec
// séparation TVA transport personnes (0 %) / marchandises (20 %)".
//
// Ce relevé n'est pas une facture au sens légal : la facture officielle
// (numérotation continue, mentions XLCAB France SAS, n° REVTC…) doit être
// émise côté serveur.

const VAT_NOTE =
  t('tvaTransportDePersonnesExonere') +
  t('seulesLesCoursesTermineesSont2');

const rate = (r: number | null) => (r == null ? '' : `${r} %`);

const HEADERS = [
  t('date'),
  t('collaborateur'),
  t('centreDeCout'),
  t('depart'),
  t('arrivee'),
  t('navette'),
  t('statut'),
  t('facturable'),
  t('htTransportPersonnes'),
  t('tauxTvaPersonnes'),
  t('tvaPersonnes'),
  t('htMarchandises'),
  t('tauxTvaMarchandises'),
  t('tvaMarchandises'),
  t('totalTtc'),
];

/** Protège une cellule CSV (séparateur, guillemets) et neutralise les formules (injection CSV). */
function csvCell(value: string): string {
  let v = value;
  // Une adresse commençant par = + - @ serait exécutée comme formule par
  // Excel : on la préfixe d'une apostrophe (recommandation OWASP).
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV pour Excel en français : séparateur ";", virgule décimale, BOM
 * UTF-8 (sans lui, Excel affiche mal les accents).
 */
export function invoiceToCsv(invoice: Invoice): string {
  const rows = invoice.lines.map((l) => [
    formatDateTime(l.date),
    l.passengerName,
    l.costCenter ?? '',
    l.originAddress,
    l.destinationAddress,
    shuttleLabel(l.shuttleType),
    statusLabel(l.status),
    l.billable ? 'oui' : 'non',
    formatAmount(l.passengerHtCents),
    rate(l.passengerVatRate),
    formatAmount(l.passengerVatCents),
    formatAmount(l.parcelHtCents),
    rate(l.parcelVatRate),
    formatAmount(l.parcelVatCents),
    formatAmount(l.totalTtcCents),
  ]);
  const totals = invoice.totals;
  const total = [
    t('totalFacturable'), t('courseS2', { billableTrips: totals.billableTrips }), '', '', '', '', '', '',
    formatAmount(totals.passengerHtCents), '', formatAmount(totals.passengerVatCents),
    formatAmount(totals.parcelHtCents), '', formatAmount(totals.parcelVatCents),
    formatAmount(totals.totalTtcCents),
  ];
  const lines = [HEADERS, ...rows, total].map((r) => r.map(csvCell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** PDF paysage : en-tête entreprise, tableau des courses, totaux par régime de TVA. */
export function invoiceToPdf(invoice: Invoice): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const c = invoice.company;

  doc.setFontSize(16);
  doc.text(t('releveDeCoursesXlcab', { value1: formatMonth(invoice.month) }), 14, 16);
  doc.setFontSize(10);
  const header = [
    c.name,
    c.siret ? t('siret', { siret: c.siret }) : null,
    c.vatNumber ? t('tvaIntracommunautaire2', { vatNumber: c.vatNumber }) : null,
    c.billingAddress,
    c.billingEmail,
  ].filter(Boolean) as string[];
  doc.text(header, 14, 24);

  autoTable(doc, {
    startY: 24 + header.length * 5 + 4,
    head: [[t('date'), t('collaborateur'), t('trajet'), t('statut'), t('htPersonnes'), t('tvaPers'), t('htMarchandises'), t('tvaMarch'), 'TTC']],
    body: invoice.lines.map((l) => [
      formatDateTime(l.date),
      l.passengerName + (l.costCenter ? `\n${l.costCenter}` : ''),
      `${l.originAddress}\n→ ${l.destinationAddress}`,
      statusLabel(l.status) + (l.billable ? '' : t('nonFacturee2')),
      formatEuros(l.passengerHtCents),
      `${formatEuros(l.passengerVatCents)} (${rate(l.passengerVatRate) || '—'})`,
      formatEuros(l.parcelHtCents),
      `${formatEuros(l.parcelVatCents)} (${rate(l.parcelVatRate) || '—'})`,
      formatEuros(l.totalTtcCents),
    ]),
    foot: [[
      t('totalFacturable2'), t('courseS2', { billableTrips: invoice.totals.billableTrips }), '', '',
      formatEuros(invoice.totals.passengerHtCents), formatEuros(invoice.totals.passengerVatCents),
      formatEuros(invoice.totals.parcelHtCents), formatEuros(invoice.totals.parcelVatCents),
      formatEuros(invoice.totals.totalTtcCents),
    ]],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [14, 116, 144] }, // #0E7490, cyan profond de la marque (contraste AA avec le blanc)
    footStyles: { fillColor: [248, 249, 250], textColor: [18, 18, 18], fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(VAT_NOTE, 260), 14, y);
  doc.text(t('documentRecapitulatifNeVautPas'), 14, y + 8);
  return doc;
}

/** Déclenche le téléchargement d'un fichier généré dans le navigateur. */
export function download(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
