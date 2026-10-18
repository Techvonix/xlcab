import 'package:flutter/material.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/utils/formatters.dart';

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

/// Code à 4 chiffres donné par le destinataire.
class DeliveryCodeDialog extends StatefulWidget {
  const DeliveryCodeDialog({super.key});

  @override
  State<DeliveryCodeDialog> createState() => DeliveryCodeDialogState();
}

class DeliveryCodeDialogState extends State<DeliveryCodeDialog> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final valid = RegExp(r'^\d{4}$').hasMatch(_code.text);
    return AlertDialog(
      title: Text(l10n.remiseDuColis),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l10n.demandezAuDestinataireSonCode),
        const SizedBox(height: AppSpacing.md),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 4,
          decoration: InputDecoration(labelText: l10n.codeDeRemise),
          onChanged: (_) => setState(() {}),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.retour)),
        FilledButton(
          onPressed: valid ? () => Navigator.of(context).pop(_code.text) : null,
          child: Text(l10n.photographierEtValider),
        ),
      ],
    );
  }
}

/// Motif d'un problème sur un colis (expéditeur absent, destinataire injoignable…).
class ParcelProblemDialog extends StatefulWidget {
  const ParcelProblemDialog({super.key, required this.task});

  final ParcelTask task;

  @override
  State<ParcelProblemDialog> createState() => ParcelProblemDialogState();
}

class ParcelProblemDialogState extends State<ParcelProblemDialog> {
  String? _reason;

  List<String> get _reasons => widget.task.toPickUp
      ? [
          if (widget.task.onReturnLeg) l10n.jeNeRentrePasPar,
          l10n.expediteurAbsent,
          l10n.colisNonConformePoidsTaille,
        ]
      : [l10n.destinataireAbsentOuInjoignable, l10n.codeDeRemiseRefuse, l10n.colisEndommage];

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(l10n.signalerUnProbleme),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        for (final r in _reasons)
          ListTile(
            contentPadding: EdgeInsets.zero,
            selected: _reason == r,
            leading: Icon(_reason == r ? Icons.check_circle : Icons.circle_outlined),
            title: Text(r),
            onTap: () => setState(() => _reason = r),
          ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.retour)),
        FilledButton(
          onPressed: _reason == null ? null : () => Navigator.of(context).pop(_reason),
          child: Text(l10n.signaler),
        ),
      ],
    );
  }
}
