import 'package:flutter/material.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/departure_guarantee.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

/// Seuil de départ garanti d'un départ de ligne : « Départ confirmé », ou
/// « encore N passagers pour confirmer » avec l'échéance et la promesse de
/// remboursement intégral (CLARIFICATION_MODELE.md, section 4.5).
class GuaranteeLine extends StatelessWidget {
  const GuaranteeLine({super.key, required this.guarantee, this.missing = 0, this.showRefund = false});

  final DepartureGuarantee guarantee;

  /// Passagers qui manquent (connu dans la recherche ; 0 = inconnu).
  final int missing;

  /// Ajoute « si le départ n'est pas confirmé avant le …, remboursé intégralement ».
  final bool showRefund;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final g = guarantee;
    final (IconData icon, Color? color, String text) = g.missed
        ? (Icons.cancel_outlined, Theme.of(context).colorScheme.error, l10n.gtAnnule)
        : g.guaranteed
            ? (Icons.verified, AppColors.success, l10n.gtConfirme)
            : (Icons.hourglass_top, null, missing > 0 ? l10n.gtEnAttente(missing) : l10n.gtEnAttenteCourt);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ExcludeSemantics(child: Icon(icon, size: 18, color: color)),
          const SizedBox(width: AppSpacing.xs),
          Expanded(child: Text(text, style: AppTypography.bodyBold)),
        ]),
        if (showRefund && g.pending && g.deadline != null)
          Text(l10n.gtRemboursement(formatTripDate(g.deadline!, locale: locale)), style: AppTypography.caption),
      ]),
    );
  }
}
