import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

/// Bilan CO₂ du voyageur (GET /api/v1/users/me/impact) : une estimation, avec
/// les hypothèses du calcul fournies par le serveur.
class ImpactSummary {
  const ImpactSummary({required this.savedKg, required this.trips, required this.distanceKm, required this.carKgPerKm, required this.shuttleKgPerKm});

  final double savedKg;
  final int trips;
  final int distanceKm;
  final double carKgPerKm;
  final double shuttleKgPerKm;

  factory ImpactSummary.fromJson(Map<String, dynamic>? json) {
    final saved = json?['savedKg'], trips = json?['trips'], km = json?['distanceKm'], method = json?['method'];
    if (saved is! num || trips is! int || km is! num || method is! Map) throw const FormatException('bilan');
    final car = method['carKgPerKm'], shuttle = method['shuttleKgPerKm'];
    if (car is! num || shuttle is! num) throw const FormatException('bilan');
    return ImpactSummary(savedKg: saved.toDouble(), trips: trips, distanceKm: km.round(), carKgPerKm: car.toDouble(), shuttleKgPerKm: shuttle.toDouble());
  }
}

/// Injectable : les tests remplacent ce provider au lieu de simuler le réseau.
final impactProvider = FutureProvider.autoDispose<ImpactSummary>((ref) async {
  try {
    final res = await ref.watch(dioProvider).get<Map<String, dynamic>>('/api/v1/users/me/impact');
    return ImpactSummary.fromJson(res.data);
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  } on FormatException {
    throw ApiException(l10n.reponseInattendueDuServeurReessayez);
  }
});

/// Onglet Impact : CO₂ évité en partageant ses trajets. Le chiffre est
/// toujours accompagné de sa méthode de calcul (jamais un nombre sans hypothèses).
class ImpactScreen extends ConsumerWidget {
  const ImpactScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final impact = ref.watch(impactProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.impactTitre), automaticallyImplyLeading: false),
      body: impact.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.impChargement)),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(e is ApiException ? e.message : l10n.impIndisponible),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(onPressed: () => ref.invalidate(impactProvider), child: Text(l10n.reessayer)),
          ]),
        ),
        data: (s) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(impactProvider);
            try {
              await ref.read(impactProvider.future);
            } catch (_) {}
          },
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(children: [
                    ExcludeSemantics(child: Icon(Icons.eco, size: 56, color: scheme.primary)),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      l10n.impKgEvites(formatDecimal(s.savedKg)),
                      textAlign: TextAlign.center,
                      style: AppTypography.h1.copyWith(color: scheme.onSurface),
                    ),
                    Text(l10n.impSousTitre, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: muted)),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: AppSpacing.md,
                      runSpacing: AppSpacing.xs,
                      children: [
                        Text(l10n.impTrajets(s.trips), style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                        if (s.trips > 0) Text(l10n.impDistance(s.distanceKm), style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                      ],
                    ),
                    if (s.trips == 0) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(l10n.impAucun, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: muted)),
                    ],
                  ]),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Semantics(header: true, child: Text(l10n.impMethodeTitre, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
              const SizedBox(height: AppSpacing.xs),
              Text(
                l10n.impMethode(formatDecimal(s.carKgPerKm, digits: 3), formatDecimal(s.shuttleKgPerKm, digits: 3)),
                style: AppTypography.body.copyWith(color: muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
