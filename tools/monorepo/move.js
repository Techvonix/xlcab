// Déplace des fichiers Dart entre paquets du monorepo et réécrit tous les imports.
// Usage : node move.js <etape.json> [--dry]
// etape.json = {
//   "packages": { "<nom de paquet Dart>": "<dossier depuis C:/xlcab>" , ... },   tous les paquets connus
//   "moves": [ { "from": "xlcab_app", "to": "xlcab_core", "paths": ["models/", "services/x.dart"],
//               "rename": { "screens/a.dart": "widgets/a.dart" } } ]
// }
// Les chemins sont relatifs au dossier lib/ du paquet. Les tests ne sont pas déplacés ici.
const fs = require('fs');
const path = require('path').posix;
const { execFileSync } = require('child_process');
const REPO = 'C:/xlcab';
const stage = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dry = process.argv.includes('--dry');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) {
      if (!['build', '.dart_tool', 'android', 'ios', 'node_modules'].includes(e.name)) walk(p, out);
    } else if (e.name.endsWith('.dart')) out.push(p);
  }
  return out;
}

// Inventaire : clé « paquet|chemin lib » → nouvel emplacement.
const libFiles = {}; // pkg -> [chemins relatifs à lib]
for (const [pkg, dir] of Object.entries(stage.packages)) {
  const root = `${REPO}/${dir}/lib`;
  libFiles[pkg] = walk(root).map((f) => f.slice(root.length + 1));
}
const dest = {}; // "pkg|rel" -> { pkg, rel }
for (const [pkg, list] of Object.entries(libFiles)) for (const rel of list) dest[`${pkg}|${rel}`] = { pkg, rel };
let moved = 0;
for (const mv of stage.moves) {
  for (const rel of libFiles[mv.from]) {
    const hit = mv.paths.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
    if (!hit) continue;
    dest[`${mv.from}|${rel}`] = { pkg: mv.to, rel: (mv.rename && mv.rename[rel]) || rel };
    moved++;
  }
}

// Réécriture des imports de tous les fichiers Dart (lib et test) de tous les paquets.
const DIRECTIVE = /^(import|export|part)(\s+)'([^']+)'/gm;
let rewritten = 0;
const outputs = []; // { oldAbs, newAbs, content, changed }
for (const [pkg, dir] of Object.entries(stage.packages)) {
  const base = `${REPO}/${dir}`;
  const all = [...walk(base + '/lib'), ...walk(base + '/test')];
  for (const abs of all) {
    const inLib = abs.startsWith(base + '/lib/');
    const rel = inLib ? abs.slice(base.length + 5) : null;
    const self = inLib ? dest[`${pkg}|${rel}`] : null;
    const src = fs.readFileSync(abs, 'utf8');
    const out = src.replace(DIRECTIVE, (whole, kw, sp, spec) => {
      let target = null; // clé d'origine
      let wasRelative = false;
      if (spec.startsWith('dart:')) return whole;
      if (spec.startsWith('package:')) {
        const [name, ...rest] = spec.slice(8).split('/');
        if (!stage.packages[name]) return whole;
        target = `${name}|${rest.join('/')}`;
      } else {
        if (!inLib) return whole; // import relatif entre fichiers de test : inchangé
        wasRelative = true;
        target = `${pkg}|${path.normalize(path.dirname(rel) + '/' + spec)}`;
      }
      const to = dest[target];
      if (!to) {
        if (!/generated\//.test(target)) console.log(`  ? cible inconnue : ${abs.slice(REPO.length + 1)} -> ${spec}`);
        return whole;
      }
      const fromPkg = self ? self.pkg : pkg;
      let next;
      if (self && to.pkg === fromPkg && wasRelative) {
        next = path.relative(path.dirname(self.rel), to.rel);
        if (!next.startsWith('.') && next.includes('/') === false) next = next; // même dossier
      } else {
        next = `package:${to.pkg}/${to.rel}`;
      }
      if (next === spec) return whole;
      rewritten++;
      return `${kw}${sp}'${next}'`;
    });
    const newAbs = self ? `${REPO}/${stage.packages[self.pkg]}/lib/${self.rel}` : abs;
    outputs.push({ oldAbs: abs, newAbs, content: out, changed: out !== src });
  }
}

console.log(`fichiers déplacés : ${moved}, imports réécrits : ${rewritten}`);
if (dry) process.exit(0);

for (const o of outputs) {
  if (o.newAbs !== o.oldAbs) {
    fs.mkdirSync(path.dirname(o.newAbs), { recursive: true });
    execFileSync('git', ['-C', REPO, 'mv', o.oldAbs.slice(REPO.length + 1), o.newAbs.slice(REPO.length + 1)]);
  }
  if (o.changed) fs.writeFileSync(o.newAbs, o.content);
}
console.log('terminé');
