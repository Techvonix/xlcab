import 'package:flutter/material.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'parcel_checklist.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Actions possibles sur la mission affichée.
class MissionActions {
  const MissionActions({
    required this.onNavigate,
    required this.onCall,
    required this.onScanAndStart,
    required this.onStartWithoutScan,
    required this.onComplete,
    required this.onWithdraw,
    required this.parcels,
  });

  final VoidCallback onNavigate;
  final void Function(String phone) onCall;
  final VoidCallback onScanAndStart;
  final VoidCallback onStartWithoutScan;
  final VoidCallback onComplete;
  final VoidCallback onWithdraw;
  final ParcelActions parcels;
}

/// Mission en cours ou prochaine mission, avec les actions de l'étape :
/// itinéraire → scan du QR et démarrage → colis → fin de course, puis,
/// s'il y a des colis à ramener, l'étape « retour ».
class MissionCard extends StatelessWidget {
  const MissionCard({super.key, required this.mission, required this.actions, this.busy = false});

  final Mission mission;
  final MissionActions actions;

  /// Action en cours d'envoi : boutons désactivés.
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final m = mission;
    final started = m.status == TripStatus.started;
    final returning = m.isReturnStep;
    final shuttle = m.shuttleType;
    final parcels = m.currentParcels;
    final announcedReturn = returning ? const [] : m.returnParcels;

    Widget line(IconData icon, String text, {bool strong = false}) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(child: Icon(icon, size: 18, color: scheme.onSurface.withValues(alpha: 0.7))),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(text, style: (strong ? AppTypography.bodyBold : AppTypography.body).copyWith(color: scheme.onSurface)),
              ),
            ],
          ),
        );

    final title = returning
        ? l10n.retourColisARamener
        : started
            ? l10n.courseEnCours
            : m.isParcelTrip
                ? l10n.navetteColis
                : l10n.prochaineMission;

    final details = [
      if (m.seats > 0) l10n.passager(m.seats, m.seats > 1 ? 's' : ''),
      if (m.childSeats > 0) l10n.siegeEnfant(m.childSeats, m.childSeats > 1 ? 's' : ''),
      if (m.distanceKm != null) formatDistance(m.distanceKm!, locale: locale),
      if (m.durationMin != null) formatDuration(m.durationMin!),
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        // Bande de couleur de la navette (Partie 5), doublée du nom : la
        // couleur ne porte jamais seule l'information.
        border: Border(left: BorderSide(color: shuttle?.color ?? AppColors.secondary, width: 6)),
        boxShadow: AppShadows.level1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
              if (shuttle != null) Text(shuttle.label, style: AppTypography.caption.copyWith(color: scheme.onSurface)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (returning) ...[
            // Sens inverse de la course aller : de son arrivée vers son départ.
            line(Icons.trip_origin, m.destination.address),
            line(Icons.place, m.origin.address),
          ] else ...[
            if (m.scheduledAt != null) line(Icons.event, formatTripDate(m.scheduledAt!, locale: locale), strong: true),
            line(Icons.trip_origin, m.origin.address),
            line(Icons.place, m.destination.address),
            if (details.isNotEmpty) line(Icons.groups_outlined, details),
            if (m.passengerFirstName != null)
              line(Icons.person_outline, m.checkedIn ? l10n.embarque(m.passengerFirstName!) : m.passengerFirstName!),
            if (m.totalPriceCents != null) line(Icons.euro, formatPrice(m.totalPriceCents!, locale: locale)),
          ],
          if (announcedReturn.isNotEmpty)
            line(
              Icons.u_turn_left,
              l10n.colisARamenerAuRetour(announcedReturn.length),
              strong: true,
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.minTapTarget + 4)),
                  icon: const Icon(Icons.navigation_outlined),
                  label: Text(returning ? l10n.itineraireDuRetour : started ? l10n.versLArrivee : l10n.versLeDepart),
                  onPressed: actions.onNavigate,
                ),
              ),
              if (!returning && m.passengerPhone != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.minTapTarget + 4)),
                    icon: const Icon(Icons.call_outlined),
                    label: Text(l10n.appeler),
                    onPressed: () => actions.onCall(m.passengerPhone!),
                  ),
                ),
              ],
            ],
          ),
          if (parcels.isNotEmpty && !m.isParcelTrip) ...[
            const SizedBox(height: AppSpacing.md),
            ParcelChecklist(
              parcels: parcels,
              actions: actions.parcels,
              canPickUp: returning || started || m.canStart(),
              canDeliver: returning || started,
              busy: busy,
            ),
          ],
          if (m.isParcelTrip && parcels.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            // Navette dédiée : enlèvement = démarrage, d'où l'absence du bouton « Scanner » ici.
            ParcelChecklist(parcels: parcels, actions: actions.parcels, canPickUp: false, canDeliver: started, busy: busy),
          ],
          const SizedBox(height: AppSpacing.sm),
          if (returning)
            const SizedBox.shrink()
          else if (started)
            PrimaryButton(icon: Icons.flag_outlined, label: l10n.terminerLaCourse2, onPressed: busy ? null : actions.onComplete)
          else if (m.canStart()) ...[
            PrimaryButton(
              icon: Icons.qr_code_scanner,
              label: m.isParcelTrip ? l10n.scannerLeColisEtDemarrer : l10n.scannerLeQrEtDemarrer,
              onPressed: busy ? null : actions.onScanAndStart,
            ),
            // Le serveur exige le scan du colis pour une navette dédiée.
            if (!m.isParcelTrip)
              TextButton(onPressed: busy ? null : actions.onStartWithoutScan, child: Text(l10n.demarrerSansScanner2)),
          ] else
            Text(
              l10n.demarragePossible1HAvant,
              textAlign: TextAlign.center,
              style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.7)),
            ),
          if (!started && !returning)
            TextButton(onPressed: busy ? null : actions.onWithdraw, child: Text(l10n.meDesisterDeCetteCourse)),
        ],
      ),
    );
  }
}

/// Ligne compacte d'une mission (à venir ou passée).
class MissionTile extends StatelessWidget {
  const MissionTile({super.key, required this.mission});

  final Mission mission;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final m = mission;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: ExcludeSemantics(
        child: Icon(m.isParcelTrip ? Icons.inventory_2_outlined : m.shuttleType?.icon ?? Icons.directions_bus, color: m.shuttleType?.color),
      ),
      title: Text('${m.origin.address} → ${m.destination.address}', maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        [
          if (m.scheduledAt != null) formatTripDate(m.scheduledAt!, locale: locale),
          if (m.isParcelTrip) l10n.colis else l10n.pass(m.seats),
          if (m.parcels.isNotEmpty && !m.isParcelTrip) l10n.colis2(m.parcels.length),
        ].join(' · '),
        style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.7)),
      ),
      trailing: m.totalPriceCents == null ? null : Text(formatPrice(m.totalPriceCents!, locale: locale)),
    );
  }
}
