import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';

import '../../providers/driver_mode_provider.dart';
import '../../providers/operator_provider.dart';
import '../operator/operator_section.dart';

/// Onglet Départ : les départs de ligne que j'assure (un appui ouvre la liste
/// d'embarquement, le scan des passagers, le démarrage), puis mes lignes
/// régulières et la bourse de transport.
class DepartureTab extends ConsumerWidget {
  const DepartureTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final approved = ref.watch(driverModeProvider.select((s) => s.approved));
    final muted = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.75);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.depart), automaticallyImplyLeading: false),
      body: !approved
          // Compte pas encore validé : le serveur refuserait chaque appel.
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Text(l10n.drvCompteNonValide, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: muted)),
              ),
            )
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(assignmentsProvider);
                // L'erreur éventuelle est affichée par la liste elle-même.
                try {
                  await ref.read(assignmentsProvider.future);
                } catch (_) {}
              },
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  SectionTitle(l10n.opMesDepartsDeLigne),
                  ...ref.watch(assignmentsProvider).when(
                        loading: () => [
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.lg),
                            child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargement)),
                          ),
                        ],
                        error: (e, _) => [
                          Text(e is ApiException ? e.message : l10n.drvDepartsIndisponibles),
                          const SizedBox(height: AppSpacing.sm),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: OutlinedButton(onPressed: () => ref.invalidate(assignmentsProvider), child: Text(l10n.reessayer)),
                          ),
                        ],
                        data: (list) => list.isEmpty
                            ? [Text(l10n.drvAucunDepart, style: AppTypography.body.copyWith(color: muted))]
                            : [for (final a in list) AssignmentTile(assignment: a)],
                      ),
                  SectionTitle(l10n.drvOutils),
                  _Entry(icon: Icons.alt_route, label: l10n.opMesLignes, route: AppRoutes.myLines),
                  _Entry(icon: Icons.storefront_outlined, label: l10n.mkBourse, route: AppRoutes.driverMarket),
                ],
              ),
            ),
    );
  }
}

class _Entry extends StatelessWidget {
  const _Entry({required this.icon, required this.label, required this.route});

  final IconData icon;
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(route),
      );
}
