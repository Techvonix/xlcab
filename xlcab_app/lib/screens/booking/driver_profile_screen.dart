import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/driver_public_profile.dart';
import '../../services/api_service.dart';
import '../../services/feedback_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../widgets/driver_avatar.dart';
import '../../widgets/primary_button.dart';
import 'package:xlcab_app/l10n/l10n.dart';
import '../../utils/formatters.dart';

/// Écran 10 — Profil chauffeur (Partie 7) : note, véhicule, badges (dashcam,
/// PMR), langues, signaler. Ouvert depuis le suivi ou le récapitulatif d'une
/// course : le serveur ne le montre qu'au passager de cette course.
class DriverProfileScreen extends ConsumerWidget {
  const DriverProfileScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(driverPublicProfileProvider(tripId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.votreChauffeur)),
      body: profile.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuProfil)),
        error: (e, _) => _Error(
          message: e is ApiException ? e.message : l10n.profilIndisponible,
          onRetry: () => ref.invalidate(driverPublicProfileProvider(tripId)),
        ),
        data: (p) => _Body(tripId: tripId, profile: p),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.tripId, required this.profile});

  final String tripId;
  final DriverPublicProfile profile;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.75));
    final vehicle = profile.vehicle;
    final rating = profile.rating;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            DriverAvatar(firstName: profile.firstName, size: 72),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(profile.firstName, style: AppTypography.h1.copyWith(color: onSurface)),
                  Text(
                    rating == null
                        ? l10n.nouveauChauffeur
                        : l10n.n5Avis(_decimal(rating), profile.ratingCount),
                    semanticsLabel: rating == null ? l10n.nouveauChauffeurPasEncoreNote : l10n.noteSur5Avis(_decimal(rating), profile.ratingCount),
                    style: AppTypography.bodyBold.copyWith(color: onSurface),
                  ),
                  if (profile.totalTrips > 0) Text(l10n.trajetsRealises(profile.totalTrips), style: muted),
                ],
              ),
            ),
          ],
        ),
        if (profile.pmrTrained || (vehicle?.dashcamActive ?? false) || (vehicle?.pmrEquipped ?? false)) ...[
          const SizedBox(height: AppSpacing.lg),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              if (vehicle?.dashcamActive ?? false) _Badge(icon: Icons.videocam_outlined, label: l10n.dashcamActive),
              if (profile.pmrTrained) _Badge(icon: Icons.school_outlined, label: l10n.formeALAccueilPmr),
              if (vehicle?.pmrEquipped ?? false) _Badge(icon: Icons.accessible, label: l10n.vehiculeEquipePmr),
            ],
          ),
        ],
        if (profile.languages.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(l10n.languesParlees, style: AppTypography.h3.copyWith(color: onSurface)),
          const SizedBox(height: AppSpacing.xs),
          Text(profile.languages.map(languageName).join(', '), style: muted),
        ],
        if (vehicle != null) ...[
          const SizedBox(height: AppSpacing.lg),
          _VehicleCard(vehicle: vehicle),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (profile.canRate)
          _RatingForm(tripId: tripId, firstName: profile.firstName)
        else if (profile.myRating != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.star_rate_rounded, color: AppColors.tertiaryText),
              title: Text(l10n.vousAvezDonne5(profile.myRating!)),
              subtitle: Text(l10n.merciVotreAvisAideLes),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            style: TextButton.styleFrom(minimumSize: const Size(AppSpacing.minTapTarget, AppSpacing.minTapTarget)),
            icon: const Icon(Icons.flag_outlined),
            label: Text(l10n.signalerUnProbleme),
            onPressed: () => _report(context, tripId),
          ),
        ),
      ],
    );
  }

  static String _decimal(double v) => formatDecimal(v, keepDigits: true);

  Future<void> _report(BuildContext context, String tripId) async {
    final sent = await showDialog<bool>(context: context, builder: (_) => _ReportDialog(tripId: tripId));
    if (sent == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.signalementEnvoyeNotreEquipeLe)),
      );
    }
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({required this.vehicle});

  final PublicVehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final type = vehicle.shuttleType;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Bande de couleur de la navette (Partie 5) ; le nom est aussi écrit.
            Container(width: 6, color: type?.color ?? AppColors.lightBorder),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(type?.label ?? l10n.vehicule, style: AppTypography.h3.copyWith(color: onSurface)),
                    if (vehicle.description.isNotEmpty) Text(vehicle.description, style: AppTypography.body.copyWith(color: onSurface)),
                    if (vehicle.capacity != null) Text(l10n.places(vehicle.capacity!), style: AppTypography.body.copyWith(color: onSurface)),
                    if (vehicle.plate != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
                        decoration: BoxDecoration(border: Border.all(color: onSurface, width: 1.5), borderRadius: BorderRadius.circular(4)),
                        child: Text(
                          vehicle.plate!,
                          semanticsLabel: l10n.immatriculation(vehicle.plate!.split('').join(' ')),
                          style: AppTypography.bodyBold.copyWith(color: onSurface, letterSpacing: 1.2),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Note de 1 à 5 étoiles + commentaire facultatif (lu par l'équipe seulement).
class _RatingForm extends ConsumerStatefulWidget {
  const _RatingForm({required this.tripId, required this.firstName});

  final String tripId;
  final String firstName;

  @override
  ConsumerState<_RatingForm> createState() => _RatingFormState();
}

class _RatingFormState extends ConsumerState<_RatingForm> {
  final _comment = TextEditingController();
  int _stars = 0;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(feedbackServiceProvider).rate(widget.tripId, _stars, comment: _comment.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.merciPourVotreNote)));
      ref.invalidate(driverPublicProfileProvider(widget.tripId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.commentSEstPasseVotre(widget.firstName), style: AppTypography.h3.copyWith(color: onSurface)),
            const SizedBox(height: AppSpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  Semantics(
                    selected: i == _stars,
                    child: IconButton(
                      iconSize: 36,
                      tooltip: i == 1 ? l10n.n1Etoile : l10n.etoiles(i),
                      icon: Icon(i <= _stars ? Icons.star_rounded : Icons.star_outline_rounded,
                          color: i <= _stars ? AppColors.tertiaryText : onSurface.withValues(alpha: 0.6)),
                      onPressed: _busy ? null : () => setState(() => _stars = i),
                    ),
                  ),
              ],
            ),
            if (_stars > 0) ...[
              Text(
                ['', l10n.tresDecevant, l10n.decevant, l10n.correct, l10n.bien, l10n.excellent][_stars],
                textAlign: TextAlign.center,
                style: AppTypography.bodyBold.copyWith(color: onSurface),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _comment,
                maxLength: 500,
                maxLines: 3,
                minLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: l10n.unCommentaireFacultatif,
                  helperText: l10n.luUniquementParLEquipe,
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(_error!, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: AppSpacing.sm),
            PrimaryButton(label: l10n.envoyerMaNote, onPressed: _stars == 0 || _busy ? null : _submit),
          ],
        ),
      ),
    );
  }
}

