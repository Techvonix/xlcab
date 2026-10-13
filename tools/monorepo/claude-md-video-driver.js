const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const anchor = '- Migrations : `init_xlcab` appliquée sur la base locale ; toute modification de';
if (!s.includes(anchor)) throw new Error('ancre');
const add = [
  '- Vidéos chauffeur retournées le 2026-10-13 (65 s chacune, mode Avion) : la prise `d1` passe maintenant par',
  '  Revenus → « Compte de versement et reversements » (tuile en 360 730, mêmes coordonnées en anglais) avec le',
  '  bonus de reprise de démo, puis Profil. Volet de notifications resté ouvert après le mode Avion : le refermer par',
  '  `adb shell cmd statusbar collapse` (jamais la touche Retour).',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(anchor, () => add + anchor));
console.log('ok');
