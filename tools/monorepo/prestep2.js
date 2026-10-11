// Étape 2, préparatifs : sortir de l'appli ce que passager et chauffeur partagent
// (routes, horloge, providers de la bourse, sélecteur d'adresse, liens légaux).
const fs = require('fs');
const APP = 'C:/xlcab/xlcab_app/';
const CORE = 'C:/xlcab/packages/core/lib/';
const UI = 'C:/xlcab/packages/ui/lib/';
const rd = (f) => fs.readFileSync(f, 'utf8');
const wr = (f, s) => fs.writeFileSync(f, s);
function cut(file, startMark, endMark) {
  const s = rd(file);
  const a = s.indexOf(startMark);
  const b = endMark === null ? s.length : s.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error(`repère introuvable dans ${file} : ${startMark}`);
  wr(file, s.slice(0, a) + s.slice(b));
  return s.slice(a, b).trimEnd() + '\n';
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.dart')) out.push(p);
  }
  return out;
}
const appFiles = [...walk(APP + 'lib'), ...walk(APP + 'test')];
function replaceImports(re, to, except = []) {
  let n = 0;
  for (const f of appFiles) {
    if (except.some((x) => f.endsWith(x))) continue;
    const s = rd(f);
    const t = s.replace(re, to);
    if (t !== s) { wr(f, t); n++; }
  }
  return n;
}

// a. Chemins de routes : dans core, chaque appli n'enregistre que les siennes.
const routes = cut(APP + 'lib/router.dart', '/// Chemins de routes nommés', '/// Fournit le GoRouter');
wr(CORE + 'routes.dart', routes);
wr(APP + 'lib/router.dart', rd(APP + 'lib/router.dart').replace("import 'package:xlcab_core/models/quote.dart';", "import 'package:xlcab_core/models/quote.dart';\nimport 'package:xlcab_core/routes.dart';"));
console.log('routes', replaceImports(/^import '(?:\.\.\/)+router\.dart';$/m, "import 'package:xlcab_core/routes.dart';"));

// b. Horloge injectable.
const clock = cut(APP + 'lib/providers/booking_provider.dart', '/// Horloge injectable', '/// Délai d\'anti-rebond');
wr(CORE + 'providers/clock_provider.dart', "import 'package:flutter_riverpod/flutter_riverpod.dart';\n\n" + clock);
wr(APP + 'lib/providers/booking_provider.dart', rd(APP + 'lib/providers/booking_provider.dart').replace("import '../services/booking_service.dart';", "import '../services/booking_service.dart';\n\nexport 'package:xlcab_core/providers/clock_provider.dart';").replace("import 'package:xlcab_core/models/shuttle.dart';", "import 'package:xlcab_core/models/shuttle.dart';\nimport 'package:xlcab_core/providers/clock_provider.dart';"));
console.log('horloge', replaceImports(/^import '[^']*booking_provider\.dart' show clockProvider;$/m, "import 'package:xlcab_core/providers/clock_provider.dart';"));

// c. Providers de la bourse (les deux côtés) et sélecteurs date / heure.
const market = cut(APP + 'lib/providers/operator_provider.dart', 'final marketFeedProvider', null);
wr(
  CORE + 'providers/market_provider.dart',
  "import 'package:flutter/material.dart';\nimport 'package:flutter_riverpod/flutter_riverpod.dart';\nimport '../models/market.dart';\nimport '../models/operator.dart';\nimport '../services/market_service.dart';\n\n// Bourse de transport : fil des demandes et propositions (opérateur),\n// demandes et devis (client), sélecteurs de date et d'heure injectables.\n\n" + market,
);
{
  const f = APP + 'lib/providers/operator_provider.dart';
  wr(f, rd(f).trimEnd() + "\n".replace('', '').concat('') );
  wr(f, rd(f).replace("import '../services/operator_service.dart';", "import '../services/operator_service.dart';\n\nexport 'package:xlcab_core/providers/market_provider.dart';"));
}
let n = 0;
for (const f of appFiles) {
  if (!/screens\/market\/|offer_messages_sheet\.dart$/.test(f)) continue;
  const s = rd(f);
  const t = s.replace(/^import '(?:\.\.\/)+providers\/operator_provider\.dart';$/m, "import 'package:xlcab_core/providers/market_provider.dart';");
  if (t !== s) { wr(f, t); n++; }
}
console.log('bourse', n);

// d. Sélecteur d'adresse : avec l'écran de recherche d'adresse.
const picker = cut(APP + 'lib/screens/booking/parcel_creation_screen.dart', '/// Choix d\'une adresse (injectable', '/// Choix de la date puis de l\'heure d\'enlèvement');
{
  const f = APP + 'lib/screens/booking/address_search_screen.dart';
  wr(f, rd(f).trimEnd() + '\n\n' + picker);
  const g = APP + 'lib/screens/booking/parcel_creation_screen.dart';
  if (!rd(g).includes("address_search_screen.dart'")) throw new Error('parcel_creation n\'importe pas address_search_screen');
  wr(g, rd(g).replace(/^(import '[^']*address_search_screen\.dart';)$/m, "$1\n\nexport 'address_search_screen.dart' show addressPickerProvider;"));
}
console.log('adresse', replaceImports(/^import '[^']*parcel_creation_screen\.dart' show addressPickerProvider;$/m, "import '../booking/address_search_screen.dart' show addressPickerProvider;"));

// e. Ouverture des liens légaux.
const legal = cut(APP + 'lib/screens/profile/profile_screen.dart', '/// Ouverture des liens légaux', '/// Écran 13');
wr(UI + 'widgets/legal_links.dart', "import 'package:flutter_riverpod/flutter_riverpod.dart';\nimport 'package:url_launcher/url_launcher.dart';\n\n" + legal);
{
  const f = APP + 'lib/screens/profile/profile_screen.dart';
  const s = rd(f);
  const first = s.match(/^import 'package:xlcab_ui\/[^']+';$/m);
  if (!first) throw new Error('profile_screen : import ui introuvable');
  wr(f, s.replace(first[0], "import 'package:xlcab_ui/widgets/legal_links.dart';\n" + first[0] + "\n\nexport 'package:xlcab_ui/widgets/legal_links.dart';"));
}
console.log('liens', replaceImports(/^import '[^']*profile_screen\.dart' show legalLinkOpenerProvider;$/m, "import 'package:xlcab_ui/widgets/legal_links.dart';"));
