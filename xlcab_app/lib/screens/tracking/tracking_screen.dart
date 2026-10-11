import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/tracking.dart';
import '../../models/trip.dart';
import '../../providers/tracking_provider.dart';
import '../../router.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../utils/geo.dart';
import '../../widgets/driver_avatar.dart';
import '../../widgets/eta_progress.dart';
import 'widgets/chat_sheet.dart';
import 'widgets/sos_button.dart';
import 'widgets/tracking_map.dart';
import 'package:xlcab_app/l10n/l10n.dart';
import '../../utils/formatters.dart';

/// Écran 9 — Suivi temps réel (Partie 7) : carte plein écran, marqueur
/// chauffeur animé, bottom sheet déplaçable avec ETA, boutons
/// Appeler / Message / Partager, SOS rouge. Temps réel par WebSocket
/// authentifié, reconnexion automatique et polling toutes les 10 s en
/// cas de coupure (voir TrackingController).
class TrackingScreen extends ConsumerWidget {
  const TrackingScreen({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(trackingControllerProvider(tripId));
    final controller = ref.read(trackingControllerProvider(tripId).notifier);

    if (state.loadError != null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.suiviDuTrajet)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Text(state.loadError!, textAlign: TextAlign.center),
          ),
        ),
      );
    }

    final snapshot = state.snapshot;
    if (snapshot == null) {
      return Scaffold(
        body: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuSuivi)),
      );
    }

    final mapBuilder = ref.watch(trackingMapBuilderProvider);

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: mapBuilder(snapshot.origin, snapshot.destination, state.position)),
          // Barre du haut : retour, bandeau de connexion, SOS.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _RoundIconButton(
                    icon: Icons.arrow_back,
                    tooltip: l10n.retour,
                    onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.home),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: _ConnectionBanner(connection: state.connection)),
                  const SizedBox(width: AppSpacing.sm),
                  SosButton(onSendAlert: controller.sendSos),
                ],
              ),
            ),
          ),
          DraggableScrollableSheet(
            initialChildSize: 0.38,
            minChildSize: 0.22,
            maxChildSize: 0.85,
            snap: true,
            builder: (context, scroll) => _TripSheet(
              scrollController: scroll,
              state: state,
              snapshot: snapshot,
              onMessage: () => showChatSheet(context, tripId),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Bottom sheet ──────────────────────────────────────────────────────────

class _TripSheet extends StatelessWidget {
  const _TripSheet({
    required this.scrollController,
    required this.state,
    required this.snapshot,
    required this.onMessage,
  });

  final ScrollController scrollController;
  final TrackingState state;
  final TrackingSnapshot snapshot;
  final VoidCallback onMessage;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onSurface = scheme.onSurface;
    final eta = _Eta.compute(state, snapshot);
    final driver = snapshot.driver;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusModal)),
        boxShadow: AppShadows.level4,
      ),
      child: ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.lg),
        children: [
          // Poignée de déplacement.
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: AppSpacing.md),
              decoration: BoxDecoration(
                color: onSurface.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Statut : icône + texte (jamais la couleur seule).
          Semantics(
            liveRegion: true,
            child: Row(
              children: [
                ExcludeSemantics(child: Icon(state.status.icon, color: onSurface)),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(state.status.label, style: AppTypography.h3.copyWith(color: onSurface)),
                ),
              ],
            ),
          ),
          if (eta != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Semantics(
              label: l10n.environMinutes(eta.label, eta.minutes),
              excludeSemantics: true,
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.end,
                spacing: AppSpacing.sm,
                children: [
                  // "ETA tabulaire" (Partie 16) : chiffres à largeur fixe.
                  Text(
                    '≈ ${eta.minutes} min',
                    style: AppTypography.h1.copyWith(
                      color: onSurface,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(eta.label, style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7))),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            EtaProgress(progress: eta.progress),
          ],
          if (driver != null) ...[
            const SizedBox(height: AppSpacing.lg),
            _DriverCard(driver: driver),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(AppSpacing.minTapTarget, AppSpacing.minTapTarget)),
                onPressed: () => context.push(AppRoutes.driverProfileFor(snapshot.tripId)),
                child: Text(l10n.voirLeProfilDuChauffeur),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            _ActionsRow(driver: driver, snapshot: snapshot, eta: eta, onMessage: onMessage),
          ],
          const SizedBox(height: AppSpacing.lg),
          _AddressLine(icon: Icons.trip_origin, label: l10n.depart, address: snapshot.origin.address),
          const SizedBox(height: AppSpacing.sm),
          _AddressLine(icon: Icons.place, label: l10n.arrivee, address: snapshot.destination.address),
        ],
      ),
    );
  }
}

/// ETA affichée : fournie par le serveur quand il en calculera une ;
/// en attendant, estimation prudente à partir de la position du
/// chauffeur (vers le départ si "en route", vers l'arrivée si "en cours").
class _Eta {
  const _Eta(this.minutes, this.label, this.progress);

  final int minutes;
  final String label;
  final double progress;

