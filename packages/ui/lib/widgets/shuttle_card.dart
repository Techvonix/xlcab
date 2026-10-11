import 'package:flutter/material.dart';
import 'package:xlcab_core/models/shuttle.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Carte navette (Partie 5) : rayon 16, bande de couleur 6 px à gauche,
/// badge "Disponible".
///
/// Accessibilité : la navette est identifiée par son nom, son public et
/// son icône, pas seulement par sa couleur ; la carte est annoncée comme
/// un bouton unique par VoiceOver / TalkBack.
class ShuttleCard extends StatelessWidget {
  const ShuttleCard({
    super.key,
    required this.type,
    this.available,
    this.onTap,
    this.width = 168,
  });

  final ShuttleType type;

  /// null = disponibilité inconnue : aucun badge affiché (on n'affirme
  /// pas "Disponible" sans donnée).
  final bool? available;
  final VoidCallback? onTap;
  final double width;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.7);

    final availability = switch (available) {
      true => l10n.disponible,
      false => l10n.indisponible2,
      null => '',
    };

    return Semantics(
      button: true,
      label: '${type.label}, ${type.audience}$availability',
      excludeSemantics: true,
      child: SizedBox(
        width: width,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            boxShadow: AppShadows.level1,
          ),
          child: Material(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Container(
                // Bande de couleur : le rayon est porté par le Material
                // parent (une bordure non uniforme ne peut pas en avoir).
                decoration: BoxDecoration(
                  border: Border(left: BorderSide(color: type.color, width: 6)),
                ),
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(type.icon, color: type.color, size: 28),
                    const SizedBox(height: AppSpacing.sm),
                    Text(type.label, style: AppTypography.h3.copyWith(color: scheme.onSurface)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(type.audience, style: AppTypography.caption.copyWith(color: muted)),
                    if (available != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _AvailabilityBadge(available: available!),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Badge "pill". Texte foncé sur fond teinté : le vert en texte blanc
/// n'atteindrait pas le contraste WCAG AA (4,5:1).
class _AvailabilityBadge extends StatelessWidget {
  const _AvailabilityBadge({required this.available});

  final bool available;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final tint = available ? AppColors.success : onSurface;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(available ? Icons.check_circle : Icons.remove_circle_outline, size: 14, color: tint),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              available ? l10n.disponible2 : l10n.indisponible,
              style: AppTypography.caption.copyWith(color: onSurface, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
