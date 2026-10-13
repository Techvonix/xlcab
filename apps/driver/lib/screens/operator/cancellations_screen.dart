import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/operator.dart';
import '../../providers/operator_provider.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Mes annulations de départ et pénalités (protocole d'annulation) :
/// justificatif de force majeure ou contestation dans les 7 jours.
class CancellationsScreen extends ConsumerStatefulWidget {
  const CancellationsScreen({super.key});

  @override
  ConsumerState<CancellationsScreen> createState() => _CancellationsScreenState();
}

class _CancellationsScreenState extends ConsumerState<CancellationsScreen> {
  bool _busy = false;

  Future<void> _justify(DriverCancellation c) async {
    final text = await textDialog(
      context,
      title: l10n.opEnvoyerUnJustificatif,
      intro: l10n.opJustificatifExplication,
      label: l10n.opJustificatif,
      action: l10n.mkEnvoyer,
      minLength: 10,
      maxLength: 1000,
    );
    if (text == null || !mounted) return;
    await _do(() => ref.read(operatorServiceProvider).justify(c.id, text), l10n.opJustificatifEnvoye);
  }

  Future<void> _contest(DriverPenalty p) async {
    final text = await textDialog(context, title: l10n.opContesterLaPenalite, label: l10n.opMotif, action: l10n.opContester);
    if (text == null || !mounted) return;
    await _do(() => ref.read(operatorServiceProvider).contest(p.id, text), l10n.opContestationEnvoyee);
  }

  Future<void> _do(Future<void> Function() action, String success) async {
    setState(() => _busy = true);
    final ok = await runAction(context, action, success: success);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) ref.invalidate(cancellationsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(cancellationsProvider);
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.opMesAnnulations)),
      body: AsyncBody(
        value: list,
        loadingLabel: l10n.opChargementDesAnnulations,
        onRetry: () => ref.invalidate(cancellationsProvider),
        data: (items) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            Text(l10n.opReglesAnnulation, style: AppTypography.caption),
            const SizedBox(height: AppSpacing.sm),
            if (items.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl), child: Text(l10n.opAucuneAnnulation, textAlign: TextAlign.center)),
            for (final c in items)
              OpCard(
                highlight: c.penalty?.status == PenaltyStatus.pending,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_trigger(c.trigger), style: AppTypography.bodyBold),
                  Text(l10n.opAnnulationLe(formatTripDate(c.createdAt, locale: locale), formatDuration(c.minutesBefore.abs())), style: AppTypography.caption),
                  const SizedBox(height: AppSpacing.xs),
                  StatusPill(label: _status(c.status)),
                  if (c.penalty != null) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      l10n.opPenalite(formatPrice(c.penalty!.amountCents, locale: locale), _penalty(c.penalty!.status)),
                      style: AppTypography.bodyBold,
                    ),
                    if (c.penalty!.collectedCents > 0)
                      Text(l10n.payPenaliteRecouvree(formatPrice(c.penalty!.collectedCents, locale: locale)), style: AppTypography.caption),
                    if (c.penalty!.invoiceNumber != null && c.penalty!.collectedCents < c.penalty!.amountCents)
                      Text(
                        l10n.payFacturePenalite(
                          c.penalty!.invoiceNumber!,
                          formatPrice(c.penalty!.amountCents - c.penalty!.collectedCents, locale: locale),
                          c.penalty!.invoiceDueDate == null ? '—' : formatTripDate(c.penalty!.invoiceDueDate!, locale: locale),
                        ),
                        style: AppTypography.caption,
                      ),
                  ],
                  Wrap(spacing: AppSpacing.sm, children: [
                    if (c.status == CancellationStatus.counted)
                      TextButton(onPressed: _busy ? null : () => _justify(c), child: Text(l10n.opEnvoyerUnJustificatif)),
                    if (c.penalty?.status == PenaltyStatus.pending)
                      TextButton(onPressed: _busy ? null : () => _contest(c.penalty!), child: Text(l10n.opContesterLaPenalite)),
                  ]),
                ]),
              ),
          ],
        ),
      ),
    );
  }

  static String _trigger(String t) => switch (t) {
        'not_ready' => l10n.opTriggerPasEnRoute,
        'no_position' => l10n.opTriggerSansPosition,
        _ => l10n.opTriggerAnnulation,
      };

  static String _status(CancellationStatus s) => switch (s) {
        CancellationStatus.counted => l10n.opAnnulationComptee,
        CancellationStatus.notCounted => l10n.opAnnulationNonComptee,
        CancellationStatus.justificationPending => l10n.opJustificatifEnExamen,
        CancellationStatus.justified => l10n.opForceMajeureReconnue,
        CancellationStatus.waived => l10n.opAnnulationLevee,
      };

  static String _penalty(PenaltyStatus s) => switch (s) {
        PenaltyStatus.pending => l10n.opPenaliteContestable,
        PenaltyStatus.contested => l10n.opPenaliteContestee,
        PenaltyStatus.applied => l10n.opPenaliteAppliquee,
        PenaltyStatus.cancelled => l10n.opPenaliteAnnulee,
      };
}
