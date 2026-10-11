import 'package:flutter/material.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// L'espace chauffeur n'est plus dans l'application passager : on indique
/// où le trouver (application XLCAB Driver, même compte).
Future<void> showDriverAppInfo(BuildContext context) => showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.appliChauffeurTitre),
        content: Text(l10n.appliChauffeurTexte),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.compris))],
      ),
    );
