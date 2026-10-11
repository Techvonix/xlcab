import 'package:flutter/material.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

/// Onglet Impact. Écran d'attente : aucun chiffre n'est affiché tant que
/// XLCAB n'a pas arrêté sa méthode de calcul du CO₂ économisé.
class ImpactScreen extends StatelessWidget {
  const ImpactScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.impactTitre)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ExcludeSemantics(child: Icon(Icons.eco_outlined, size: 64, color: scheme.primary)),
              const SizedBox(height: AppSpacing.md),
              Text(l10n.impactBientotTitre, style: AppTypography.h3.copyWith(color: scheme.onSurface), textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.impactBientotTexte,
                style: AppTypography.body.copyWith(color: scheme.onSurface.withValues(alpha: 0.75)),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
