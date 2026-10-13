// Le stockage sur disque n'accepte que des clés « uuid.ext » (pas de chemin possible) :
// la clé des PDF de facture portait le numéro de facture et était refusée hors tests.
const fs = require('fs');
const f = 'C:/xlcab/xlcab_backend/src/invoices/invoices.service.ts';
let s = fs.readFileSync(f, 'utf8');
const from = "    const key = `invoice-${invoice.number}-${randomUUID()}.pdf`;";
if (!s.includes(from)) throw new Error('motif');
s = s.replace(from, () => "    // Clé opaque « uuid.pdf » : seul format accepté par le stockage (jamais de nom lisible ni de chemin).\n    const key = `${randomUUID()}.pdf`;");
fs.writeFileSync(f, s);
console.log('ok');
