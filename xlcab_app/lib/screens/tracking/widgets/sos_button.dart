import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../providers/tracking_provider.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Numéro d'urgence européen, joignable depuis tous les pays de l'UE.
const emergencyNumber = '112';

/// Bouton SOS rouge (Partie 7, écran 9), toujours visible sur la carte.
///
/// Un appui ouvre un choix explicite plutôt que d'envoyer directement :
/// évite les alertes accidentelles, et met en avant le 112, qui ne
/// dépend ni du réseau de l'app ni de la disponibilité de XLCAB.
class SosButton extends StatelessWidget {
  const SosButton({super.key, required this.onSendAlert});

  /// Envoie l'alerte à XLCAB (position jointe).
  final Future<SosResult> Function() onSendAlert;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: l10n.sosAlerteDUrgence,
      excludeSemantics: true,
      child: Material(
        color: AppColors.error,
        shape: const StadiumBorder(),
        elevation: 4,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: () => _openSosDialog(context),
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
            // Blanc sur #F44336 : 3,7:1, suffisant pour un texte en gras
            // de 18 px et plus (seuil WCAG "grand texte" : 3:1).
            child: Text(
              'SOS',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: 1.5,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openSosDialog(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final choice = await showDialog<_SosChoice>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 40),
        title: Text(l10n.besoinDAide),
        content: Text(
          l10n.enCasDeDangerImmediat2 +
          l10n.vousPouvezAussiAlerterL +
          l10n.transmiseAvecLAlerte,
        ),
        actionsOverflowDirection: VerticalDirection.down,
        actionsOverflowButtonSpacing: AppSpacing.sm,
        actions: [
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            icon: const Icon(Icons.phone),
            label: Text(l10n.appelerLe(emergencyNumber), style: AppTypography.button.copyWith(fontWeight: FontWeight.w700, fontSize: 18)),
            onPressed: () => Navigator.of(context).pop(_SosChoice.call112),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.campaign_outlined),
            label: Text(l10n.alerterXlcab),
            onPressed: () => Navigator.of(context).pop(_SosChoice.alertXlcab),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.annuler),
          ),
        ],
      ),
    );

    switch (choice) {
      case _SosChoice.call112:
        await launchUrl(Uri(scheme: 'tel', path: emergencyNumber));
      case _SosChoice.alertXlcab:
        final result = await onSendAlert();
        messenger.showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 8),
            content: Text(
              result == SosResult.sent
                  ? l10n.alerteEnvoyeeALEquipe
                  : l10n.alerteNonTransmiseAppelezLe(emergencyNumber),
            ),
            action: result == SosResult.sent
                ? null
                : SnackBarAction(
                    label: l10n.appeler,
                    onPressed: () => launchUrl(Uri(scheme: 'tel', path: emergencyNumber)),
                  ),
          ),
        );
      case null:
        break;
    }
  }
}

enum _SosChoice { call112, alertXlcab }
