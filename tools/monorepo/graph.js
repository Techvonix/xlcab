// Graphe des imports de xlcab_app/lib : vérifie un découpage en paquets.
// Usage : node graph.js <plan.json>   (plan = { "core": [motifs], "ui": [...], ... }, le reste = "app")
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/xlcab/xlcab_app/lib';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.dart')) out.push(p);
  }
  return out;
}

const files = walk(ROOT).map((f) => f.slice(ROOT.length + 1));
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const order = plan.__order;
function pkgOf(f) {
  for (const pkg of order) {
    for (const pat of plan[pkg]) {
      if (pat.endsWith('/') ? f.startsWith(pat) : f === pat) return pkg;
    }
  }
  return 'app';
}
const allowed = plan.__allowed; // { core: [], ui: ['core'], passenger: ['core','ui'], ... }
const ext = {};
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(ROOT + '/' + f, 'utf8');
  const from = pkgOf(f);
  const re = /^(?:import|export|part)\s+'([^']+)'/gm;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    let target = null;
    if (spec.startsWith('package:xlcab_app/')) target = spec.slice('package:xlcab_app/'.length);
    else if (spec.startsWith('package:')) {
      const name = spec.slice(8).split('/')[0];
      (ext[from] = ext[from] || {})[name] = ((ext[from] || {})[name] || 0) + 1;
      continue;
    } else if (spec.startsWith('dart:')) continue;
    else target = path.posix.normalize(path.posix.dirname(f) + '/' + spec);
    const to = pkgOf(target);
    if (to !== from && !(allowed[from] || []).includes(to)) {
      bad++;
      console.log(`INTERDIT ${from} -> ${to} : ${f} importe ${target}`);
    }
  }
}
const count = {};
for (const f of files) count[pkgOf(f)] = (count[pkgOf(f)] || 0) + 1;
console.log('fichiers par paquet', count);
console.log('violations', bad);
if (process.argv[3] === 'ext') for (const k of Object.keys(ext)) console.log(k, Object.keys(ext[k]).sort().join(' '));
if (process.argv[3] === 'list') for (const f of files) console.log(pkgOf(f).padEnd(10), f);
