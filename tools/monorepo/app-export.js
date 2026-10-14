// Export RGPD dans les deux applis : service, tuile du Compte, doubles de test.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

edit('packages/core/lib/services/account_service.dart', [
  [
    '  Future<List<SavedCard>> cards() =>',
    `  /// Droit d'accès : lien de téléchargement de l'export (5 minutes, usage unique), à ouvrir dans le navigateur.
  Future<Uri> exportLink() => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/users/me/export/link');
        final url = Uri.tryParse(res.data?['url'] is String ? res.data!['url'] as String : '');
        // Jamais autre chose qu'une adresse web, quoi que réponde le serveur.
        if (url == null || !const {'https', 'http'}.contains(url.scheme) || url.host.isEmpty) throw const FormatException('lien');
        return url;
      });

  Future<List<SavedCard>> cards() =>`,
  ],
]);

edit('apps/passenger/lib/screens/profile/profile_screen.dart', [
  [
    "          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => _open(context, ref, termsFor(Localizations.localeOf(context).languageCode))),",
    "          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => _open(context, ref, termsFor(Localizations.localeOf(context).languageCode))),\n          const DataExportTile(),",
  ],
]);
edit('apps/driver/lib/screens/shell/driver_profile_tab.dart', [
  [
    '          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => open(termsFor(lang))),',
    '          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => open(termsFor(lang))),\n          const DataExportTile(),',
  ],
  ["import 'package:xlcab_ui/widgets/legal_links.dart';", "import 'package:xlcab_ui/widgets/data_export.dart';\nimport 'package:xlcab_ui/widgets/legal_links.dart';"],
]);
{
  const f = R + 'apps/passenger/lib/screens/profile/profile_screen.dart';
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes("widgets/legal_links.dart';")) throw new Error('import legal_links (passager)');
  s = s.replace("import 'package:xlcab_ui/widgets/legal_links.dart';", "import 'package:xlcab_ui/widgets/data_export.dart';\nimport 'package:xlcab_ui/widgets/legal_links.dart';");
  fs.writeFileSync(f, s);
}
console.log('ok');
