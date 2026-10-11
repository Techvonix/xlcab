// Étape 2 : adaptations des écrans passager à la barre à 5 onglets, et
// routeur de l'ancienne appli réduit aux écrans chauffeur (en attendant l'étape 3).
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

// Accueil : la barre du bas vient de la coquille ; l'espace chauffeur est dans l'autre appli.
edit('apps/passenger/lib/screens/home/home_screen.dart', [
  ['      bottomNavigationBar: const _HomeNavigationBar(),\n', ''],
  [/\nclass _HomeNavigationBar extends StatelessWidget \{[\s\S]*?\n\}\n/, ''],
  ['trajets et la barre de navigation.', 'trajets. La barre du bas est celle de la coquille (PassengerShell).'],
  // Le compte est un onglet : on y va, on ne l'empile pas.
  ['onPressed: () => context.push(AppRoutes.profile),', 'onPressed: () => context.go(AppRoutes.profile),'],
  ['onPressed: () => context.push(AppRoutes.driverOnboarding),', 'onPressed: () => showDriverAppInfo(context),'],
  ["import '../accessibility/accessibility_sheet.dart';", "import '../../widgets/driver_app_info.dart';\nimport '../accessibility/accessibility_sheet.dart';"],
  ['/// Accès à la candidature chauffeur, en attendant l\'écran Profil (écran 13)\n/// qui l\'accueillera aussi.', '/// Recrutement des chauffeurs : la candidature se fait dans l\'application XLCAB Driver.'],
]);

// Compte : une seule entrée « XLCAB Driver » pour les chauffeurs et les candidats.
edit('apps/passenger/lib/screens/profile/profile_screen.dart', [
  [
    "          if (auth.role == UserRole.driver)\n            tile(Icons.local_taxi_outlined, l10n.modeChauffeur, () => context.go(AppRoutes.driverMode)),\n          if (auth.role == UserRole.passenger)\n            tile(Icons.badge_outlined, l10n.devenirChauffeurXlcab, () => context.push(AppRoutes.driverOnboarding)),\n",
    "          // L'espace chauffeur et la candidature sont dans l'application XLCAB Driver.\n          if (auth.role == UserRole.driver)\n            tile(Icons.local_taxi_outlined, l10n.modeChauffeur, () => showDriverAppInfo(context)),\n          if (auth.role == UserRole.passenger)\n            tile(Icons.badge_outlined, l10n.devenirChauffeurXlcab, () => showDriverAppInfo(context)),\n",
  ],
  // L'historique est l'onglet Trajets.
  ['() => context.push(AppRoutes.tripHistory)', '() => context.go(PassengerTabs.trips)'],
  [/^(import 'package:xlcab_core\/routes\.dart';)$/m, "$1\nimport '../../widgets/driver_app_info.dart';"],
]);

// Ancienne appli : ne garde que les écrans chauffeur.
edit('xlcab_app/lib/router.dart', [
  [/import 'screens\/onboarding\/onboarding_screen\.dart';\n/, ''],
  [/import 'screens\/home\/home_screen\.dart';\n[\s\S]*?import 'screens\/corporate\/corporate_portal_screen\.dart';\n/, ''],
  [/import 'screens\/market\/line_search_screen\.dart';\n[\s\S]*?import 'screens\/market\/request_form_screen\.dart';\n/, ''],
  ["import 'package:xlcab_core/models/quote.dart';\n", ''],
  ["import 'package:xlcab_core/models/shuttle.dart';\n", ''],
  ["import 'package:xlcab_core/services/preferences_store.dart';\n", ''],
  [
    /      \/\/ Non connecté : vers la connexion[\s\S]*?      return null; \/\/ Pas de redirection nécessaire\.\n/,
    "      // Non connecté : vers la connexion, y compris depuis le splash.\n      if (!authState.isAuthenticated && (!isAuthRoute || state.matchedLocation == AppRoutes.splash)) {\n        return AppRoutes.login;\n      }\n\n      // Connecté : le mode chauffeur pour un compte chauffeur, sinon la candidature.\n      final landing = authState.role == UserRole.driver ? AppRoutes.driverMode : AppRoutes.driverOnboarding;\n      if (authState.isAuthenticated && isAuthRoute) return landing;\n\n      // Mode chauffeur et espace opérateur réservés aux chauffeurs (le serveur refuse de toute façon).\n      if (state.matchedLocation != AppRoutes.driverOnboarding && authState.role != UserRole.driver) {\n        return AppRoutes.driverOnboarding;\n      }\n\n      return null; // Pas de redirection nécessaire.\n",
  ],
  ["          state.matchedLocation == AppRoutes.onboarding ||\n", ''],
  [/      GoRoute\(\n        path: AppRoutes\.onboarding,[\s\S]*?      \),\n/, ''],
  [/      GoRoute\(\n        path: AppRoutes\.home,[\s\S]*?(      GoRoute\(\n        path: AppRoutes\.driverMode,)/, '$1'],
  [/      GoRoute\(path: AppRoutes\.market,[\s\S]*?(    \],\n  \);\n\}\);)/, '$1'],
  ['// Écrans — placeholders, à remplacer module par module (Partie 7).', '// Écrans chauffeur (les écrans passager sont dans apps/passenger).'],
]);
edit('xlcab_app/lib/main.dart', [
  ["import 'services/payment_service.dart';\n", ''],
  [/\n  \/\/ Paiement Stripe[^\n]*\n  await initStripe\(\);\n/, ''],
  [/    const ProviderScope\(\n      child: XlcabApp\(\),\n    \),/, "    ProviderScope(\n      child: XlcabApp(router: routerProvider, title: 'XLCAB Driver'),\n    ),"],
  ["import 'package:xlcab_ui/xlcab_app.dart';", "import 'package:xlcab_ui/xlcab_app.dart';\nimport 'router.dart';"],
]);
console.log('ok');
