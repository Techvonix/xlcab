// Tests automatiques : Node 24, comme le poste de développement (Jest charge les paquets ESM de Nest par require(esm), Node >= 24.9).
const fs = require('fs');
const f = 'C:/xlcab/.github/workflows/tests.yml';
let s = fs.readFileSync(f, 'utf8');
const n = (s.match(/          node-version: 22\n/g) || []).length;
if (n !== 2) throw new Error('occurrences inattendues : ' + n);
s = s.split('          node-version: 22\n').join("          # 24 comme le poste de développement : les tests du serveur chargent les paquets ESM de\n          # NestJS par require(esm), que Jest ne sait faire qu'à partir de Node 24.9.\n          node-version: 24\n");
fs.writeFileSync(f, s);
console.log('ok');
