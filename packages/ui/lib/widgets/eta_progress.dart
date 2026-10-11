import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Barre ETA (Partie 5) : 4 px, dégradé Rose → Bleu, animation 300 ms
/// ease-out à chaque mise à jour.
class EtaProgress extends StatelessWidget {
  const EtaProgress({super.key, required this.progress, this.semanticsLabel});

  /// 0..1.
  final double progress;
  /// Par défaut : « Avancement du trajet » dans la langue courante.
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final value = progress.clamp(0.0, 1.0);
    final track = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.12);

    return Semantics(
      label: semanticsLabel ?? l10n.avancementDuTrajet,
      value: '${(value * 100).round()} %',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppSpacing.etaBarHeight / 2),
        child: SizedBox(
          height: AppSpacing.etaBarHeight,
          child: Stack(
            children: [
              Positioned.fill(child: ColoredBox(color: track)),
              TweenAnimationBuilder<double>(
                tween: Tween(end: value),
                duration: AppDurations.standard,
                curve: AppDurations.enterCurve,
                builder: (context, v, _) => FractionallySizedBox(
                  widthFactor: v,
                  heightFactor: 1,
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [AppColors.brandDeep, AppColors.brand]),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
