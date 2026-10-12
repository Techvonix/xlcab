import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/config/legal.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/account.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/display_preferences.dart';
import 'package:xlcab_ui/widgets/legal_links.dart';

/// Identité du compte connecté.
final driverAccountProvider = FutureProvider.autoDispose<UserProfile>((ref) => ref.watch(accountServiceProvider).me());

/// Onglet Profil : identité, documents chauffeur, profil opérateur,
/// apparence, langue, liens légaux et déconnexion.
class DriverProfileTab extends ConsumerWidget {
  const DriverProfileTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(driverAccountProvider);
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final lang = Localizations.localeOf(context).languageCode;

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
          child: Semantics(header: true, child: Text(title, style: AppTypography.caption.copyWith(color: muted))),
        );
    Widget tile(IconData icon, String label, VoidCallback onTap) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon),
          title: Text(label),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        );
    Future<void> open(String url) async {
      final messenger = ScaffoldMessenger.of(context);
      final ok = await ref.read(legalLinkOpenerProvider)(Uri.parse(url));
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l10n.impossibleDOuvrirLeLien)));
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profil), automaticallyImplyLeading: false),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          account.when(
            loading: () => SizedBox(height: 56, child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuProfil))),
            error: (e, _) => Row(children: [
              Expanded(child: Text(e is ApiException ? e.message : l10n.profilIndisponible)),
              TextButton(onPressed: () => ref.invalidate(driverAccountProvider), child: Text(l10n.reessayer)),
            ]),
            data: (p) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${p.firstName} ${p.lastName}'.trim(), style: AppTypography.h3.copyWith(color: scheme.onSurface)),
              Text(p.email, style: AppTypography.body.copyWith(color: muted)),
            ]),
          ),
          const SizedBox(height: AppSpacing.sm),
          tile(Icons.badge_outlined, l10n.drvMesDocuments, () => context.push(AppRoutes.driverOnboarding)),
          tile(Icons.business_outlined, l10n.opProfilOperateur, () => context.push(AppRoutes.operatorProfile)),
          section(l10n.preferences),
          const ThemeSelector(),
          const SizedBox(height: AppSpacing.md),
          const LanguageSelector(),
          section(l10n.informationsLegales),
          tile(Icons.privacy_tip_outlined, l10n.politiqueDeConfidentialite, () => open(privacyPolicyFor(lang))),
          tile(Icons.description_outlined, l10n.conditionsGeneralesCguCgv, () => open(termsFor(lang))),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.mail_outline),
            title: Text(l10n.protectionDesDonnees),
            subtitle: const Text(dpoEmail),
            onTap: () => open('mailto:$dpoEmail'),
          ),
          const SizedBox(height: AppSpacing.lg),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
            icon: const Icon(Icons.logout),
            label: Text(l10n.seDeconnecter),
            onPressed: () => ref.read(authProvider.notifier).signOut(),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(l10n.xlcabVersion(appVersion), textAlign: TextAlign.center, style: AppTypography.caption.copyWith(color: muted)),
        ],
      ),
    );
  }
}
