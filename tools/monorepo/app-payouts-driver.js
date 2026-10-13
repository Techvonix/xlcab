// Appli chauffeur : compte de versement et reversements (Stripe Connect).
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

edit('packages/core/lib/routes.dart', [
  ["  static const driverCancellations = '/driver/cancellations';", "  static const driverCancellations = '/driver/cancellations';\n  static const driverPayouts = '/driver/payouts';"],
]);

edit('packages/core/lib/models/operator.dart', [
  [
    '  const DriverPenalty({required this.id, required this.amountCents, required this.status, required this.contestUntil});',
    '  const DriverPenalty({required this.id, required this.amountCents, required this.status, required this.contestUntil, this.collectedCents = 0});',
  ],
  ['  final DateTime? contestUntil;\n}', "  final DateTime? contestUntil;\n\n  /// Part déjà retenue sur les reversements du chauffeur.\n  final int collectedCents;\n}"],
  ["              contestUntil: _date(p['contestUntil']),\n", "              contestUntil: _date(p['contestUntil']),\n              collectedCents: _int(p['collectedCents']) ?? 0,\n"],
]);

edit('apps/driver/lib/services/operator_service.dart', [
  ["import 'package:xlcab_core/models/operator.dart';", "import 'package:xlcab_core/models/operator.dart';\nimport 'package:xlcab_core/models/payouts.dart';"],
  [
    '  // ── Annulations et pénalités ──',
    `  // ── Compte de versement et reversements (Stripe Connect) ──

  Future<PayoutAccount> payoutAccount() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/payout-account');
        return PayoutAccount.fromJson(res.data);
      });

  /// Lien (usage unique, quelques minutes) vers les pages de Stripe où ouvrir ou compléter le compte.
  Future<Uri> payoutOnboardingLink() => _payoutLink('onboarding-link');

  /// Lien vers l'espace Stripe de l'opérateur (versements reçus, IBAN).
  Future<Uri> payoutDashboardLink() => _payoutLink('dashboard-link');

  Future<Uri> _payoutLink(String kind) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_me/payout-account/$kind');
        final url = Uri.tryParse(res.data?['url'] is String ? res.data!['url'] as String : '');
        // Jamais autre chose qu'une page web sécurisée, quoi que réponde le serveur.
        if (url == null || url.scheme != 'https' || url.host.isEmpty) throw const FormatException('lien');
        return url;
      });

  Future<PayoutSummary> payouts() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/payouts');
        return PayoutSummary.fromJson(res.data);
      });

  // ── Annulations et pénalités ──`,
  ],
]);

edit('apps/driver/lib/services/driver_device.dart', [
  [
    'final driverLauncherProvider = Provider<DriverLauncher>((ref) => UrlDriverLauncher());',
    "final driverLauncherProvider = Provider<DriverLauncher>((ref) => UrlDriverLauncher());\n\n/// Ouvre une page web dans le navigateur du téléphone (pages de Stripe du compte de versement).\ntypedef ExternalLinkOpener = Future<bool> Function(Uri url);\n\nfinal externalLinkOpenerProvider = Provider<ExternalLinkOpener>((ref) => (url) => launchUrl(url, mode: LaunchMode.externalApplication));",
  ],
]);

edit('apps/driver/lib/router.dart', [
  [
    '      GoRoute(path: AppRoutes.driverCancellations, builder: (context, state) => const CancellationsScreen()),',
    '      GoRoute(path: AppRoutes.driverCancellations, builder: (context, state) => const CancellationsScreen()),\n      GoRoute(path: AppRoutes.driverPayouts, builder: (context, state) => const PayoutsScreen()),',
  ],
  ["import 'screens/operator/cancellations_screen.dart';", "import 'screens/operator/cancellations_screen.dart';\nimport 'screens/operator/payouts_screen.dart';"],
]);

edit('apps/driver/lib/screens/operator/operator_section.dart', [
  [
    '        _Entry(icon: Icons.report_outlined, label: l10n.opMesAnnulations, route: AppRoutes.driverCancellations, onNavigate: onNavigate),',
    '        _Entry(icon: Icons.account_balance_outlined, label: l10n.payEntree, route: AppRoutes.driverPayouts, onNavigate: onNavigate),\n        _Entry(icon: Icons.report_outlined, label: l10n.opMesAnnulations, route: AppRoutes.driverCancellations, onNavigate: onNavigate),',
  ],
  ['/// Accès à l\'espace opérateur : lignes, bourse, annulations, profil.', '/// Accès à l\'espace opérateur : lignes, bourse, compte de versement, annulations, profil.'],
]);

edit('apps/driver/lib/screens/shell/earnings_tab.dart', [
  [
    '                  ListTile(\n                    contentPadding: EdgeInsets.zero,\n                    leading: const Icon(Icons.report_outlined),',
    '                  ListTile(\n                    contentPadding: EdgeInsets.zero,\n                    leading: const Icon(Icons.account_balance_outlined),\n                    title: Text(l10n.payEntree),\n                    trailing: const Icon(Icons.chevron_right),\n                    onTap: () => context.push(AppRoutes.driverPayouts),\n                  ),\n                  ListTile(\n                    contentPadding: EdgeInsets.zero,\n                    leading: const Icon(Icons.report_outlined),',
  ],
  ['/// Onglet Revenus : net du jour, de la semaine et du mois, courses récentes,\n/// et le suivi de mes annulations', '/// Onglet Revenus : net du jour, de la semaine et du mois, courses récentes,\n/// compte de versement et reversements, et le suivi de mes annulations'],
]);

edit('apps/driver/lib/screens/operator/my_lines_screen.dart', [
  ['                if (profile.valueOrNull != null) _ProfileBanner(profile: profile.value!),', '                if (profile.valueOrNull != null) _ProfileBanner(profile: profile.value!),\n                const PayoutAccountBanner(),'],
]);

edit('apps/driver/lib/screens/operator/cancellations_screen.dart', [
  [
    "                      style: AppTypography.bodyBold,\n                    ),\n                  ],",
    "                      style: AppTypography.bodyBold,\n                    ),\n                    if (c.penalty!.collectedCents > 0)\n                      Text(l10n.payPenaliteRecouvree(formatPrice(c.penalty!.collectedCents, locale: locale)), style: AppTypography.caption),\n                  ],",
  ],
]);

{
  const f = R + 'apps/driver/lib/providers/operator_provider.dart';
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes("models/payouts.dart")) {
    s = s.replace("import 'package:xlcab_core/models/operator.dart';", "import 'package:xlcab_core/models/operator.dart';\nimport 'package:xlcab_core/models/payouts.dart';");
    if (!s.includes("models/payouts.dart")) throw new Error('import providers');
  }
  s = s.trimEnd() + "\n\n/// Compte de versement (Stripe Connect) : état relu à chaque ouverture de l'écran et au retour du navigateur.\nfinal payoutAccountProvider = FutureProvider.autoDispose<PayoutAccount>((ref) => ref.watch(operatorServiceProvider).payoutAccount());\n\nfinal payoutsProvider = FutureProvider.autoDispose<PayoutSummary>((ref) => ref.watch(operatorServiceProvider).payouts());\n";
  fs.writeFileSync(f, s);
}
{
  // « Mes lignes » : import de la bannière.
  const f = R + 'apps/driver/lib/screens/operator/my_lines_screen.dart';
  let s = fs.readFileSync(f, 'utf8');
  const firstImport = s.indexOf("import '");
  s = s.slice(0, firstImport) + "import 'payouts_screen.dart' show PayoutAccountBanner;\n" + s.slice(firstImport);
  fs.writeFileSync(f, s);
}
console.log('ok');
