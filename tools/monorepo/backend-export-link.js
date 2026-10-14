// Export RGPD depuis l'app : lien signé à usage unique (src/users/export-link.ts).
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}
edit('src/users/users.service.ts', [
  ['const EXPORTS_PER_DAY = 5;', "export const EXPORTS_PER_DAY = 5;\n/** Compteur d'exports du jour (partagé avec le lien de téléchargement de l'app). */\nexport const exportRateKey = (userId: string) => `users:export:rate:${userId}`;"],
  ['    const key = `users:export:rate:${user.sub}`;', '    const key = exportRateKey(user.sub);'],
]);
edit('src/users/users.module.ts', [
  ["import { UserSettingsController, UserSettingsService } from './user-settings';", "import { UserSettingsController, UserSettingsService } from './user-settings';\nimport { ExportFileController, ExportLinkController, ExportLinkService } from './export-link';"],
  ['  controllers: [UsersController, UserSettingsController],\n  providers: [UsersService, UserSettingsService],', '  controllers: [UsersController, UserSettingsController, ExportLinkController, ExportFileController],\n  providers: [UsersService, UserSettingsService, ExportLinkService],'],
]);
edit('src/i18n/messages.en.ts', [
  ["  'Reversement introuvable': 'Payout not found',", "  'Reversement introuvable': 'Payout not found',\n  'Lien expiré ou déjà utilisé : relancez le téléchargement depuis l’application': 'Link expired or already used: start the download again from the app',"],
]);
console.log('ok');
