import 'payouts_screen.dart' show PayoutAccountBanner;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import '../../providers/operator_provider.dart';
import 'package:xlcab_core/routes.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Mes lignes régulières (bourse, étape 3) : état du profil opérateur,
/// lignes publiées, confirmation des départs de la semaine, nouvelle ligne.
class MyLinesScreen extends ConsumerWidget {
  const MyLinesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(operatorProfileProvider);
    final lines = ref.watch(myLinesProvider);
    final canPublish = profile.valueOrNull?.termsAccepted == true;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.opMesLignes),
        actions: [
          IconButton(
            tooltip: l10n.opProfilOperateur,
            icon: const Icon(Icons.badge_outlined),
            onPressed: () => context.push(AppRoutes.operatorProfile),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add_road),
        label: Text(l10n.opNouvelleLigne),
        onPressed: () {
          if (!canPublish) {
            showToast(context, l10n.opAcceptezLesConditionsAvantDePublier);
            context.push(AppRoutes.operatorProfile);
            return;
          }
          context.push(AppRoutes.lineNew);
        },
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(operatorProfileProvider);
          ref.invalidate(myLinesProvider);
          await ref.read(myLinesProvider.future);
        },
        child: AsyncBody(
          value: lines,
          loadingLabel: l10n.opChargementDesLignes,
          onRetry: () => ref.invalidate(myLinesProvider),
          data: (list) {
            final toConfirm = list.fold<int>(0, (n, l) => n + l.departuresToConfirm);
            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, 96),
              children: [
                if (profile.valueOrNull != null) _ProfileBanner(profile: profile.value!),
                const PayoutAccountBanner(),
                if (toConfirm > 0) _ConfirmWeekCard(count: toConfirm),
                if (list.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                    child: Text(l10n.opAucuneLignePresentation, textAlign: TextAlign.center, style: AppTypography.body),
                  ),
                for (final line in list) LineTile(line: line),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Ce qui manque pour que les lignes soient proposées aux voyageurs.
class _ProfileBanner extends StatelessWidget {
  const _ProfileBanner({required this.profile});

  final OperatorProfile profile;

  @override
  Widget build(BuildContext context) {
    final String text;
    final IconData icon;
    if (!profile.termsAccepted) {
      text = l10n.opBanniereConditions;
      icon = Icons.gavel_outlined;
    } else if (profile.status == OperatorStatus.suspended) {
      text = l10n.opBanniereSuspendu;
      icon = Icons.block;
    } else if (profile.status == OperatorStatus.pending) {
      text = l10n.opBanniereVerification;
      icon = Icons.hourglass_top;
    } else {
      text = profile.perSeatAllowed ? l10n.opBanniereVerifiePlace : l10n.opBanniereVerifieVehicule;
      icon = Icons.verified_outlined;
    }
    return OpCard(
      highlight: !profile.termsAccepted || profile.status != OperatorStatus.verified,
      child: InkWell(
        onTap: () => context.push(AppRoutes.operatorProfile),
        child: Row(children: [
          ExcludeSemantics(child: Icon(icon)),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: Text(text, style: AppTypography.body)),
          const ExcludeSemantics(child: Icon(Icons.chevron_right)),
        ]),
      ),
    );
  }
}

/// « J'assure mes départs des 7 prochains jours » : ils deviennent réservables.
class _ConfirmWeekCard extends ConsumerStatefulWidget {
  const _ConfirmWeekCard({required this.count});

  final int count;

  @override
  ConsumerState<_ConfirmWeekCard> createState() => _ConfirmWeekCardState();
}

class _ConfirmWeekCardState extends ConsumerState<_ConfirmWeekCard> {
  bool _busy = false;

  Future<void> _confirm() async {
    final until = apiDate(ref.read(clockProvider)().add(const Duration(days: 7)));
    setState(() => _busy = true);
    var confirmed = 0;
    final ok = await runAction(context, () async {
      confirmed = await ref.read(operatorServiceProvider).confirmDepartures(until: until);
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      showToast(context, l10n.opDepartsConfirmes(confirmed));
      ref.invalidate(myLinesProvider);
    }
  }

  @override
  Widget build(BuildContext context) => OpCard(
        highlight: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.opDepartsAConfirmer(widget.count), style: AppTypography.bodyBold),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.opDepartsAConfirmerExplication, style: AppTypography.caption),
          const SizedBox(height: AppSpacing.sm),
          FilledButton.icon(
            onPressed: _busy ? null : _confirm,
            icon: const Icon(Icons.event_available),
            // Libellé long : sur deux lignes, il lui faut de l'air au-dessus et en dessous.
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm)),
            label: Text(l10n.opConfirmerSeptJours, textAlign: TextAlign.center),
          ),
        ]),
      );
}

/// Une ligne dans la liste : trajet, horaire, jours, prix, statut.
class LineTile extends StatelessWidget {
  const LineTile({super.key, required this.line});

  final RecurringLine line;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final price = formatPrice(line.priceCents, locale: locale);
    return OpCard(
      child: InkWell(
        onTap: () => context.push(AppRoutes.lineDetailFor(line.id)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l10n.opTrajet(line.origin.address, line.destination.address), style: AppTypography.bodyBold),
          const SizedBox(height: AppSpacing.xs),
          Text(
            line.returnTime == null
                ? l10n.opHoraireJours(line.departureTime, daysLabel(line.daysOfWeek))
                : l10n.opHoraireRetourJours(line.departureTime, line.returnTime!, daysLabel(line.daysOfWeek)),
            style: AppTypography.caption,
          ),
          Text(
            line.perSeat ? l10n.opPrixParPlace(price, line.seats) : l10n.opPrixVehicule(price, line.seats),
            style: AppTypography.caption,
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
            StatusPill(label: lineStatusLabel(line.status)),
            if (line.departuresToConfirm > 0) StatusPill(icon: Icons.event_busy, label: l10n.opDepartsAConfirmer(line.departuresToConfirm)),
          ]),
        ]),
      ),
    );
  }
}

String lineStatusLabel(LineStatus s) => switch (s) {
      LineStatus.active => l10n.opLigneActive,
      LineStatus.paused => l10n.opLigneEnPause,
      LineStatus.closed => l10n.opLigneFermee,
    };
