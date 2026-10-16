import 'package:flutter/material.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/meeting_point.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

/// Point de rencontre où monter : son nom, les transports à proximité et,
/// en détail (récapitulatif), les consignes d'accès (où attendre exactement).
class MeetingPointLine extends StatelessWidget {
  const MeetingPointLine({super.key, required this.point, this.detailed = false});

  final RoutePointView point;
  final bool detailed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const ExcludeSemantics(child: Icon(Icons.place_outlined, size: 18)),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l10n.stPointDeRencontre(point.name), style: AppTypography.bodyBold),
            if (detailed) Text(point.address, style: AppTypography.caption),
            if (point.transit != null) Text(point.transit!, style: AppTypography.caption),
            if (detailed && point.instructions != null) Text(point.instructions!, style: AppTypography.body),
          ]),
        ),
      ]),
    );
  }
}
