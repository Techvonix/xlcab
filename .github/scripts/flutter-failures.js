// Tests Flutter en échec → annotations GitHub et résumé du passage, lisibles sur la page du
// passage sans télécharger le journal (et sans être connecté à GitHub).
// Usage : node .github/scripts/flutter-failures.js <journal du reporter « expanded »>
const fs = require('fs');

const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
// Une ligne « 00:12 +5 -1: fichier: nom du test » par test, terminée par « [E] » quand il
// échoue ; l'erreur suit, jusqu'à la ligne de progression suivante.
const progress = /^\d+:\d+ \+\d+/;
const failures = [];
let current = null;
for (const line of lines) {
  if (progress.test(line)) {
    if (current) failures.push(current);
    current = line.trimEnd().endsWith('[E]') ? [line] : null;
  } else if (current && current.length < 40) {
    current.push(line);
  }
}
if (current) failures.push(current);

const seen = new Set();
const found = [];
for (const f of failures) {
  const title = f[0].replace(/^\d+:\d+ \+\d+( ~\d+)?( -\d+)?: /, '').replace(/\[E\]\s*$/, '').trim().slice(0, 200);
  if (seen.has(title)) continue;
  seen.add(title);
  found.push({ title, body: f.slice(1).filter((x) => x.trim()).join('\n').slice(0, 3000) });
}

const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
for (const { title, body } of found.slice(0, 10)) console.log(`::error title=${escProp(title)}::${esc(body)}`);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  let md = `## Tests en échec : ${found.length}\n\n`;
  for (const { title, body } of found) md += `### ${title}\n\n\`\`\`\n${body}\n\`\`\`\n\n`;
  fs.appendFileSync(summary, md, 'utf8');
}
