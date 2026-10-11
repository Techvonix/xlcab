import { describe, expect, it } from 'vitest';
import { invoice } from '@/test/fixtures';
import { invoiceToCsv, invoiceToPdf } from './export';
import { formatEuros, formatMonth } from './format';

describe('export CSV du relevé', () => {
  const csv = invoiceToCsv(invoice);
  const rows = csv.replace('﻿', '').trim().split('\r\n');

  it('BOM UTF-8 et séparateur ";" (Excel en français)', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(rows[0].split(';')).toContain('TVA marchandises');
  });

  it('TVA personnes (0 %) et marchandises (20 %) dans des colonnes séparées', () => {
    const header = rows[0].split(';');
    const line = rows[1].split(';');
    const col = (name: string) => line[header.indexOf(name)];
    expect(col('HT transport personnes')).toBe('203,10');
    expect(col('Taux TVA personnes')).toBe('0 %');
    expect(col('HT marchandises')).toBe('8,00');
    expect(col('Taux TVA marchandises')).toBe('20 %');
    expect(col('TVA marchandises')).toBe('1,60');
    expect(col('Total TTC')).toBe('212,70');
  });

  it('ligne de total = courses facturables uniquement', () => {
    const total = rows.at(-1)!.split(';');
    expect(total[0]).toBe('TOTAL FACTURABLE');
    expect(total.at(-1)).toBe('212,70');
  });

  it('neutralise l’injection de formule et protège les ";"', () => {
    expect(rows[2]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(rows[2]).toContain('"Lille; centre"');
  });
});

describe('export PDF du relevé', () => {
  it('produit un PDF avec en-tête, lignes et mention de TVA', () => {
    const doc = invoiceToPdf(invoice);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const text = doc.output();
    expect(text).toContain('%PDF-');
    expect(text).toContain('ACME SAS');
    expect(text).toContain('261-4-4');
  });
});

describe('formats', () => {
  it('montants et mois en français', () => {
    expect(formatEuros(12150).replace(/\s/g, ' ')).toBe('121,50 €');
    expect(formatMonth('2026-10')).toBe('octobre 2026');
  });
});