  static _Eta? compute(TrackingState state, TrackingSnapshot snapshot) {
    final p = state.position;
    if (p == null) return null;
    switch (state.status) {
      case TripStatus.accepted:
        return _Eta(
          estimateEtaMinutes(
            fromLat: p.lat, fromLng: p.lng,
            toLat: snapshot.origin.lat, toLng: snapshot.origin.lng,
            speedKmh: p.speedKmh,
          ),
          l10n.avantLArriveeDuChauffeur,
          0,
        );
      case TripStatus.started:
        return _Eta(
          estimateEtaMinutes(
            fromLat: p.lat, fromLng: p.lng,
            toLat: snapshot.destination.lat, toLng: snapshot.destination.lng,
            speedKmh: p.speedKmh,
          ),
          l10n.avantLArriveeADestination,
          tripProgress(
            originLat: snapshot.origin.lat, originLng: snapshot.origin.lng,
            destLat: snapshot.destination.lat, destLng: snapshot.destination.lng,
            currentLat: p.lat, currentLng: p.lng,
          ),
        );
      default:
        return null;
    }
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.driver});

  final TrackedDriver driver;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7));
    final vehicle = driver.vehicle;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DriverAvatar(firstName: driver.firstName),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(driver.displayName, style: AppTypography.h3.copyWith(color: onSurface)),
              if (driver.rating != null)
                Text(
                  '★ ${formatDecimal(driver.rating!, keepDigits: true)} / 5',
                  semanticsLabel: l10n.noteSur5(formatDecimal(driver.rating!, keepDigits: true)),
                  style: muted,
                ),
              if (vehicle != null) ...[
                if (vehicle.description.isNotEmpty) Text(vehicle.description, style: muted),
                const SizedBox(height: AppSpacing.xs),
                // Plaque : ce qui permet de reconnaître le bon véhicule.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
                  decoration: BoxDecoration(
                    border: Border.all(color: onSurface, width: 1.5),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    vehicle.plate,
                    semanticsLabel: l10n.immatriculation(vehicle.plate.split('').join(' ')),
                    style: AppTypography.bodyBold.copyWith(color: onSurface, letterSpacing: 1.2),
                  ),
                ),
                if (vehicle.dashcamActive || vehicle.pmrEquipped) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.sm,
                    children: [
                      if (vehicle.dashcamActive) _Badge(icon: Icons.videocam_outlined, label: l10n.dashcam),
                      if (vehicle.pmrEquipped) _Badge(icon: Icons.accessible, label: l10n.equipePmr),
                    ],
                  ),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({required this.driver, required this.snapshot, required this.eta, required this.onMessage});

  final TrackedDriver driver;
  final TrackingSnapshot snapshot;
  final _Eta? eta;
  final VoidCallback onMessage;

  @override
  Widget build(BuildContext context) {
    final phone = driver.phone;
    return Row(
      children: [
        Expanded(
          child: _ActionButton(
            icon: Icons.phone,
            label: l10n.appeler,
            // Numéro fourni par le serveur au seul passager, pendant la course.
            onPressed: phone == null ? null : () => launchUrl(Uri(scheme: 'tel', path: phone)),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(child: _ActionButton(icon: Icons.chat_bubble_outline, label: l10n.message, onPressed: onMessage)),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _ActionButton(
            icon: Icons.ios_share,
            label: l10n.partager,
            onPressed: () => _share(context),
          ),
        ),
      ],
    );
  }

  /// Copie un résumé du trajet à envoyer à un proche. Le lien de suivi
  /// en direct (obligatoire pour la navette Rose, Partie 8) demandera un
  /// lien signé côté serveur, pas encore disponible.
  Future<void> _share(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final vehicle = driver.vehicle;
    final text = [
      l10n.jeSuisEnTrajetXlcab(snapshot.destination.address),
      '${l10n.chauffeur3(driver.displayName)}${vehicle != null ? ' — ${vehicle.description.isNotEmpty ? '${vehicle.description}, ' : ''}${l10n.plaqueDansPhrase(vehicle.plate)}' : ''}.',
      if (eta != null) l10n.arriveeEstimeeDansMin(eta!.minutes),
    ].join('\n');
    await Clipboard.setData(ClipboardData(text: text));
    messenger.showSnackBar(
      SnackBar(content: Text(l10n.infosDuTrajetCopieesCollez)),
    );
  }
}

// ── Petits éléments ───────────────────────────────────────────────────────

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.label, required this.onPressed});

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, AppSpacing.buttonHeight),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: AppSpacing.sm),
        foregroundColor: Theme.of(context).colorScheme.onSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusButton)),
      ),
      onPressed: onPressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon),
          const SizedBox(height: 2),
          Text(label, textAlign: TextAlign.center),
        ],
      ),
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
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: onSurface.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(child: Icon(icon, size: 14, color: onSurface)),
          const SizedBox(width: AppSpacing.xs),
          Flexible(child: Text(label, style: AppTypography.caption.copyWith(color: onSurface))),
        ],
      ),
    );
  }
}

class _AddressLine extends StatelessWidget {
  const _AddressLine({required this.icon, required this.label, required this.address});

  final IconData icon;
  final String label;
  final String address;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      label: '$label : $address',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: onSurface.withValues(alpha: 0.7)),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(address, style: AppTypography.body.copyWith(color: onSurface))),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.tooltip, required this.onPressed});

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).scaffoldBackgroundColor,
      shape: const CircleBorder(),
      elevation: 2,
      child: IconButton(tooltip: tooltip, icon: Icon(icon), onPressed: onPressed),
    );
  }
}

/// Bandeau d'état de la connexion : visible seulement hors temps réel.
class _ConnectionBanner extends StatelessWidget {
  const _ConnectionBanner({required this.connection});

  final TrackingConnection connection;

  @override
  Widget build(BuildContext context) {
    final text = switch (connection) {
      TrackingConnection.live => null,
      TrackingConnection.connecting => l10n.connexionAuSuiviEnDirect,
      TrackingConnection.polling => l10n.connexionPerdueMiseAJour,
    };
    if (text == null) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          border: Border.all(color: AppColors.warning, width: 2),
          boxShadow: AppShadows.level2,
        ),
        child: Row(
          children: [
            const ExcludeSemantics(child: Icon(Icons.wifi_off, size: 18)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(text, style: AppTypography.caption.copyWith(color: Theme.of(context).colorScheme.onSurface))),
          ],
        ),
      ),
    );
  }
}
