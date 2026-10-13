import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';

import '../../providers/driver_mode_provider.dart';
import '../driver/driver_mode_screen.dart';
import '../driver/widgets/mission_card.dart';

/// Onglet Revenus : net du jour, de la semaine et du mois, courses récentes,
/// compte de versement et reversements, et le suivi de mes annulations (protocole des lignes régulières).
class EarningsTab extends ConsumerWidget {
  const EarningsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(driverModeProvider);
    final muted = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.75);
    final recent = state.missions.recent.take(5).toList();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.revenus), automaticallyImplyLeading: false),
      body: state.loading
          ? Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargement))
          : RefreshIndicator(
              onRefresh: () => ref.read(driverModeProvider.notifier).refresh(),
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.md),
                children: [
                  EarningsCard(earnings: state.earnings),
                  SectionTitle(l10n.coursesRecentes),
                  if (recent.isEmpty)
                    Text(l10n.drvAucuneCourseRecente, style: AppTypography.body.copyWith(color: muted))
                  else
                    for (final m in recent) MissionTile(mission: m),
                  const SizedBox(height: AppSpacing.md),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.account_balance_outlined),
                    title: Text(l10n.payEntree),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(AppRoutes.driverPayouts),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.report_outlined),
                    title: Text(l10n.opMesAnnulations),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(AppRoutes.driverCancellations),
                  ),
                ],
              ),
            ),
    );
  }
}
