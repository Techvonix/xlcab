// Ajoute aux deux ARB (packages/core/lib/l10n) les clés d'un fichier { cle: { fr, en, p? } }.
// Usage : node add-l10n.js <spec.json>   puis `flutter gen-l10n` dans packages/core.
const fs = require('fs');
const dir = 'C:/xlcab/packages/core/lib/l10n/';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const load = (l) => JSON.parse(fs.readFileSync(`${dir}app_${l}.arb`, 'utf8'));
const fr = load('fr');
const en = load('en');
let added = 0;
for (const [key, v] of Object.entries(spec)) {
  if (!(key in fr)) added++;
  fr[key] = v.fr;
  en[key] = v.en;
  if (v.p) {
    const placeholders = {};
    for (const [name, type] of Object.entries(v.p)) placeholders[name] = { type };
    fr[`@${key}`] = { placeholders };
  }
}
fs.writeFileSync(`${dir}app_fr.arb`, JSON.stringify(fr, null, 2) + '\n', 'utf8');
fs.writeFileSync(`${dir}app_en.arb`, JSON.stringify(en, null, 2) + '\n', 'utf8');
console.log(`clés ajoutées : ${added}`);
