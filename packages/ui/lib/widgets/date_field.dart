import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';

/// Champ date en lecture seule qui ouvre le calendrier (style Input de la
/// Partie 5). Utilisé pour les dates d'échéance des documents.
class DateField extends StatelessWidget {
  const DateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.firstDate,
    required this.lastDate,
    this.icon = Icons.event,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTime firstDate;
  final DateTime lastDate;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final text = value == null ? null : DateFormat.yMMMMd(locale).format(value!);
    return Semantics(
      button: true,
      label: '$label : ${text ?? 'non renseignée'}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        onTap: () async {
          final picked = await showDatePicker(
            context: context,
            initialDate: value != null && !value!.isBefore(firstDate) ? value! : firstDate,
            firstDate: firstDate,
            lastDate: lastDate,
            helpText: label,
          );
          if (picked != null) onChanged(picked);
        },
        child: InputDecorator(
          isEmpty: text == null,
          decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon)),
          child: Text(text ?? '', style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.onSurface)),
        ),
      ),
    );
  }
}
