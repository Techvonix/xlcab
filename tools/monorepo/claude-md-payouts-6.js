// CLAUDE.md : Stripe Connect, écrans de l'appli chauffeur.
const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from =
  "  l'horloge : mesurer depuis `nextAttemptAt`, pas depuis `Date.now()` (suite lente sous charge). Restent : écrans\n" +
  "  (appli chauffeur : compte de versement et reversements ; passager : feuilles de paiement ligne et bourse —\n" +
  "  `BookLineSheet` ignore encore `payment`, le statut d'offre `authorizing` n'est pas connu de l'appli ; admin :\n" +
  "  page des reversements), puis essai réel avec les clés de test.\n";
if (!s.includes(from)) throw new Error('ancre introuvable');
const to = [
  "  l'horloge : mesurer depuis `nextAttemptAt`, pas depuis `Date.now()` (suite lente sous charge). Écran chauffeur",
  '  fait (2026-10-13, `flutter analyze` propre, tests écrits non exécutables ici) : `core/models/payouts.dart`',
  '  (`PayoutAccount.blocksSelling`, `Payout`, `PayoutSummary`), `OperatorService.payoutAccount / payoutOnboardingLink /',
  '  payoutDashboardLink` (refuse tout lien non https) `/ payouts`, `payoutAccountProvider`, `payoutsProvider`,',
  '  `externalLinkOpenerProvider` (navigateur, injectable), `screens/operator/payouts_screen.dart` (route',
  '  `AppRoutes.driverPayouts` ; relit l\'état au retour au premier plan ; `PayoutAccountBanner` sur « Mes lignes »),',
  '  entrées depuis l\'onglet Revenus et le menu opérateur, part déjà retenue affichée dans « Mes annulations ». Clés',
  '  ARB `pay*`. Tests : `test/screens/payouts_screen_test.dart`. Restent : passager (feuilles de paiement ligne et',
  '  bourse — `BookLineSheet` ignore encore `payment`, le statut d\'offre `authorizing` n\'est pas connu de l\'appli),',
  '  admin (page des reversements), puis essai réel avec les clés de test.',
  '',
].join('\n');
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
