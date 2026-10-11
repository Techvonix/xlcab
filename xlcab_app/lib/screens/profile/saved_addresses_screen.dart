import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/driver_public_profile.dart';
import '../../services/api_service.dart';
import '../../services/feedback_service.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../widgets/primary_button.dart';
import '../booking/parcel_creation_screen.dart' show addressPickerProvider;
import 'package:xlcab_app/l10n/l10n.dart';

/// Écran 13 — Adresses favorites (10 au plus), proposées en tête de la
/// recherche d'adresse lors d'une réservation.
class SavedAddressesScreen extends ConsumerStatefulWidget {
  const SavedAddressesScreen({super.key});

  @override
  ConsumerState<SavedAddressesScreen> createState() => _SavedAddressesScreenState();
}

class _SavedAddressesScreenState extends ConsumerState<SavedAddressesScreen> {
  bool _busy = false;

  void _toast(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _add() async {
    final place = await ref.read(addressPickerProvider)(context, l10n.nouvelleAdresseFavorite);
    if (place == null || !mounted) return;
    final label = await showDialog<String>(context: context, builder: (_) => const _LabelDialog());
    if (label == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(feedbackServiceProvider).saveAddress(label: label, address: place.address, lat: place.lat, lng: place.lng);
      ref.invalidate(savedAddressesProvider);
      _toast(l10n.ajouteeAVosAdresses(label));
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(SavedAddress a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.supprimer2(a.label)),
        content: Text(a.address),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.annuler)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.supprimer)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(feedbackServiceProvider).deleteAddress(a.id);
      ref.invalidate(savedAddressesProvider);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final addresses = ref.watch(savedAddressesProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.adressesFavorites)),
      body: addresses.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDesAdresses)),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(e is ApiException ? e.message : l10n.adressesIndisponibles),
            TextButton(onPressed: () => ref.invalidate(savedAddressesProvider), child: Text(l10n.reessayer)),
          ]),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (list.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Text(
                  l10n.enregistrezVosAdressesHabituellesMaison,
                  textAlign: TextAlign.center,
                  style: AppTypography.body.copyWith(color: onSurface),
                ),
              ),
            for (final a in list)
              Card(
                child: ListTile(
                  leading: Icon(_iconFor(a.label)),
                  title: Text(a.label),
                  subtitle: Text(a.address),
                  trailing: IconButton(
                    tooltip: l10n.supprimer3(a.label),
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _delete(a),
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            if (list.length < 10)
              PrimaryButton(icon: Icons.add_location_alt_outlined, label: l10n.ajouterUneAdresse, onPressed: _busy ? null : _add)
            else
              Text(l10n.n10AdressesAuMaximumSupprimez, textAlign: TextAlign.center, style: AppTypography.caption.copyWith(color: onSurface)),
          ],
        ),
      ),
    );
  }

  static IconData _iconFor(String label) {
    final l = label.toLowerCase();
    // Mots-clés français et anglais (libellés proposés dans les deux langues).
    if (l.contains('maison') || l.contains('domicile') || l.contains('home')) return Icons.home_outlined;
    if (l.contains('travail') || l.contains('bureau') || l.contains('work') || l.contains('office')) return Icons.work_outline;
    if (l.contains('gare') || l.contains('aéroport') || l.contains('aeroport') || l.contains('station') || l.contains('airport')) return Icons.train_outlined;
    return Icons.place_outlined;
  }
}

/// Nom de l'adresse : suggestions rapides ou saisie libre.
class _LabelDialog extends StatefulWidget {
  const _LabelDialog();

  @override
  State<_LabelDialog> createState() => _LabelDialogState();
}

class _LabelDialogState extends State<_LabelDialog> {
  final _label = TextEditingController();

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = _label.text.trim();
    return AlertDialog(
      title: Text(l10n.nomDeLAdresse),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            children: [
              for (final s in [l10n.maison, l10n.travail, l10n.famille])
                ActionChip(label: Text(s), onPressed: () => setState(() => _label.text = s)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _label,
            maxLength: 40,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.nom),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.annuler)),
        FilledButton(onPressed: value.isEmpty ? null : () => Navigator.pop(context, value), child: Text(l10n.enregistrer)),
      ],
    );
  }
}
