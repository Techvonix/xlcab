// Étape 3 : l'écran « mode chauffeur » devient l'onglet Aujourd'hui ; revenus,
// départs et profil passent dans leurs onglets.
const fs = require('fs');
const R = 'C:/xlcab/apps/driver/lib/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = typeof from === 'string' ? s.split(from).join(to) : s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('screens/driver/driver_mode_screen.dart', [
  [
    /        title: Text\(l10n\.modeChauffeur\),\n        automaticallyImplyLeading: false,\n        actions: \[[\s\S]*?\n        \],\n      \),\n      body: Stack\(/,
    "        // Onglet « Aujourd'hui » : revenus, départs et profil ont leur propre onglet.\n        title: Text(l10n.aujourdHui),\n        automaticallyImplyLeading: false,\n      ),\n      body: Stack(",
  ],
  [
    /      section\(l10n\.revenus\),\n      _EarningsCard\(earnings: state\.earnings\),\n[\s\S]*?        const OperatorEntries\(\),\n      \],\n    \];/,
    '    ];',
  ],
  ['class _EarningsCard extends StatelessWidget {\n  const _EarningsCard({required this.earnings});', "/// Revenus du jour, de la semaine et du mois (onglet Revenus).\nclass EarningsCard extends StatelessWidget {\n  const EarningsCard({super.key, required this.earnings});"],
]);

edit('screens/operator/operator_section.dart', [
  ['class _AssignmentTile extends StatelessWidget {\n  const _AssignmentTile({required this.assignment});', "/// Un départ de ligne que j'assure : ouvre sa liste d'embarquement.\nclass AssignmentTile extends StatelessWidget {\n  const AssignmentTile({super.key, required this.assignment});"],
  ['_AssignmentTile(assignment: a)', 'AssignmentTile(assignment: a)'],
]);

// Candidature : un candidat n'a pas d'autre écran, il lui faut la déconnexion.
edit('screens/driver/driver_onboarding_screen.dart', [
  ['appBar: AppBar(title: Text(l10n.devenirChauffeur)),', 'appBar: AppBar(title: Text(l10n.devenirChauffeur), actions: const [SignOutAction()]),'],
  [
    '/// Dossier envoyé ou déjà validé : plus de formulaire.',
    "/// Déconnexion depuis la candidature (seule sortie d'un compte pas encore chauffeur).\nclass SignOutAction extends ConsumerWidget {\n  const SignOutAction({super.key});\n\n  @override\n  Widget build(BuildContext context, WidgetRef ref) => IconButton(\n        tooltip: l10n.seDeconnecter,\n        icon: const Icon(Icons.logout),\n        onPressed: () => ref.read(authProvider.notifier).signOut(),\n      );\n}\n\n/// Dossier envoyé (« en cours de vérification » : passage en ligne impossible\n/// tant que l'équipe XLCAB n'a pas validé) ou déjà validé : plus de formulaire.",
  ],
  [/^(import 'package:flutter_riverpod\/flutter_riverpod\.dart';)$/m, "$1\nimport 'package:xlcab_core/providers/auth_provider.dart';"],
]);
console.log('ok');
