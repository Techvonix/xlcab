import 'package:flutter/material.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Écran placeholder — sera implémenté selon la Partie 7 de la
/// spécification maître (module dédié, voir Partie 9).
class CorporatePortalScreen extends StatelessWidget {
  const CorporatePortalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: Text(l10n.portailCorporateAVenir)),
    );
  }
}
