import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import '../../router.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Ouvre le panneau Accessibilité (Partie 5 : bouton "Accessibilité"
/// toujours visible).
Future<void> showAccessibilitySheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const AccessibilitySheet(),
  );
}

class AccessibilitySheet extends ConsumerWidget {
  const AccessibilitySheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.accessibilite, style: AppTypography.h2.copyWith(color: onSurface)),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              l10n.laTailleDuTexteSuit,
              style: AppTypography.body.copyWith(color: onSurface),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(l10n.affichage, style: AppTypography.bodyBold.copyWith(color: onSurface)),
            const SizedBox(height: AppSpacing.sm),
            SegmentedButton<ThemeMode>(
              segments: [
                ButtonSegment(value: ThemeMode.system, label: Text(l10n.auto), icon: const Icon(Icons.brightness_auto)),
                ButtonSegment(value: ThemeMode.light, label: Text(l10n.clair), icon: const Icon(Icons.light_mode)),
                ButtonSegment(value: ThemeMode.dark, label: Text(l10n.sombre), icon: const Icon(Icons.dark_mode)),
              ],
              selected: {themeMode},
              onSelectionChanged: (selection) =>
                  ref.read(themeModeProvider.notifier).state = selection.first,
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(AppSpacing.buttonHeight),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                ),
              ),
              icon: Icon(ShuttleType.accessibility.icon),
              label: Text(l10n.reserverUneNavetteAccessibilite),
              onPressed: () {
                // Le routeur est récupéré AVANT de fermer le panneau : son
                // contexte n'est plus utilisable une fois fermé.
                final router = GoRouter.of(context);
                Navigator.of(context).pop();
                router.push('${AppRoutes.passengerBooking}?type=${ShuttleType.accessibility.apiValue}');
              },
            ),
          ],
        ),
      ),
    );
  }
}
