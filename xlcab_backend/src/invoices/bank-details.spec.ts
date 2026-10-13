import { renderInvoicePdf, paymentInstruction } from './invoice-pdf';
import { bankDetailsFrom, formatIban, isValidBic, isValidIban, normalizeIban } from './bank-details';

// IBAN d'exemple publiés (ISO 13616 / documentation bancaire), pas de vrais comptes.
const FR = 'FR76 3000 6000 0112 3456 7890 189';
const IE = 'IE29 AIBK 9311 5212 3456 78';

describe('Coordonnées bancaires du vendeur', () => {
  it('valide un IBAN par sa structure et sa clé de contrôle', () => {
    expect(isValidIban(FR)).toBe(true);
    expect(isValidIban(IE)).toBe(true);
    expect(isValidIban(FR.toLowerCase())).toBe(true);
    // Un chiffre changé : la clé ne tombe plus juste.
    expect(isValidIban('FR76 3000 6000 0112 3456 7890 188')).toBe(false);
    expect(isValidIban('FR76 3000')).toBe(false);
    expect(isValidIban('pas un iban')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('normalise et met en forme', () => {
    expect(normalizeIban(' fr76 3000 6000 0112 3456 7890 189 ')).toBe('FR7630006000011234567890189');
    expect(formatIban('FR7630006000011234567890189')).toBe(FR);
  });

  it('BIC : 8 ou 11 caractères', () => {
    expect(isValidBic('AGRIFRPP')).toBe(true);
    expect(isValidBic('agrifrpp882')).toBe(true);
    expect(isValidBic('AGRI')).toBe(false);
  });

  it('IBAN absent ou erroné : aucune coordonnée (jamais un IBAN faux sur une facture)', () => {
    const from = (env: Record<string, string>) => bankDetailsFrom((k) => env[k]);
    expect(from({})).toBeNull();
    expect(from({ INVOICE_SELLER_IBAN: 'FR76 3000 6000 0112 3456 7890 188' })).toBeNull();
    expect(from({ INVOICE_SELLER_IBAN: FR })).toEqual({ iban: 'FR7630006000011234567890189', bic: null });
    expect(from({ INVOICE_SELLER_IBAN: FR, INVOICE_SELLER_BIC: 'agri fr pp' })).toEqual({ iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP' });
    // BIC erroné : omis, l'IBAN reste.
    expect(from({ INVOICE_SELLER_IBAN: FR, INVOICE_SELLER_BIC: 'XX' })).toEqual({ iban: 'FR7630006000011234567890189', bic: null });
  });

  describe('mention de règlement sur la facture', () => {
    const base = { number: 'FA-2026-000042', kind: 'invoice' as const, paymentStatus: 'due' as const, dueDate: new Date('2026-11-20T12:00:00Z') };

    it('facture à régler : IBAN, BIC et numéro de facture à rappeler', () => {
      const text = paymentInstruction({ ...base, seller: { name: 'XLCAB', lines: [], bank: { iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP' } } });
      expect(text).toContain('par virement');
      expect(text).toContain(`IBAN ${FR}`);
      expect(text).toContain('BIC AGRIFRPP');
      expect(text).toContain('FA-2026-000042');
    });

    it('sans coordonnées bancaires : mention simple, comme avant', () => {
      const text = paymentInstruction({ ...base, seller: { name: 'XLCAB', lines: [] } });
      expect(text).toMatch(/^À régler avant le .* par virement\.$/);
      expect(text).not.toContain('IBAN');
    });

    it('facture acquittée ou avoir : jamais de coordonnées bancaires', () => {
      const bank = { iban: 'FR7630006000011234567890189', bic: null };
      expect(paymentInstruction({ ...base, paymentStatus: 'paid', seller: { name: 'XLCAB', lines: [], bank } })).not.toContain('IBAN');
      expect(paymentInstruction({ ...base, kind: 'credit_note', seller: { name: 'XLCAB', lines: [], bank } })).not.toContain('IBAN');
    });

    it('le PDF se génère avec les coordonnées bancaires', async () => {
      const pdf = await renderInvoicePdf({
        ...base, issuedAt: new Date('2026-10-20T12:00:00Z'),
        seller: { name: 'XLCAB France SAS', lines: ['1 rue Exemple'], bank: { iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP' } },
        buyer: { name: 'Djamel Test', lines: [] },
        lines: [{ description: 'Pénalité d’annulation tardive', quantity: 1, unitCents: 21500, regime: 'penalty', vatRate: 0, vatCents: 0, totalCents: 21500 }],
        subtotalCents: 21500, vatCents: 0, totalCents: 21500, currency: 'EUR', mentions: [],
      });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    });
  });
});
