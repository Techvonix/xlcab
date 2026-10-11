import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/booking_service.dart';
import 'package:xlcab_ui/theme/shuttle_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';

/// Écran 5 — Sélection de la navette (Partie 7) : 4 cartes pleine largeur,
/// bande de couleur 6 px, badge « Disponible », prix « à partir de ». Le choix
/// ouvre la réservation (écran 6) avec cette navette présélectionnée.
class ShuttleSelectionScreen extends ConsumerWidget {
  const ShuttleSelectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(shuttleOverviewProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.choisissezVotreNavette)),
      body: overview.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDesNavettes)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(e is ApiException ? e.message : l10n.navettesIndisponibles, textAlign: TextAlign.center),
              const SizedBox(height: AppSpacing.md),
              OutlinedButton(onPressed: () => ref.invalidate(shuttleOverviewProvider), child: Text(l10n.reessayer)),
            ]),
          ),
        ),
        data: (o) => RefreshIndicator(
          onRefresh: () => ref.refresh(shuttleOverviewProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              for (final offer in o.offers) ...[
                _OfferCard(
                  offer: offer,
                  price: formatPrice(offer.fromCents, currency: o.currency, locale: locale),
                  onTap: () => context.push('${AppRoutes.passengerBooking}?type=${offer.type.apiValue}'),
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              Text(l10n.prixPourUnTrajetDe(o.minTripKm), style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.75))),
              if (o.offers.any((x) => x.available != null)) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(l10n.disponibiliteExplication, style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.75))),
              ],
              // Autre façon de voyager : place sur une ligne régulière, ou devis d'opérateurs.
              const SizedBox(height: AppSpacing.md),
              OutlinedButton.icon(
                onPressed: () => context.push(AppRoutes.market),
                icon: const Icon(Icons.alt_route),
                label: Text(l10n.mkcVoirLignesEtDevis),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Carte pleine largeur : bande de couleur, icône, nom, public, badge, prix.
/// La navette n'est jamais identifiée par la couleur seule (Partie 5).
class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.price, required this.onTap});

  final ShuttleOffer offer;
  final String price;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final type = offer.type;
    final availability = switch (offer.available) {
      true => l10n.disponible,
      false => l10n.indisponible2,
      null => '',
    };

    return Semantics(
      button: true,
      label: l10n.offreNavetteSemantique(type.label, type.audience, availability, price),
      excludeSemantics: true,
      child: DecoratedBox(
        // Couleur opaque sous l'ombre : sinon elle transparaît et fausse le contraste.
        decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(AppSpacing.radiusCard), boxShadow: AppShadows.level1),
        child: Material(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 96),
              decoration: BoxDecoration(border: Border(left: BorderSide(color: type.color, width: 6))),
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Icon(type.icon, color: type.color, size: 32),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(type.label, style: AppTypography.h3.copyWith(color: scheme.onSurface)),
                        const SizedBox(height: 2),
                        Text(type.audience, style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
                        const SizedBox(height: AppSpacing.xs),
                        // Sous le nom (et non à côté) : sur un petit écran, le nom garde toute la largeur.
                        Text(
                          l10n.aPartirDe(price),
                          style: AppTypography.bodyBold.copyWith(color: scheme.onSurface, fontFeatures: const [FontFeature.tabularFigures()]),
                        ),
                        if (offer.available != null) ...[
                          const SizedBox(height: AppSpacing.sm),
                          _Badge(available: offer.available!),
                        ],
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, color: scheme.onSurface.withValues(alpha: 0.6)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Badge pill : icône + texte (jamais la couleur seule).
class _Badge extends StatelessWidget {
  const _Badge({required this.available});

  final bool available;

  @override
  Widget build(BuildContext context) {
    final fg = available ? const Color(0xFF1B5E20) : Theme.of(context).colorScheme.onSurface;
    final bg = available ? const Color(0xFFE8F5E9) : Theme.of(context).colorScheme.surfaceContainerHighest;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(available ? Icons.check_circle : Icons.schedule, size: 14, color: fg),
        const SizedBox(width: 4),
        Text(available ? l10n.disponible2 : l10n.indisponible, style: AppTypography.caption.copyWith(color: fg, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}
