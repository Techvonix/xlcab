import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/providers/locale_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'package:xlcab_core/services/account_service.dart';

import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

// Réglages d'affichage communs aux applications passager et chauffeur.

/// Langue de l'interface : celle du téléphone par défaut. Le choix est aussi
/// enregistré sur le compte (langue des futurs e-mails et notifications).
class LanguageSelector extends ConsumerWidget {
  const LanguageSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = ref.watch(localeProvider)?.languageCode ?? 'system';
    return ChoiceGroup<String>(
      title: l10n.langue,
      selected: code,
      options: [
        ('system', l10n.langueDuTelephone, Icons.smartphone),
        // Chaque langue est écrite dans sa propre langue.
        ('fr', 'Français', null),
        ('en', 'English', null),
      ],
      onSelected: (choice) {
        ref.read(localeProvider.notifier).state = choice == 'system' ? null : Locale(choice);
        final effective = choice == 'system' ? resolveAppLocale(WidgetsBinding.instance.platformDispatcher.locale).languageCode : choice;
        // Sans réseau, le choix reste valable sur l'appareil.
        ref.read(accountServiceProvider).updateLocale(effective).catchError((_) {});
      },
    );
  }
}

/// Apparence : système, clair ou sombre (mémorisée sur l'appareil).
class ThemeSelector extends ConsumerWidget {
  const ThemeSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return ChoiceGroup<ThemeMode>(
      title: l10n.apparence,
      selected: mode,
      options: [
        (ThemeMode.system, l10n.systeme, Icons.brightness_auto),
        (ThemeMode.light, l10n.clair, Icons.light_mode_outlined),
        (ThemeMode.dark, l10n.sombre, Icons.dark_mode_outlined),
      ],
      onSelected: (m) => ref.read(themeModeProvider.notifier).state = m,
    );
  }
}

/// Choix exclusif en pastilles : passent à la ligne sur un petit écran ou avec
/// un texte agrandi (Partie 5 : jusqu'à 200 %), au lieu de couper les mots
/// comme un SegmentedButton.
class ChoiceGroup<T> extends StatelessWidget {
  const ChoiceGroup({super.key, required this.title, required this.selected, required this.options, required this.onSelected});

  final String title;
  final T selected;
  final List<(T, String, IconData?)> options;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTypography.bodyBold.copyWith(color: onSurface)),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final (value, label, icon) in options)
              ChoiceChip(
                avatar: icon == null ? null : Icon(icon, size: 18),
                label: Text(label),
                selected: value == selected,
                onSelected: (_) => onSelected(value),
              ),
          ],
        ),
      ],
    );
  }
}
