// Test : l'IBAN configuré est figé avec la facture de pénalité.
const fs = require('fs');
const f = 'C:/xlcab/xlcab_backend/src/line-bookings/line-bookings.integration.spec.ts';
let s = fs.readFileSync(f, 'utf8');
const a = "      const issuedAt = new Date(start + 39 * DAY);\n      expect((await rescue.tick(issuedAt)).penaltiesInvoiced).toBe(1);\n      const invoice = db.invoice.rows[0];";
if (!s.includes(a)) throw new Error('ancre');
s = s.replace(a, () => "      const issuedAt = new Date(start + 39 * DAY);\n      // IBAN d'exemple (documentation bancaire), renseigné par le porteur de projet en vrai.\n      process.env.INVOICE_SELLER_IBAN = 'FR76 3000 6000 0112 3456 7890 189';\n      expect((await rescue.tick(issuedAt)).penaltiesInvoiced).toBe(1);\n      delete process.env.INVOICE_SELLER_IBAN;\n      const invoice = db.invoice.rows[0];\n      // Compte à créditer figé avec la facture : le chauffeur sait où virer.\n      expect(invoice.seller.bank).toEqual({ iban: 'FR7630006000011234567890189', bic: null });");
fs.writeFileSync(f, s);
console.log('ok');
