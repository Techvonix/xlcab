import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../models/parcel.dart';
import '../../services/api_service.dart';
import '../../services/document_picker.dart';
import '../../services/parcel_service.dart';
import '../../services/trip_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../utils/formatters.dart';
import 'package:xlcab_app/l10n/l10n.dart';

final parcelDetailProvider = FutureProvider.autoDispose.family<ParcelDetail, String>(
  (ref, parcelId) => ref.watch(parcelServiceProvider).detail(parcelId),
);

/// Écran 12 — Suivi colis (Partie 7) : timeline verticale (en attente →
/// pris en charge → en route → livré) avec horodatage, QR à présenter au
/// chauffeur, code de remise à transmettre au destinataire.
/// (Notifications push : à brancher avec Firebase.)
class ParcelTrackingScreen extends ConsumerWidget {
  const ParcelTrackingScreen({super.key, required this.parcelId});

  final String parcelId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(parcelDetailProvider(parcelId));
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.suiviDuColis),
        actions: [
          IconButton(tooltip: l10n.actualiser, icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(parcelDetailProvider(parcelId))),
        ],
      ),
      body: detail.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuColis)),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(e is ApiException ? e.message : l10n.suiviIndisponible),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(onPressed: () => ref.invalidate(parcelDetailProvider(parcelId)), child: Text(l10n.reessayer)),
          ]),
        ),
        data: (p) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(parcelDetailProvider(parcelId)),
          child: _Body(parcel: p),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.parcel});

  final ParcelDetail parcel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final p = parcel;
    final open = p.status == ParcelStatus.pending || p.status == ParcelStatus.pickedUp || p.status == ParcelStatus.inTransit;

    final how = switch ((p.mode, p.onReturnLeg)) {
      (ParcelMode.dedicated, _) => l10n.navetteDediee,
      (_, true) => l10n.navettePartageeAuRetourD,
      _ => l10n.navettePartageeAvecDesPassagers,
    };

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        Semantics(
          header: true,
          liveRegion: true,
          child: Text(p.status.label, style: AppTypography.h2.copyWith(color: scheme.onSurface)),
        ),
        Text(p.description, style: AppTypography.body.copyWith(color: muted)),
        if (p.failureReason != null && p.status == ParcelStatus.failed)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(l10n.notreEquipeVousRecontacte(p.failureReason!), style: AppTypography.body.copyWith(color: scheme.error)),
          ),
        const SizedBox(height: AppSpacing.lg),
        _Timeline(parcel: p),
        if (p.status == ParcelStatus.pending && p.qrCode != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Container(
              color: Colors.white, // lisible par le scanner, même en thème sombre
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: QrImageView(data: p.qrCode!, size: 180, semanticsLabel: l10n.qrCodeDuColisA),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.aPresenterAuChauffeurA2, textAlign: TextAlign.center, style: AppTypography.caption.copyWith(color: muted)),
        ],
        if (open && p.deliveryCode != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(color: AppColors.selectionLight, borderRadius: BorderRadius.circular(AppSpacing.radiusCard)),
            child: Column(children: [
              Text(l10n.codeDeRemise, style: AppTypography.bodyBold.copyWith(color: AppColors.onSelectionLight)),
              Semantics(
                label: l10n.codeDeRemise2(p.deliveryCode!.split('').join(' ')),
                excludeSemantics: true,
                child: Text(
                  p.deliveryCode!,
                  style: AppTypography.display.copyWith(color: AppColors.onSelectionLight, letterSpacing: 8, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ),
              Text(
                l10n.transmettezCeCodeAIl(p.recipientName ?? 'votre destinataire'),
                textAlign: TextAlign.center,
                style: AppTypography.caption.copyWith(color: AppColors.onSelectionLight),
              ),
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: AppColors.onSelectionLight),
                icon: const Icon(Icons.copy),
                label: Text(l10n.copierLeCode),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: p.deliveryCode!));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.codeCopie)));
                  }
                },
              ),
            ]),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        _Line(icon: Icons.trip_origin, text: p.pickupAddress),
        _Line(icon: Icons.place, text: p.deliveryAddress),
        if (p.departureAt != null) _Line(icon: Icons.event, text: l10n.departPrevu(formatTripDate(p.departureAt!, locale: locale))),
        _Line(icon: Icons.local_shipping_outlined, text: how),
        if (p.driverFirstName != null) _Line(icon: Icons.person_outline, text: '${l10n.chauffeur3(p.driverFirstName!)}${p.vehicleLabel == null || p.vehicleLabel!.isEmpty ? '' : ' · ${p.vehicleLabel}'}'),
        if (p.recipientName != null) _Line(icon: Icons.how_to_reg_outlined, text: l10n.destinataire2(p.recipientName!)),
        if (p.totalCents != null) _Line(icon: Icons.receipt_long_outlined, text: l10n.montant(formatPrice(p.totalCents!, locale: locale))),
        const SizedBox(height: AppSpacing.lg),
        if (p.status == ParcelStatus.pending && !p.hasPhoto)
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
            icon: const Icon(Icons.add_a_photo_outlined),
            label: Text(l10n.ajouterUnePhotoDuColis),
            onPressed: () => _addPhoto(context, ref),
          ),
        if (p.cancellable) ...[
          const SizedBox(height: AppSpacing.sm),
          TextButton(onPressed: () => _cancel(context, ref), child: Text(l10n.annulerLEnvoi)),
        ],
      ],
    );
  }

  Future<void> _addPhoto(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final photo = await ref.read(documentPickerProvider).pick(DocumentSource.camera);
    if (photo == null) return;
    try {
      await ref.read(parcelServiceProvider).uploadPhoto(parcel.id, photo);
      messenger.showSnackBar(SnackBar(content: Text(l10n.photoAjoutee)));
      ref.invalidate(parcelDetailProvider(parcel.id));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.annulerLEnvoi2),
        content: Text(l10n.leRemboursementEstAutomatiqueSelon),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.garder)),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.annulerLEnvoi),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final r = await ref.read(tripServiceProvider).cancel(parcel.tripId, l10n.annulationParLExpediteur);
      messenger.showSnackBar(SnackBar(
        content: Text(r.refundPending
            ? l10n.envoiAnnuleLeRemboursementSera
            : l10n.envoiAnnuleRemboursementDe(formatPrice(r.refundedCents))),
      ));
      ref.invalidate(parcelDetailProvider(parcel.id));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// Timeline verticale de l'écran 12.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.parcel});

  final ParcelDetail parcel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final steps = <(String, DateTime?)>[
      (l10n.envoiConfirme, parcel.createdAt),
      (l10n.prisEnChargeParLe, parcel.pickedUpAt),
      (l10n.enRoute, parcel.inTransitAt),
      (l10n.livreAuDestinataire, parcel.deliveredAt),
    ];
    String at(DateTime d) => '${DateFormat.MMMd(locale).format(d)} · ${DateFormat.Hm(locale).format(d)}';

    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Semantics(
            label: '${steps[i].$1} : ${steps[i].$2 == null ? 'à venir' : at(steps[i].$2!)}',
            excludeSemantics: true,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(children: [
                    Icon(
                      steps[i].$2 != null ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: steps[i].$2 != null ? AppColors.success : scheme.onSurface.withValues(alpha: 0.4),
                    ),
                    if (i < steps.length - 1)
                      Expanded(child: Container(width: 2, color: scheme.onSurface.withValues(alpha: 0.2))),
                  ]),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(steps[i].$1, style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                        if (steps[i].$2 != null)
                          Text(at(steps[i].$2!), style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
                      ]),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ExcludeSemantics(child: Icon(icon, size: 18, color: scheme.onSurface.withValues(alpha: 0.7))),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: Text(text, style: AppTypography.body.copyWith(color: scheme.onSurface))),
      ]),
    );
  }
}
