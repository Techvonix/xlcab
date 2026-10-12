// Étape 3, préparatifs : choix d'apparence et de langue partagés par les deux applis (→ xlcab_ui).
const fs = require('fs');
const f = 'C:/xlcab/apps/passenger/lib/screens/profile/profile_screen.dart';
let s = fs.readFileSync(f, 'utf8');
const mark = "/// Langue de l'interface : celle du téléphone par défaut.";
const a = s.indexOf(mark);
if (a < 0) throw new Error('repère introuvable');
let block = s.slice(a).trimEnd() + '\n';
s = s.slice(0, a).trimEnd() + '\n';
for (const [from, to] of [['_LanguageSelector', 'LanguageSelector'], ['_ThemeSelector', 'ThemeSelector'], ['_ChoiceGroup', 'ChoiceGroup']]) {
  block = block.split(from).join(to);
  s = s.split(from).join(to);
}
block = block.replace('  const LanguageSelector();', '  const LanguageSelector({super.key});').replace('  const ThemeSelector();', '  const ThemeSelector({super.key});').replace('  const ChoiceGroup({required', '  const ChoiceGroup({super.key, required');
block = block.replace('class ThemeSelector extends', "/// Apparence : système, clair ou sombre (mémorisée sur l'appareil).\nclass ThemeSelector extends");
fs.writeFileSync(
  'C:/xlcab/packages/ui/lib/widgets/display_preferences.dart',
  `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/providers/locale_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'package:xlcab_core/services/account_service.dart';

import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

// Réglages d'affichage communs aux applications passager et chauffeur.

${block}`,
);
s = s.replace("import 'package:xlcab_ui/widgets/legal_links.dart';", "import 'package:xlcab_ui/widgets/display_preferences.dart';\nimport 'package:xlcab_ui/widgets/legal_links.dart';");
fs.writeFileSync(f, s);
console.log('ok');
