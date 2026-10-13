import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

import '../../services/safety_service.dart';

/// Espace sécurité — contacts de confiance (5 au plus) : les proches à qui le
/// passager envoie le lien de suivi de ses trajets, et l'option qui propose
/// ce partage à chaque trajet.
class TrustedContactsScreen extends ConsumerStatefulWidget {
  const TrustedContactsScreen({super.key});

  @override
  ConsumerState<TrustedContactsScreen> createState() => _TrustedContactsScreenState();
}

class _TrustedContactsScreenState extends ConsumerState<TrustedContactsScreen> {
  bool _busy = false;

  /// Choix affichés tout de suite, avant la réponse du serveur.
  bool? _autoSharePending;
  bool? _womanDriverPending;

  void _toast(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _add() async {
    final contact = await showDialog<(String, String)>(context: context, builder: (_) => const _ContactDialog());
    if (contact == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(safetyServiceProvider).addContact(name: contact.$1, phone: contact.$2);
      ref.invalidate(trustedContactsProvider);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(TrustedContact c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.secSupprimerContact(c.name)),
        content: Text(c.phone),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.annuler)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.supprimer)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(safetyServiceProvider).deleteContact(c.id);
      ref.invalidate(trustedContactsProvider);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _setAutoShare(bool value) async {
    setState(() => _autoSharePending = value);
    try {
      await ref.read(feedbackServiceProvider).updatePreferences({'autoShareTrips': value});
      ref.invalidate(notificationPreferencesProvider);
    } on ApiException catch (e) {
      // Échec : l'interrupteur revient à la valeur enregistrée.
      if (mounted) setState(() => _autoSharePending = null);
      _toast(e.message);
    }
  }

  Future<void> _setWomanDriver(bool value) async {
    setState(() => _womanDriverPending = value);
    try {
      await ref.read(feedbackServiceProvider).updatePreferences({'preferWomanDriver': value});
      ref.invalidate(notificationPreferencesProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _womanDriverPending = null);
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(trustedContactsProvider);
    final prefs = ref.watch(notificationPreferencesProvider).valueOrNull;
    final autoShare = _autoSharePending ?? prefs?.autoShareTrips ?? false;
    final womanDriver = _womanDriverPending ?? prefs?.preferWomanDriver ?? false;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final muted = onSurface.withValues(alpha: 0.75);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.secContacts)),
      body: contacts.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.secChargementContacts)),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(e is ApiException ? e.message : l10n.secContactsIndisponibles),
            TextButton(onPressed: () => ref.invalidate(trustedContactsProvider), child: Text(l10n.reessayer)),
          ]),
        ),
        data: (list) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            Text(l10n.secContactsIntro, style: AppTypography.body.copyWith(color: muted)),
            const SizedBox(height: AppSpacing.md),
            if (list.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                child: Text(l10n.secAucunContact, style: AppTypography.body.copyWith(color: onSurface)),
              ),
            for (final c in list)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.person_outline),
                  title: Text(c.name),
                  subtitle: Text(c.phone),
                  trailing: IconButton(
                    tooltip: l10n.secSupprimerContactAction(c.name),
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _delete(c),
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            if (list.length < maxTrustedContacts)
              PrimaryButton(icon: Icons.person_add_alt, label: l10n.secAjouterContact, onPressed: _busy ? null : _add)
            else
              Text(l10n.secContactsMax, textAlign: TextAlign.center, style: AppTypography.caption.copyWith(color: onSurface)),
            const SizedBox(height: AppSpacing.lg),
            Semantics(header: true, child: Text(l10n.secPreferences, style: AppTypography.bodyBold.copyWith(color: onSurface))),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.secPartageAuto),
              subtitle: Text(l10n.secPartageAutoAide),
              value: autoShare,
              onChanged: _setAutoShare,
            ),
            // Une préférence, jamais une exigence : aucun chauffeur n'est écarté.
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.secConductrice),
              subtitle: Text(l10n.secConductriceAide),
              value: womanDriver,
              onChanged: _setWomanDriver,
            ),
          ],
        ),
      ),
    );
  }
}

/// Saisie d'un contact : nom et numéro de téléphone.
class _ContactDialog extends StatefulWidget {
  const _ContactDialog();

  @override
  State<_ContactDialog> createState() => _ContactDialogState();
}

class _ContactDialogState extends State<_ContactDialog> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();

  /// Même règle que le serveur : « + » facultatif puis 6 à 15 chiffres.
  static final _phoneFormat = RegExp(r'^\+?[0-9]{6,15}$');
  static String _digits(String value) => value.replaceAll(RegExp(r'[\s.\-()]'), '');

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    Navigator.pop(context, (_name.text.trim(), _digits(_phone.text)));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(l10n.secAjouterContact),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              maxLength: 60,
              decoration: InputDecoration(labelText: l10n.secNom, counterText: ''),
              validator: (v) => (v ?? '').trim().isEmpty ? l10n.secNomRequis : null,
            ),
            const SizedBox(height: AppSpacing.sm),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.secTelephone),
              validator: (v) => _phoneFormat.hasMatch(_digits(v ?? '')) ? null : l10n.secTelephoneInvalide,
              onFieldSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.annuler)),
        FilledButton(onPressed: _submit, child: Text(l10n.enregistrer)),
      ],
    );
  }
}
