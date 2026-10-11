import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

import '../../services/booking_service.dart';

/// Colis de l'expéditeur, parmi ses 50 dernières réservations (l'historique
/// est commun aux trajets et aux colis).
final myParcelsProvider = FutureProvider.autoDispose<List<TripSummary>>((ref) async {
  final history = await ref.watch(bookingServiceProvider).history(limit: 50, page: 1);
  return history.where((t) => t.parcelId != null).toList();
});

/// Onglet Colis : envoyer un colis et retrouver ceux déjà confiés à XLCAB.
class ParcelsScreen extends ConsumerWidget {
  const ParcelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final parcels = ref.watch(myParcelsProvider);
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.colisMesColis)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myParcelsProvider);
          // L'erreur éventuelle est affichée par la liste elle-même.
          try {
            await ref.read(myParcelsProvider.future);
          } catch (_) {}
        },
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            Text(l10n.colisIntro, style: AppTypography.body.copyWith(color: muted)),
            const SizedBox(height: AppSpacing.md),
            FilledButton.icon(
              onPressed: () => context.push(AppRoutes.parcelCreation),
              icon: const Icon(Icons.add_box_outlined),
              label: Text(l10n.envoyerUnColis),
            ),
            const SizedBox(height: AppSpacing.lg),
            ...parcels.when(
              loading: () => [
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.colisChargement)),
                ),
              ],
              error: (e, _) => [
                Text(e is ApiException ? e.message : l10n.colisIndisponible),
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: OutlinedButton(onPressed: () => ref.invalidate(myParcelsProvider), child: Text(l10n.reessayer)),
                ),
              ],
              data: (list) => list.isEmpty
                  ? [Text(l10n.colisAucun, style: AppTypography.body.copyWith(color: muted))]
                  : [
                      for (final t in list)
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                          leading: const ExcludeSemantics(child: Icon(Icons.inventory_2_outlined)),
                          title: Text('${t.originAddress} → ${t.destinationAddress}', maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                            [
                              if (t.scheduledAt != null) formatTripDate(t.scheduledAt!, locale: locale),
                              t.status.label,
                            ].join(' · '),
                            style: AppTypography.caption.copyWith(color: muted),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push(AppRoutes.parcelTrackingFor(t.parcelId!)),
                        ),
                    ],
            ),
          ],
        ),
      ),
    );
  }
}
