import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Offre de mission (écran 15) : 30 s pour accepter ou refuser, puis
/// auto-refus côté serveur. Affichée en bas de l'écran, par-dessus le reste.
class OfferCard extends StatelessWidget {
  const OfferCard({
    super.key,
    required this.offer,
    required this.answering,
    required this.onAccept,
    required this.onRefuse,
  });

  final MissionOffer offer;
  final bool answering;
  final VoidCallback onAccept;
  final VoidCallback onRefuse;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final shuttle = offer.shuttleType;

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

    return Material(
      type: MaterialType.transparency,
      child: Container(
        // Fond opaque obligatoire : sans couleur, l'ombre transparaît sous
        // le contenu et grise le fond (contraste du texte sous 4,5:1).
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          boxShadow: AppShadows.level4,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusModal)),
        ),
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.md),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      // Annoncé par le lecteur d'écran dès l'arrivée de l'offre.
                      liveRegion: true,
                      header: true,
                      child: Text(l10n.nouvelleMission, style: AppTypography.h2.copyWith(color: scheme.onSurface)),
                    ),
                  ),
                  OfferCountdown(expiresAt: offer.expiresAt),
                ],
              ),
              if (shuttle != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Row(children: [
                  ExcludeSemantics(child: Icon(shuttle.icon, size: 18, color: shuttle.color)),
                  const SizedBox(width: AppSpacing.xs),
                  Text(shuttle.label, style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                ]),
              ],
              const SizedBox(height: AppSpacing.md),
              if (offer.pickupDistanceKm != null)
                line(Icons.near_me_outlined, l10n.priseEnChargeA(formatDistance(offer.pickupDistanceKm!, locale: locale))),
              line(Icons.trip_origin, offer.originAddress),
              line(Icons.place, offer.destinationAddress),
              if (offer.scheduledAt != null) line(Icons.event, formatTripDate(offer.scheduledAt!, locale: locale)),
              line(
                Icons.groups_outlined,
                [
                  if (offer.seats > 0) l10n.passager(offer.seats, offer.seats > 1 ? 's' : ''),
                  if (offer.distanceKm != null) formatDistance(offer.distanceKm!, locale: locale),
                ].join(' · '),
              ),
              if (offer.totalPriceCents != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  formatPrice(offer.totalPriceCents!, locale: locale),
                  style: AppTypography.price.copyWith(color: scheme.onSurface),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),
                      onPressed: answering ? null : onRefuse,
                      child: Text(l10n.refuser),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(AppSpacing.buttonHeight),
                        textStyle: AppTypography.button,
                      ),
                      onPressed: answering ? null : onAccept,
                      child: Text(l10n.accepter),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compte à rebours circulaire des 30 s.
class OfferCountdown extends StatefulWidget {
  const OfferCountdown({super.key, required this.expiresAt});

  final DateTime expiresAt;

  @override
  State<OfferCountdown> createState() => _OfferCountdownState();
}

class _OfferCountdownState extends State<OfferCountdown> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.expiresAt.difference(DateTime.now());
    final seconds = left.isNegative ? 0 : (left.inMilliseconds / 1000).ceil();
    final urgent = seconds <= 10;
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: l10n.secondesPourRepondre(seconds),
      excludeSemantics: true,
      child: SizedBox(
        width: 52,
        height: 52,
        child: Stack(
          alignment: Alignment.center,
          children: [
            CircularProgressIndicator(
              value: (seconds / 30).clamp(0.0, 1.0),
              strokeWidth: 4,
              color: urgent ? AppColors.error : AppColors.secondary,
              backgroundColor: scheme.onSurface.withValues(alpha: 0.12),
            ),
            Text('$seconds', style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
          ],
        ),
      ),
    );
  }
}
