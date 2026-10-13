// Déplace _pay dans la feuille de réservation et complète le libellé de statut côté chauffeur.
const fs = require('fs');
const f = 'C:/xlcab/apps/passenger/lib/screens/market/line_search_screen.dart';
let s = fs.readFileSync(f, 'utf8');
const start = s.indexOf('  /// Feuille de paiement Stripe. Abandon ou refus');
const end = s.indexOf('  @override\n  Widget build(BuildContext context) {', start);
if (start < 0 || end < 0) throw new Error('bloc _pay introuvable');
const block = s.slice(start, end);
s = s.slice(0, start) + s.slice(end);
const sheet = s.indexOf('class _BookLineSheetState');
const build = s.indexOf('  @override\n  Widget build(BuildContext context) {', sheet);
if (sheet < 0 || build < 0) throw new Error('feuille introuvable');
s = s.slice(0, build) + block + s.slice(build);
fs.writeFileSync(f, s);
console.log('ok');
