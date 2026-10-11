import 'package:flutter/material.dart';
import '../../../models/parcel.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_typography.dart';
import 'package:xlcab_app/l10n/l10n.dart';
import '../../../utils/formatters.dart';

/// Actions du chauffeur sur un colis.
class ParcelActions {
  const ParcelActions({required this.onScan, required this.onDeliver, required this.onFail, required this.onCall});

  final void Function(ParcelTask) onScan;
  final void Function(ParcelTask) onDeliver;
  final void Function(ParcelTask) onFail;
  final void Function(String phone) onCall;
}

/// Checklist colis (Partie 7, écran 15) : à enlever (scan du QR de
/// l'expéditeur), à bord (remise avec code + photo), clôturés.
class ParcelChecklist extends StatelessWidget {
  const ParcelChecklist({
    super.key,
    required this.parcels,
    required this.actions,
    required this.canPickUp,
    required this.canDeliver,
    this.busy = false,
  });

  final List<ParcelTask> parcels;
  final ParcelActions actions;

  /// Enlèvement possible maintenant (dans l'heure du départ, ou arrivé pour un colis retour).
  final bool canPickUp;

  /// Remise possible (course démarrée, ou trajet retour).
  final bool canDeliver;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final done = parcels.where((p) => p.closed).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            l10n.colisTraite(done, parcels.length, done > 1 ? 's' : ''),
            style: AppTypography.bodyBold.copyWith(color: scheme.onSurface),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        for (final p in parcels)
          Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            padding: const EdgeInsets.all(AppSpacing.sm),
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outline.withValues(alpha: 0.4)),
              borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  ExcludeSemantics(child: Icon(_icon(p), size: 20, color: p.closed ? AppColors.success : scheme.onSurface)),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      [
                        p.description,
                        if (p.weightKg != null) '${formatDecimal(p.weightKg!)} kg',
                        if (p.isFragile) 'FRAGILE',
                      ].join(' · '),
                      style: AppTypography.bodyBold.copyWith(color: scheme.onSurface),
                    ),
                  ),
                ]),
                Text(p.status.label, style: AppTypography.caption.copyWith(color: muted)),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  p.onBoard || p.status == ParcelStatus.delivered
                      ? l10n.remise(p.delivery.address, p.recipientName ?? 'destinataire')
                      : l10n.enlevement(p.pickup.address, p.senderFirstName ?? 'expéditeur'),
                  style: AppTypography.caption.copyWith(color: scheme.onSurface),
                ),
                if (!p.closed)
                  Wrap(
                    spacing: AppSpacing.sm,
                    children: [
                      if (p.toPickUp && canPickUp)
                        FilledButton.icon(
                          icon: const Icon(Icons.qr_code_scanner),
                          label: Text(l10n.scannerLeColis),
                          onPressed: busy ? null : () => actions.onScan(p),
                        ),
                      if (p.onBoard && canDeliver)
                        FilledButton.icon(
                          icon: const Icon(Icons.how_to_reg_outlined),
                          label: Text(l10n.remettreLeColis),
                          onPressed: busy ? null : () => actions.onDeliver(p),
                        ),
                      if ((p.toPickUp ? p.senderPhone : p.recipientPhone) case final phone?)
                        TextButton.icon(
                          icon: const Icon(Icons.call_outlined),
                          label: Text(p.toPickUp ? l10n.appelerLExpediteur : l10n.appelerLeDestinataire),
                          onPressed: () => actions.onCall(phone),
                        ),
                      TextButton(
                        onPressed: busy ? null : () => actions.onFail(p),
                        child: Text(l10n.signalerUnProbleme),
                      ),
                    ],
                  ),
              ],
            ),
          ),
      ],
    );
  }

  IconData _icon(ParcelTask p) => switch (p.status) {
        ParcelStatus.delivered => Icons.check_circle,
        ParcelStatus.failed || ParcelStatus.cancelled => Icons.block,
        ParcelStatus.pickedUp || ParcelStatus.inTransit => Icons.local_shipping_outlined,
        _ => Icons.inventory_2_outlined,
      };
}
