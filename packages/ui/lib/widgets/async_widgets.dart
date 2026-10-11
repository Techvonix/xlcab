import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

// Briques communes de l'espace opérateur (lignes, départs, bourse).

/// Contenu d'un FutureProvider : chargement, erreur avec « Réessayer », données.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.onRetry, required this.data, required this.loadingLabel});

  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T data) data;
  final String loadingLabel;

  @override
  Widget build(BuildContext context) => value.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: loadingLabel)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(e is ApiException ? e.message : l10n.opChargementImpossible, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.md),
              OutlinedButton(onPressed: onRetry, child: Text(l10n.reessayer)),
            ]),
          ),
        ),
        data: data,
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
        child: Semantics(
          header: true,
          child: Text(text, style: AppTypography.h3.copyWith(color: Theme.of(context).colorScheme.onSurface)),
        ),
      );
}

/// Pastille de statut : texte toujours présent (jamais la couleur seule).
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[ExcludeSemantics(child: Icon(icon, size: 14, color: scheme.onSecondaryContainer)), const SizedBox(width: 4)],
        Text(label, style: AppTypography.caption.copyWith(color: scheme.onSecondaryContainer, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// Carte opaque (ombre sans transparence sous le texte : contraste AA).
class OpCard extends StatelessWidget {
  const OpCard({super.key, required this.child, this.highlight = false});

  final Widget child;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: highlight ? AppColors.primaryButton : scheme.outlineVariant, width: highlight ? 2 : 1),
      ),
      child: child,
    );
  }
}

void showToast(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));

/// Exécute une action réseau ; affiche son erreur. Renvoie true si elle a réussi.
Future<bool> runAction(BuildContext context, Future<void> Function() action, {String? success}) async {
  try {
    await action();
    if (success != null && context.mounted) showToast(context, success);
    return true;
  } on ApiException catch (e) {
    if (context.mounted) showToast(context, e.message);
    return false;
  }
}

Future<bool> confirmDialog(BuildContext context, {required String title, required String body, required String action}) async {
  final res = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.retour)),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(action),
        ),
      ],
    ),
  );
  return res == true;
}

/// Saisie d'un texte (motif, justificatif) d'au moins [minLength] caractères.
Future<String?> textDialog(
  BuildContext context, {
  required String title,
  required String label,
  required String action,
  String? intro,
  int minLength = 5,
  int maxLength = 500,
}) =>
    showDialog<String>(
      context: context,
      builder: (_) => _TextDialog(title: title, label: label, action: action, intro: intro, minLength: minLength, maxLength: maxLength),
    );

class _TextDialog extends StatefulWidget {
  const _TextDialog({required this.title, required this.label, required this.action, required this.minLength, required this.maxLength, this.intro});

  final String title;
  final String label;
  final String action;
  final String? intro;
  final int minLength;
  final int maxLength;

  @override
  State<_TextDialog> createState() => _TextDialogState();
}

class _TextDialogState extends State<_TextDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = _text.text.trim();
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (widget.intro != null) ...[Text(widget.intro!), const SizedBox(height: AppSpacing.md)],
          TextField(
            controller: _text,
            minLines: 2,
            maxLines: 5,
            maxLength: widget.maxLength,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: widget.label, helperText: l10n.opCaracteresMinimum(widget.minLength)),
            onChanged: (_) => setState(() {}),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.retour)),
        FilledButton(
          onPressed: value.length < widget.minLength ? null : () => Navigator.of(context).pop(value),
          child: Text(widget.action),
        ),
      ],
    );
  }
}

/// Nom court d'un jour ISO (1 = lundi … 7 = dimanche) dans la langue affichée.
String dayShort(int isoDay) => switch (isoDay) {
      1 => l10n.opLun,
      2 => l10n.opMar,
      3 => l10n.opMer,
      4 => l10n.opJeu,
      5 => l10n.opVen,
      6 => l10n.opSam,
      _ => l10n.opDim,
    };

/// « Tous les jours », « Du lundi au vendredi » ou « Lun, Mer, Ven ».
String daysLabel(List<int> days) {
  final sorted = [...days]..sort();
  if (sorted.length == 7) return l10n.opTousLesJours;
  if (sorted.join(',') == '1,2,3,4,5') return l10n.opDuLundiAuVendredi;
  return sorted.map(dayShort).join(', ');
}

/// Date locale au format de l'API ("AAAA-MM-JJ").
String apiDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Heure au format de l'API ("HH:MM").
String apiTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
