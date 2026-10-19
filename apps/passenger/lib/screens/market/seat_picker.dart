import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

/// Trajet du passager sur un départ : sans arrêt indiqué, du départ à l'arrivée.
typedef SeatMapKey = ({String departureId, String? boardStopId, String? alightStopId});

/// Sièges déjà pris sur le trajet du passager (revente en cours de trajet : une place
/// quittée avant sa montée est libre).
final seatMapProvider = FutureProvider.autoDispose.family<SeatMap, SeatMapKey>(
  (ref, key) => ref.watch(marketServiceProvider).seatMap(key.departureId, boardStopId: key.boardStopId, alightStopId: key.alightStopId),
);

/// Choix du siège sur un départ de ligne vendu à la place : une grille de
/// sièges numérotés, ceux déjà pris désactivés. Le choix est facultatif
/// (sans choix, le serveur attribue les premiers sièges libres).
///
/// Les sièges sont présentés par numéro, pas selon un plan du véhicule :
/// XLCAB ne connaît pas la disposition intérieure de chaque navette.
class SeatPicker extends ConsumerWidget {
  const SeatPicker({
    super.key,
    required this.departureId,
    this.boardStopId,
    this.alightStopId,
    required this.count,
    required this.selected,
    required this.onChanged,
  });

  final String departureId;

  /// Montée et descente du passager (null : extrémités de la ligne).
  final String? boardStopId;
  final String? alightStopId;

  SeatMapKey get mapKey => (departureId: departureId, boardStopId: boardStopId, alightStopId: alightStopId);

  /// Nombre de places réservées : autant de sièges à choisir.
  final int count;

  /// Sièges choisis, dans l'ordre des touchers.
  final List<int> selected;
  final ValueChanged<List<int>> onChanged;

  void _toggle(int seat) {
    if (selected.contains(seat)) {
      onChanged(selected.where((s) => s != seat).toList());
    } else {
      // Déjà au complet : le plus ancien choix cède sa place au nouveau.
      final kept = selected.length >= count ? selected.sublist(selected.length - count + 1) : selected;
      onChanged([...kept, seat]);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final map = ref.watch(seatMapProvider(mapKey));

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(header: true, child: Text(l10n.sgTitre, style: AppTypography.bodyBold.copyWith(color: scheme.onSurface))),
        ...map.when(
          loading: () => [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, semanticsLabel: l10n.chargement)),
            ),
          ],
          // Plan indisponible : la réservation reste possible, sièges attribués par le serveur.
          error: (_, __) => [Text(l10n.sgPlanIndisponible, style: AppTypography.caption.copyWith(color: muted))],
          data: (seats) => !seats.choosable
              ? const <Widget>[]
              : [
                  Text(l10n.sgAide(count), style: AppTypography.caption.copyWith(color: muted)),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      for (var n = 1; n <= seats.seatsTotal; n++)
                        _SeatButton(
                          number: n,
                          taken: seats.taken.contains(n),
                          chosen: selected.contains(n),
                          onTap: () => _toggle(n),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(l10n.sgDisposition, style: AppTypography.caption.copyWith(color: muted)),
                ],
        ),
      ]),
    );
  }
}

/// Un siège : libre (contour), choisi (plein, couleur de marque) ou pris (désactivé).
class _SeatButton extends StatelessWidget {
  const _SeatButton({required this.number, required this.taken, required this.chosen, required this.onTap});

  final int number;
  final bool taken;
  final bool chosen;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const size = Size(52, 52);
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.radiusButton));
    final label = taken ? l10n.sgSiegePris(number) : (chosen ? l10n.sgSiegeChoisi(number) : l10n.sgSiegeLibre(number));
    final child = ExcludeSemantics(child: Text('$number'));
    // L'état est dit aux lecteurs d'écran, pas seulement montré par la couleur.
    return Semantics(
      button: true,
      enabled: !taken,
      selected: chosen,
      label: label,
      child: chosen
          ? FilledButton(
              onPressed: onTap,
              style: FilledButton.styleFrom(minimumSize: size, fixedSize: size, padding: EdgeInsets.zero, shape: shape),
              child: child,
            )
          : OutlinedButton(
              onPressed: taken ? null : onTap,
              style: OutlinedButton.styleFrom(minimumSize: size, fixedSize: size, padding: EdgeInsets.zero, shape: shape),
              child: child,
            ),
    );
  }
}
