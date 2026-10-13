import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/payouts.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

import '../../providers/operator_provider.dart';
import '../../services/driver_device.dart';
import '../../services/operator_service.dart';

/// Compte de versement (Stripe) et reversements de l'opérateur.
///
/// L'identité et l'IBAN se saisissent sur les pages de Stripe, ouvertes dans
/// le navigateur : l'appli n'en voit rien. Au retour dans l'appli, l'état du
/// compte est relu.
class PayoutsScreen extends ConsumerStatefulWidget {
  const PayoutsScreen({super.key});

  @override
  ConsumerState<PayoutsScreen> createState() => _PayoutsScreenState();
}

class _PayoutsScreenState extends ConsumerState<PayoutsScreen> with WidgetsBindingObserver {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    // Retour du navigateur (pages de Stripe) : le compte a pu changer d'état.
    if (lifecycle == AppLifecycleState.resumed) _reload();
  }

  void _reload() {
    ref.invalidate(payoutAccountProvider);
    ref.invalidate(payoutsProvider);
  }

  /// Demande un lien au serveur (à usage unique, valable quelques minutes) et l'ouvre dans le navigateur.
  Future<void> _open(Future<Uri> Function() link) async {
    setState(() => _busy = true);
    try {
      final opened = await ref.read(externalLinkOpenerProvider)(await link());
      if (!opened && mounted) showToast(context, l10n.payOuvertureImpossible);
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(payoutAccountProvider);
    final payouts = ref.watch(payoutsProvider);
    final service = ref.read(operatorServiceProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.payTitre)),
      body: AsyncBody(
        value: account,
        loadingLabel: l10n.payChargement,
        onRetry: _reload,
        data: (a) => RefreshIndicator(
          onRefresh: () async {
            _reload();
            try {
              await ref.read(payoutAccountProvider.future);
            } catch (_) {}
          },
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              _AccountCard(
                account: a,
                busy: _busy,
                onSetup: () => _open(service.payoutOnboardingLink),
                onDashboard: () => _open(service.payoutDashboardLink),
              ),
              SectionTitle(l10n.payReversements),
              ...switch (payouts) {
                AsyncData(:final value) => _summary(context, value),
                AsyncError(:final error) => [
                    Text(error is ApiException ? error.message : l10n.payReversementsIndisponibles, style: AppTypography.body),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton(onPressed: () => ref.invalidate(payoutsProvider), child: Text(l10n.reessayer)),
                    ),
                  ],
                _ => [Center(child: CircularProgressIndicator(semanticsLabel: l10n.payChargement))],
              },
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _summary(BuildContext context, PayoutSummary s) {
    final locale = Localizations.localeOf(context).languageCode;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = onSurface.withValues(alpha: 0.75);
    return [
      Wrap(spacing: AppSpacing.lg, runSpacing: AppSpacing.sm, children: [
        _Total(label: l10n.payVerse, value: formatPrice(s.paidCents, locale: locale)),
        _Total(label: l10n.payEnAttente, value: formatPrice(s.pendingCents, locale: locale)),
        if (s.withheldCents > 0) _Total(label: l10n.payRetenu, value: formatPrice(s.withheldCents, locale: locale)),
      ]),
      const SizedBox(height: AppSpacing.sm),
      Text(l10n.payExplication, style: AppTypography.caption.copyWith(color: muted)),
      if (s.withheldCents > 0)
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(onPressed: () => context.push(AppRoutes.driverCancellations), child: Text(l10n.payVoirPenalites)),
        ),
      const SizedBox(height: AppSpacing.sm),
      if (s.items.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          child: Text(l10n.payAucunReversement, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: onSurface)),
        ),
      for (final p in s.items) _PayoutTile(payout: p, locale: locale),
      if (s.bonuses.isNotEmpty) ...[
        SectionTitle(l10n.payBonus),
        Text(l10n.payBonusAide, style: AppTypography.caption.copyWith(color: muted)),
        const SizedBox(height: AppSpacing.sm),
        for (final b in s.bonuses)
          OpCard(
            highlight: b.status == PayoutStatus.blocked,
            // Pastille sous la ligne date / montant, sur toute la largeur : son libellé est long.
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(formatTripDate(b.createdAt, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface))),
                const SizedBox(width: AppSpacing.sm),
                Text(formatPrice(b.amountCents, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface)),
              ]),
              const SizedBox(height: AppSpacing.xs),
              StatusPill(label: b.status == PayoutStatus.pending ? l10n.payBonusEnAttente : payoutStatusLabel(b.status)),
            ]),
          ),
      ],
    ];
  }
}

