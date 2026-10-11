import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../models/trip.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_typography.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/price_display.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Une ligne de la section "Derniers trajets". Ouvre le suivi temps réel
/// quand un chauffeur est attribué (statuts accepted / started).
class RecentTripTile extends StatelessWidget {
  const RecentTripTile({super.key, required this.trip});

  final TripSummary trip;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.7);
    final locale = Localizations.localeOf(context).languageCode;
    final shuttle = trip.shuttleType;
    final canTrack = trip.status.isTrackable;

    return Semantics(
      button: canTrack,
      hint: canTrack ? l10n.ouvreLeSuiviEnTemps : null,
      child: Material(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: canTrack ? () => context.push('/tracking/${trip.id}') : null,
          child: Container(
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(color: shuttle?.color ?? scheme.outline, width: 6),
              ),
            ),
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Navette + statut : icône ET texte, jamais la couleur seule.
                Wrap(
                  spacing: AppSpacing.md,
                  runSpacing: AppSpacing.xs,
                  children: [
                    if (shuttle != null)
                      _IconLabel(icon: shuttle.icon, label: shuttle.label, color: muted),
                    _IconLabel(icon: trip.status.icon, label: trip.status.label, color: scheme.onSurface),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  trip.originAddress,
                  style: AppTypography.bodyBold.copyWith(color: scheme.onSurface),
                  semanticsLabel: l10n.depart2(trip.originAddress),
                ),
                Text(
                  '→ ${trip.destinationAddress}',
                  style: AppTypography.body.copyWith(color: scheme.onSurface),
                  semanticsLabel: l10n.arrivee2(trip.destinationAddress),
                ),
                const SizedBox(height: AppSpacing.sm),
                // Wrap et non Row : avec un texte agrandi à 200 %, le prix
                // passe à la ligne au lieu de déborder. Pleine largeur pour
                // que spaceBetween pousse le prix à droite.
                SizedBox(
                  width: double.infinity,
                  child: Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.end,
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.xs,
                    children: [
                      if (trip.scheduledAt != null)
                        Text(
                          formatTripDate(trip.scheduledAt!, locale: locale),
                          style: AppTypography.caption.copyWith(color: muted),
                        ),
                      if (trip.totalPriceCents != null)
                        PriceDisplay(cents: trip.totalPriceCents!, currency: trip.currency),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _IconLabel extends StatelessWidget {
  const _IconLabel({required this.icon, required this.label, required this.color});

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(child: Icon(icon, size: 16, color: color)),
        const SizedBox(width: AppSpacing.xs),
        Flexible(child: Text(label, style: AppTypography.caption.copyWith(color: color))),
      ],
    );
  }
}
