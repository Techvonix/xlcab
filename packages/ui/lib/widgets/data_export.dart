import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/services/api_service.dart';

import 'async_widgets.dart';
import 'legal_links.dart';

/// Droit d'accès (RGPD) : « Télécharger mes données », dans le Compte des deux
/// applis. Le serveur fournit un lien de 5 minutes, à usage unique ; le
/// navigateur du téléphone télécharge le fichier (l'appli n'écrit rien).
class DataExportTile extends ConsumerStatefulWidget {
  const DataExportTile({super.key});

  @override
  ConsumerState<DataExportTile> createState() => _DataExportTileState();
}

class _DataExportTileState extends ConsumerState<DataExportTile> {
  bool _busy = false;

  Future<void> _export() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.expTitre),
        content: Text(l10n.expExplication),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.annuler)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(l10n.expTelecharger)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final url = await ref.read(accountServiceProvider).exportLink();
      final opened = await ref.read(legalLinkOpenerProvider)(url);
      if (mounted) showToast(context, opened ? l10n.expOuvert : l10n.impossibleDOuvrirLeLien);
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.download_outlined),
        title: Text(l10n.expTitre),
        subtitle: Text(l10n.expSousTitre),
        trailing: _busy
            ? SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2, semanticsLabel: l10n.expPreparation))
            : const Icon(Icons.chevron_right),
        onTap: _busy ? null : _export,
      );
}
