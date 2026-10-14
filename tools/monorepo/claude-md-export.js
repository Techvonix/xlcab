const fs = require('fs');
const f = 'C:/xlcab/CLAUDE.md';
let s = fs.readFileSync(f, 'utf8');
const from = "  `trip_history_screen.dart` (paginé, détail = écran 8), `payment_methods_screen.dart` (cartes Stripe,\n  ajout via `PaymentSheetPresenter.presentSetup`). Thème mémorisé dans Hive (boîte `prefs`,\n  `PreferencesStore`, écrit par `app.dart`). Photo de profil, adresses favorites et export dans\n  l'app non faits.\n";
if (!s.includes(from)) throw new Error('ancre');
const to = "  `trip_history_screen.dart` (paginé, détail = écran 8), `payment_methods_screen.dart` (cartes Stripe,\n  ajout via `PaymentSheetPresenter.presentSetup`). Thème mémorisé dans Hive (boîte `prefs`,\n  `PreferencesStore`, écrit par `app.dart`). Photo de profil non faite. Export RGPD dans les DEUX applis\n  (2026-10-14) : `src/users/export-link.ts` — `POST /users/me/export/link` (quota du jour vérifié AVANT, pour\n  que le 429 s'affiche dans l'app) renvoie un lien `GET /users/export/file?token=` de 5 min, À USAGE UNIQUE\n  (nonce dans Redis `users:export:link:{nonce}`), jeton `{userId}.{expiration}.{nonce}.{HMAC}` (clé dérivée de\n  JWT_SECRET, rien en base), fichier `xlcab-mes-donnees-AAAA-MM-JJ.json` en pièce jointe, no-store ; compte\n  supprimé = 401. App : `AccountService.exportLink()`, tuile partagée `xlcab_ui/widgets/data_export.dart`\n  (`DataExportTile` : explication, puis navigateur via `legalLinkOpenerProvider`) dans le Compte passager et le\n  Profil chauffeur. Clés ARB `exp*`.\n";
fs.writeFileSync(f, s.replace(from, () => to));
console.log('ok');
