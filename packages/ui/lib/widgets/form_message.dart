import 'package:flutter/material.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// Encadré de message d'un formulaire (erreur, information, succès), annoncé
/// aux lecteurs d'écran dès qu'il apparaît.
class FormMessage extends StatelessWidget {
  const FormMessage({super.key, required this.text, required this.icon, required this.color});

  final String text;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          border: Border.all(color: color, width: 2),
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        ),
        child: Row(
          children: [
            ExcludeSemantics(child: Icon(icon, color: color)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(text, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.onSurface))),
          ],
        ),
      ),
    );
  }
}