/// État du compte de versement et action à faire.
class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account, required this.busy, required this.onSetup, required this.onDashboard});

  final PayoutAccount account;
  final bool busy;
  final VoidCallback onSetup;
  final VoidCallback onDashboard;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final (IconData icon, String title, String body) = switch (account.state) {
      PayoutAccountState.none => (Icons.account_balance_outlined, l10n.payEtatAucun, l10n.payEtatAucunAide),
      PayoutAccountState.incomplete => (Icons.pending_actions_outlined, l10n.payEtatIncomplet, l10n.payEtatIncompletAide(account.requirementsDue)),
      PayoutAccountState.pending => (Icons.hourglass_top, l10n.payEtatVerification, l10n.payEtatVerificationAide),
      PayoutAccountState.ready => (Icons.verified_outlined, l10n.payEtatPret, l10n.payEtatPretAide),
    };
    return OpCard(
      highlight: account.blocksSelling,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ExcludeSemantics(child: Icon(icon)),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Semantics(header: true, child: Text(title, style: AppTypography.bodyBold.copyWith(color: onSurface))),
              const SizedBox(height: AppSpacing.xs),
              Text(body, style: AppTypography.body.copyWith(color: onSurface)),
              if (account.blocksSelling) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(l10n.payExige, style: AppTypography.bodyBold.copyWith(color: onSurface)),
              ],
            ]),
          ),
        ]),
        const SizedBox(height: AppSpacing.md),
        switch (account.state) {
          PayoutAccountState.none => PrimaryButton(icon: Icons.open_in_new, label: l10n.payOuvrir, onPressed: busy ? null : onSetup),
          PayoutAccountState.incomplete => PrimaryButton(icon: Icons.open_in_new, label: l10n.payCompleter, onPressed: busy ? null : onSetup),
          PayoutAccountState.pending || PayoutAccountState.ready => OutlinedButton.icon(
              onPressed: busy ? null : onDashboard,
              icon: const Icon(Icons.open_in_new),
              label: Text(l10n.payEspaceStripe),
            ),
        },
        const SizedBox(height: AppSpacing.xs),
        Text(l10n.payConfidentialite, style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.75))),
      ]),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return MergeSemantics(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.75))),
        Text(value, style: AppTypography.h3.copyWith(color: onSurface)),
      ]),
    );
  }
}

class _PayoutTile extends StatelessWidget {
  const _PayoutTile({required this.payout, required this.locale});

  final Payout payout;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = onSurface.withValues(alpha: 0.75);
    final when = payout.scheduledAt ?? payout.createdAt;
    final route = [payout.originAddress, payout.destinationAddress].whereType<String>().join(' → ');
    return OpCard(
      highlight: payout.status == PayoutStatus.blocked,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(formatTripDate(when, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface)),
              if (route.isNotEmpty) Text(route, style: AppTypography.caption.copyWith(color: muted)),
            ]),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(formatPrice(payout.amountCents, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface)),
        ]),
        const SizedBox(height: AppSpacing.xs),
        StatusPill(label: payoutStatusLabel(payout.status)),
        if (payout.withheldCents > 0) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.payDetailRetenue(formatPrice(payout.grossCents, locale: locale), formatPrice(payout.withheldCents, locale: locale)),
            style: AppTypography.caption.copyWith(color: muted),
          ),
        ],
      ]),
    );
  }
}

String payoutStatusLabel(PayoutStatus s) => switch (s) {
      PayoutStatus.pending => l10n.payStatutEnCours,
      PayoutStatus.paid => l10n.payStatutVerse,
      PayoutStatus.blocked => l10n.payStatutBloque,
      PayoutStatus.withheld => l10n.payStatutRetenu,
    };

/// Rappel affiché sur « Mes lignes » et la bourse tant que le compte de
/// versement, exigé, n'est pas prêt : la mise en vente est refusée.
class PayoutAccountBanner extends ConsumerWidget {
  const PayoutAccountBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(payoutAccountProvider).valueOrNull;
    if (account == null || !account.blocksSelling) return const SizedBox.shrink();
    return OpCard(
      highlight: true,
      child: InkWell(
        onTap: () => context.push(AppRoutes.driverPayouts),
        child: Row(children: [
          const ExcludeSemantics(child: Icon(Icons.account_balance_outlined)),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: Text(l10n.payBanniere, style: AppTypography.body)),
          const ExcludeSemantics(child: Icon(Icons.chevron_right)),
        ]),
      ),
    );
  }
}