class _ReportDialog extends ConsumerStatefulWidget {
  const _ReportDialog({required this.tripId});

  final String tripId;

  @override
  ConsumerState<_ReportDialog> createState() => _ReportDialogState();
}

class _ReportDialogState extends ConsumerState<_ReportDialog> {
  final _details = TextEditingController();
  ReportReason? _reason;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(feedbackServiceProvider).report(widget.tripId, _reason!, details: _details.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(l10n.signalerUnProbleme),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.enCasDeDangerImmediat),
            const SizedBox(height: AppSpacing.sm),
            for (final r in ReportReason.values)
              ListTile(
                contentPadding: EdgeInsets.zero,
                selected: r == _reason,
                leading: Icon(r == _reason ? Icons.radio_button_checked : Icons.radio_button_unchecked),
                title: Text(r.label),
                onTap: _busy ? null : () => setState(() => _reason = r),
              ),
            TextField(
              controller: _details,
              maxLength: 1000,
              maxLines: 4,
              minLines: 2,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: l10n.queSEstIlPasse),
            ),
            if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: Text(l10n.annuler)),
        FilledButton(onPressed: _reason == null || _busy ? null : _send, child: Text(l10n.envoyer)),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm + 4, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(
        border: Border.all(color: onSurface.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: onSurface),
          const SizedBox(width: AppSpacing.xs),
          Text(label, style: AppTypography.caption.copyWith(color: onSurface, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton(onPressed: onRetry, child: Text(l10n.reessayer)),
          ],
        ),
      ),
    );
  }
}
