// Tests Flutter en échec → annotations GitHub et résumé du passage, lisibles sur la page du
// passage sans télécharger le journal (et sans être connecté à GitHub).
// Usage : node .github/scripts/flutter-failures.js <journal du reporter « expanded »>
//
// Le détail d'un échec est le cadre « ══╡ EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK ╞══ »
// imprimé AVANT la ligne « … [E] » du test (les tests tournent en parallèle) ; il se termine
// par une ligne de « ═ » et contient « The test description was: <nom du test> ».
const fs = require('fs');

const lines = fs.readFileSync(process.argv[2], 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
const found = [];
const titles = new Set();

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('══╡ EXCEPTION')) continue;
  const block = [];
  let j = i + 1;
  for (; j < lines.length && !/^═{5,}/.test(lines[j]); j++) block.push(lines[j]);
  i = j;
  const d = block.findIndex((x) => x.startsWith('The test description was:'));
  const title = (d >= 0 ? block[d + 1] ?? '' : '').trim() || 'Test en échec';
  const where = block.find((x) => /^\s+file:\/\/.*_test\.dart line \d+/.test(x));
  // Le message utile : avant la pile d'appels, plus le fichier et la ligne du test.
  const stop = block.findIndex((x) => x.startsWith('When the exception was thrown'));
  const message = (stop >= 0 ? block.slice(0, stop) : block.slice(0, 25)).filter((x) => x.trim());
  if (where) message.push(where.trim().replace(/^file:\/\/.*\/(test\/)/, '$1'));
  found.push({ title, body: message.join('\n').slice(0, 3000) });
  titles.add(title);
}

// Échecs sans cadre d'exception (délai dépassé, plantage au chargement) : le nom seul.
for (const line of lines) {
  if (!/^\d+:\d+ \+\d+.*\[E\]\s*$/.test(line)) continue;
  const name = line.replace(/^\d+:\d+ \+\d+( ~\d+)?( -\d+)?: /, '').replace(/\[E\]\s*$/, '').trim();
  if (![...titles].some((t) => name.endsWith(t))) {
    titles.add(name);
    found.push({ title: name.slice(0, 200), body: 'Échec sans détail dans le journal (délai dépassé ou erreur au chargement).' });
  }
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
