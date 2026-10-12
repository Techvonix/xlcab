// Espace sécurité : branchement de la feuille de partage dans le suivi, de l'écran
// des contacts dans le compte et la navigation, et du SMS dans le manifeste Android.
const fs = require('fs');
const R = 'C:/xlcab/apps/passenger/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('lib/screens/tracking/tracking_screen.dart', [
  // Le bouton « Partager » ouvre la feuille de partage (lien de suivi en direct).
  ['onPressed: () => _share(context),', 'onPressed: () => showShareSheet(context, snapshot.tripId),'],
  [/\n  \/\/\/ Copie un résumé du trajet à envoyer à un proche\.[\s\S]*?\n  Future<void> _share\(BuildContext context\) async \{[\s\S]*?\n  \}\n\}/, '\n}'],
  ["import 'widgets/chat_sheet.dart';", "import 'widgets/chat_sheet.dart';\nimport 'widgets/share_sheet.dart';"],
  // Partage proposé de lui-même quand un chauffeur est engagé (option du compte).
  [
    '          Positioned.fill(child: mapBuilder(snapshot.origin, snapshot.destination, state.position)),\n',
    "          Positioned.fill(child: mapBuilder(snapshot.origin, snapshot.destination, state.position)),\n          if (snapshot.status == TripStatus.accepted || snapshot.status == TripStatus.started) AutoSharePrompt(tripId: tripId),\n",
  ],
]);

edit('lib/router.dart', [
  ["import 'screens/profile/trip_history_screen.dart';", "import 'screens/profile/trip_history_screen.dart';\nimport 'screens/profile/trusted_contacts_screen.dart';"],
  [
    '      GoRoute(path: AppRoutes.savedAddresses, builder: (context, state) => const SavedAddressesScreen()),\n',
    '      GoRoute(path: AppRoutes.savedAddresses, builder: (context, state) => const SavedAddressesScreen()),\n      GoRoute(path: AppRoutes.trustedContacts, builder: (context, state) => const TrustedContactsScreen()),\n',
  ],
]);

edit('lib/screens/profile/profile_screen.dart', [
  [
    /(          tile\(Icons\.star_outline_rounded, l10n\.adressesFavorites, \(\) => context\.push\(AppRoutes\.savedAddresses\)\),\n)/,
    '$1          tile(Icons.shield_outlined, l10n.secContacts, () => context.push(AppRoutes.trustedContacts)),\n',
  ],
]);

edit('android/app/src/main/AndroidManifest.xml', [
  [
    '        <!-- Liens légaux et partage du suivi ouverts dans le navigateur. -->\n',
    '        <!-- Partage du trajet : SMS déjà rédigé dans la messagerie du téléphone. -->\n        <intent>\n            <action android:name="android.intent.action.SENDTO"/>\n            <data android:scheme="sms"/>\n        </intent>\n        <!-- Liens légaux ouverts dans le navigateur. -->\n',
  ],
]);
console.log('ok');
