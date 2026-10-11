import 'package:flutter/material.dart';
import '../../../models/driver_application.dart';
import '../../../providers/driver_onboarding_provider.dart';
import '../../../services/document_picker.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_typography.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Envoi d'un document : état (icône + texte, jamais la couleur seule) et
/// deux sources, appareil photo ou galerie.
class DocumentUploadTile extends StatelessWidget {
  const DocumentUploadTile({
    super.key,
    required this.type,
    required this.upload,
    required this.onPick,
  });

  final DriverDocumentType type;
  final DocUpload upload;
  final void Function(DocumentSource source) onPick;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onSurface = scheme.onSurface;
    final busy = upload.status == DocUploadStatus.uploading;

    final (IconData icon, String text, Color color) = switch (upload.status) {
      DocUploadStatus.missing => (Icons.radio_button_unchecked, l10n.nonEnvoye, onSurface.withValues(alpha: 0.7)),
      DocUploadStatus.uploading => (Icons.cloud_upload_outlined, l10n.envoiEnCours, onSurface),
      DocUploadStatus.uploaded => (Icons.check_circle, l10n.recuEnAttenteDeVerification, AppColors.success),
      DocUploadStatus.failed => (Icons.error_outline, l10n.echecDeLEnvoi, AppColors.error),
    };

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        boxShadow: AppShadows.level1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: Icon(type.icon, color: onSurface)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: Text(type.label, style: AppTypography.bodyBold.copyWith(color: onSurface))),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Semantics(
            // Nœud distinct : l'état est annoncé seul, pas fusionné avec
            // le reste de la carte.
            container: true,
            liveRegion: true,
            label: l10n.texte8(type.label, text),
            excludeSemantics: true,
            child: Row(
              children: [
                if (busy)
                  const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                else
                  Icon(icon, size: 18, color: color),
                const SizedBox(width: AppSpacing.xs),
                // Texte en couleur de corps : le vert/rouge seul n'atteint
                // pas le contraste AA, l'icône porte la couleur.
                Expanded(child: Text(text, style: AppTypography.caption.copyWith(color: onSurface))),
              ],
            ),
          ),
          if (upload.error != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(upload.error!, style: AppTypography.caption.copyWith(color: onSurface)),
          ],
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, AppSpacing.minTapTarget + 4)),
                onPressed: busy ? null : () => onPick(DocumentSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(upload.status == DocUploadStatus.uploaded ? l10n.reprendreLaPhoto : l10n.photographier),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, AppSpacing.minTapTarget + 4)),
                onPressed: busy ? null : () => onPick(DocumentSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: Text(l10n.galerie),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
