import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/trip.dart';
import '../../models/trip_detail.dart';
import '../../router.dart';
import '../../services/api_service.dart';
import '../../services/trip_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../utils/formatters.dart';
import '../../widgets/primary_button.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Ouverture d'un lien externe (PDF de facture) — injectable pour les tests.
final externalLinkOpenerProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

final tripDetailProvider = FutureProvider.autoDispose.family<TripDetail, String>(
  (ref, tripId) => ref.watch(tripServiceProvider).detail(tripId),
);

/// Écran 8 — Confirmation (Partie 7) : check animé, QR code
/// d'embarquement, récapitulatif, suivi et annulation.
/// (Ajout au calendrier et partage : à venir.)
class ConfirmationScreen extends ConsumerWidget {
  const ConfirmationScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trip = ref.watch(tripDetailProvider(tripId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.reservation), automaticallyImplyLeading: false),
      body: trip.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDeLaReservation)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(e is ApiException ? e.message : l10n.impossibleDeChargerLaReservation, textAlign: TextAlign.center),
                const SizedBox(height: AppSpacing.md),
                OutlinedButton(onPressed: () => ref.invalidate(tripDetailProvider(tripId)), child: Text(l10n.reessayer)),
              ],
            ),
          ),
        ),
        data: (t) => _Body(trip: t),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.trip});

  final TripDetail trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final locale = Localizations.localeOf(context).languageCode;
    final cancelled = trip.status == TripStatus.cancelled;
    final completed = trip.status == TripStatus.completed;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        // Check animé (Partie 7) ; animation désactivée si l'utilisateur
        // a demandé de réduire les animations.
        Center(
          child: ExcludeSemantics(
            child: Icon(cancelled ? Icons.cancel : Icons.check_circle, size: 72, color: cancelled ? onSurface : AppColors.success)
                .animate(autoPlay: !MediaQuery.of(context).disableAnimations)
                .scale(duration: 300.ms, curve: Curves.easeOut),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Semantics(
          header: true,
          liveRegion: true,
          child: Text(
            cancelled ? l10n.reservationAnnulee : completed ? l10n.courseTerminee : l10n.reservationConfirmee,
            textAlign: TextAlign.center,
            style: AppTypography.h2.copyWith(color: onSurface),
          ),
        ),
        Text(
          cancelled ? '' : _statusLine(locale),
          textAlign: TextAlign.center,
          style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7)),
        ),
        if (!cancelled && !completed && trip.qrCode != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Container(
              color: Colors.white, // fond blanc : lisible par le scanner, même en thème sombre
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: QrImageView(
                data: trip.qrCode!,
                size: 200,
                semanticsLabel: l10n.qrCodeDEmbarquementA,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.aPresenterAuChauffeurA,
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.7)),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        _Recap(trip: trip, locale: locale),
        const SizedBox(height: AppSpacing.lg),
        if (trip.status.isTrackable)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: PrimaryButton(
              icon: Icons.map_outlined,
              label: l10n.suivreMaCourse,
              onPressed: () => context.push('/tracking/${trip.id}'),
            ),
          ),
        // Écran 10 : profil du chauffeur dès qu'il est engagé ; notation à l'arrivée.
        if (const {TripStatus.accepted, TripStatus.started, TripStatus.completed}.contains(trip.status))
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: completed
                ? PrimaryButton(
                    icon: Icons.star_outline_rounded,
                    label: l10n.noterLeTrajet,
                    onPressed: () => context.push(AppRoutes.driverProfileFor(trip.id)),
                  )
                : OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
                    icon: const Icon(Icons.badge_outlined),
                    label: Text(l10n.profilDuChauffeur),
                    onPressed: () => context.push(AppRoutes.driverProfileFor(trip.id)),
                  ),
          ),
        if (trip.isCancellable)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
              icon: const Icon(Icons.event_busy),
              label: Text(l10n.annulerLaReservation),
              onPressed: () => _cancel(context, ref),
            ),
          ),
        if (trip.invoiceId != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
              icon: const Icon(Icons.receipt_long_outlined),
              label: Text(l10n.telechargerLaFacture(trip.invoiceNumber ?? '').trim()),
              onPressed: () => _downloadInvoice(context, ref),
            ),
          ),
        TextButton(onPressed: () => context.go(AppRoutes.home), child: Text(l10n.retourALAccueil)),
      ],
    );
  }

  /// Course lointaine : on annonce quand le chauffeur sera recherché,
  /// plutôt qu'un "En attente" sans explication.
  String _statusLine(String locale) {
    final at = trip.dispatchAt;
    if (trip.status == TripStatus.pending && at != null && at.isAfter(DateTime.now())) {
      return l10n.votreChauffeurSeraAttribueA(formatTripDate(at, locale: locale));
    }
    return trip.status.label;
  }

  /// Lien signé de 5 min, ouvert dans le navigateur du téléphone (PDF).
  Future<void> _downloadInvoice(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final url = await ref.read(tripServiceProvider).invoiceLink(trip.invoiceId!);
      final opened = await ref.read(externalLinkOpenerProvider)(url);
      if (!opened) messenger.showSnackBar(SnackBar(content: Text(l10n.impossibleDOuvrirLaFacture)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.annulerLaReservation2),
        content: Text(
          l10n.gratuitJusquA24H +
          l10n.puis50DeFraisJusqu,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.garder)),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.annulerLaReservation),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final result = await ref.read(tripServiceProvider).cancel(trip.id, l10n.annulationParLePassager);
      final refund = formatPrice(result.refundedCents);
      messenger.showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Text(
          result.refundPending
              ? l10n.reservationAnnuleeLeRemboursementSera
              : result.feeCents > 0
                  ? l10n.reservationAnnuleeRemboursementDeFrais(refund, formatPrice(result.feeCents))
                  : l10n.reservationAnnuleeRemboursementIntegralDe(refund),
        ),
      ));
      ref.invalidate(tripDetailProvider(trip.id));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _Recap extends StatelessWidget {
  const _Recap({required this.trip, required this.locale});

  final TripDetail trip;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(child: Icon(icon, size: 18, color: scheme.onSurface.withValues(alpha: 0.7))),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(text, style: AppTypography.body.copyWith(color: scheme.onSurface))),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(AppSpacing.radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          line(Icons.trip_origin, trip.originAddress),
          line(Icons.place, trip.destinationAddress),
          if (trip.scheduledAt != null) line(Icons.event, formatTripDate(trip.scheduledAt!, locale: locale)),
          if (trip.seats != null) line(Icons.groups_outlined, l10n.passager(trip.seats!, trip.seats! > 1 ? 's' : '')),
          if (trip.totalCents != null) line(Icons.receipt_long_outlined, l10n.montant(formatPrice(trip.totalCents!, locale: locale))),
        ],
      ),
    );
  }
}
