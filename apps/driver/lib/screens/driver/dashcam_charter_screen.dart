import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

import '../../services/dashcam_service.dart';

/// Charte caméra embarquée (CHARTE_CAMERA_EMBARQUEE.md, niveau 2) : à lire et
/// accepter avant de passer en ligne. Une nouvelle version se réaccepte.
class DashcamCharterScreen extends ConsumerStatefulWidget {
  const DashcamCharterScreen({super.key});

  @override
  ConsumerState<DashcamCharterScreen> createState() => _DashcamCharterScreenState();
}

class _DashcamCharterScreenState extends ConsumerState<DashcamCharterScreen> {
  bool _busy = false;

  Future<void> _accept(String version) async {
    setState(() => _busy = true);
    final ok = await runAction(context, () async {
      await ref.read(dashcamServiceProvider).accept(version);
    }, success: l10n.dcAcceptee);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) ref.invalidate(dashcamCharterProvider);
  }

  @override
  Widget build(BuildContext context) {
    final charter = ref.watch(dashcamCharterProvider);
    final locale = Localizations.localeOf(context).languageCode;
    Widget section(String title, List<String> lines) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle(title),
          for (final l in lines)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const ExcludeSemantics(child: Text('•  ')),
                Expanded(child: Text(l, style: AppTypography.body)),
              ]),
            ),
        ]);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.dcTitre)),
      body: AsyncBody(
        value: charter,
        loadingLabel: l10n.dcChargement,
        onRetry: () => ref.invalidate(dashcamCharterProvider),
        data: (c) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            Text(l10n.dcIntro, style: AppTypography.body),
            section(l10n.dcPourquoiTitre, [l10n.dcPourquoi1, l10n.dcPourquoi2]),
            section(l10n.dcCommentTitre, [l10n.dcComment1, l10n.dcComment2, l10n.dcComment3]),
            section(l10n.dcQuandTitre, [l10n.dcQuand1, l10n.dcQuand2]),
            section(l10n.dcEngagementsTitre, [l10n.dcEngagement1, l10n.dcEngagement2, l10n.dcEngagement3, l10n.dcEngagement4]),
            const SizedBox(height: AppSpacing.md),
            if (c.accepted)
              Row(children: [
                const ExcludeSemantics(child: Icon(Icons.verified, color: AppColors.success)),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    c.acceptedAt == null ? l10n.dcDejaAcceptee : l10n.dcAccepteeLe(formatTripDate(c.acceptedAt!, locale: locale)),
                    style: AppTypography.bodyBold,
                  ),
                ),
              ])
            else
              PrimaryButton(icon: Icons.check, label: l10n.dcJAccepte, onPressed: _busy ? null : () => _accept(c.version)),
            const SizedBox(height: AppSpacing.sm),
            Text(l10n.dcVersion(c.version), style: AppTypography.caption, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

/// Bandeau du mode chauffeur : charte à accepter, demandes de conservation en attente.
class DashcamNotices extends ConsumerWidget {
  const DashcamNotices({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final charter = ref.watch(dashcamCharterProvider).valueOrNull;
    final requests = ref.watch(footageRequestsProvider).valueOrNull ?? const [];
    final locale = Localizations.localeOf(context).languageCode;
    final pending = requests.where((r) => r.pending).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (charter != null && !charter.accepted)
        OpCard(
          highlight: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(l10n.dcAAccepter, style: AppTypography.bodyBold),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              onPressed: () => context.push(AppRoutes.dashcamCharter),
              icon: const Icon(Icons.videocam_outlined),
              label: Text(l10n.dcLireLaCharte),
            ),
          ]),
        ),
      for (final r in pending)
        OpCard(
          highlight: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(l10n.dcConserverTitre, style: AppTypography.bodyBold),
            const SizedBox(height: AppSpacing.xs),
            Text(l10n.dcConserverTexte(
              r.tripAt == null ? '' : formatTripDate(r.tripAt!, locale: locale),
              '${r.origin ?? ''} → ${r.destination ?? ''}',
            )),
            const SizedBox(height: AppSpacing.sm),
            FilledButton(
              onPressed: () async {
                final ok = await runAction(context, () => ref.read(dashcamServiceProvider).acknowledge(r.incidentId), success: l10n.dcMerciConserve);
                if (ok) ref.invalidate(footageRequestsProvider);
              },
              child: Text(l10n.dcCestNote),
            ),
          ]),
        ),
    ]);
  }
}
