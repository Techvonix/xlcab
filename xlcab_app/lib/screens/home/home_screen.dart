import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/shuttle.dart';
import '../../models/trip.dart';
import '../../providers/home_provider.dart';
import '../../router.dart';
import '../../services/api_service.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/shuttle_card.dart';
import '../../widgets/xlcab_logo.dart';
import '../accessibility/accessibility_sheet.dart';
import 'widgets/recent_trip_tile.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Écran 4 — Accueil passager (Partie 7) :
/// header avatar + cloche, carte "hero" avec les 2 gros boutons
/// (Réserver un trajet / Envoyer un colis), les 4 navettes, les derniers
/// trajets et la barre de navigation.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recentTrips = ref.watch(recentTripsProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(recentTripsProvider);
            // L'erreur éventuelle est affichée par la section elle-même.
            try {
              await ref.read(recentTripsProvider.future);
            } catch (_) {}
          },
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              const _HomeHeader(),
              const SizedBox(height: AppSpacing.lg),
              const _HeroCard(),
              const SizedBox(height: AppSpacing.xl),
              _SectionTitle(l10n.nosNavettes),
              const SizedBox(height: AppSpacing.md),
              const _ShuttleCarousel(),
              const SizedBox(height: AppSpacing.xl),
              _SectionTitle(l10n.derniersTrajets),
              const SizedBox(height: AppSpacing.md),
              recentTrips.when(
                data: (trips) => trips.isEmpty ? const _EmptyTrips() : _TripList(trips: trips),
                loading: () => Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: CircularProgressIndicator(semanticsLabel: l10n.chargementDeVosTrajets),
                  ),
                ),
                error: (error, _) => _TripsError(
                  message: error is ApiException ? error.message : l10n.impossibleDeChargerVosTrajets,
                  onRetry: () => ref.invalidate(recentTripsProvider),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              // Bourse de transport : lignes régulières et demandes de devis.
              const _MarketCard(),
              const SizedBox(height: AppSpacing.md),
              const _BecomeDriverCard(),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const _HomeNavigationBar(),
    );
  }
}

// ── Header ─────────────────────────────────────────────────────────────────

class _HomeHeader extends StatelessWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Row(
      children: [
        // Avatar : initiales/photo quand GET /users/me sera disponible.
        IconButton(
          tooltip: l10n.monProfil,
          onPressed: () => context.push(AppRoutes.profile),
          icon: CircleAvatar(
            radius: 20,
            backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
            child: Icon(Icons.person, color: Theme.of(context).colorScheme.primary),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.xs),
                child: XlcabLogo(size: 20),
              ),
              Text(l10n.bonjour, style: AppTypography.h2.copyWith(color: onSurface)),
              Text(
                l10n.ouAllonsNousAujourdHui,
                style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7)),
              ),
            ],
          ),
        ),
        // Partie 5 : bouton "Accessibilité" toujours visible.
        IconButton(
          tooltip: l10n.accessibilite,
          icon: const Icon(Icons.accessibility_new),
          onPressed: () => showAccessibilitySheet(context),
        ),
        IconButton(
          tooltip: l10n.notifications,
          icon: const Icon(Icons.notifications_none),
          // Pas encore d'écran ni d'API de notifications (Partie 6 : module
          // Notifications) : on le dit plutôt que de ne rien faire.
          onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.lesNotificationsArriventBientot)),
          ),
        ),
      ],
    );
  }
}

// ── Carte "hero" : les deux actions principales ────────────────────────────

class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        boxShadow: AppShadows.level2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Baseline de la marque (Partie 1.1).
          Text(
            l10n.navettes7PlacesTrajets60,
            style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.7)),
          ),
          const SizedBox(height: AppSpacing.md),
          // Écran 5 (choix de la navette), puis écran 6. Les cartes « Nos
          // navettes » plus bas ouvrent directement l'écran 6.
          PrimaryButton(
            label: l10n.reserverUnTrajet,
            icon: Icons.event_seat,
            onPressed: () => context.push(AppRoutes.shuttleSelection),
          ),
          const SizedBox(height: AppSpacing.sm),
          // Action secondaire : texte foncé + bordure Bleue. Le texte blanc
          // sur fond Bleu #2196F3 n'atteint pas le contraste WCAG AA.
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(AppSpacing.buttonHeight),
              foregroundColor: scheme.onSurface,
              side: const BorderSide(color: AppColors.secondary, width: 2),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
              ),
              textStyle: AppTypography.button,
            ),
            icon: const Icon(Icons.inventory_2_outlined),
            label: Text(l10n.envoyerUnColis, textAlign: TextAlign.center),
            onPressed: () => context.push(AppRoutes.parcelCreation),
          ),
        ],
      ),
    );
  }
}

// ── Navettes ──────────────────────────────────────────────────────────────

class _ShuttleCarousel extends StatelessWidget {
  const _ShuttleCarousel();

  @override
  Widget build(BuildContext context) {
    // SingleChildScrollView + IntrinsicHeight plutôt qu'un ListView de
    // hauteur fixe : la rangée grandit avec le texte (jusqu'à 200 %,
    // Partie 5) au lieu de déborder. Quatre cartes seulement : le coût
    // d'IntrinsicHeight est négligeable.
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final type in ShuttleType.values)
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.sm),
                child: ShuttleCard(
                  type: type,
                  // Disponibilité : aucun endpoint dans la Partie 6 pour
                  // l'instant, donc pas de badge plutôt qu'un faux
                  // "Disponible".
                  available: null,
                  onTap: () => context.push('${AppRoutes.passengerBooking}?type=${type.apiValue}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Derniers trajets ──────────────────────────────────────────────────────

class _TripList extends StatelessWidget {
  const _TripList({required this.trips});

  final List<TripSummary> trips;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final trip in trips) ...[
          RecentTripTile(trip: trip),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}

class _EmptyTrips extends StatelessWidget {
  const _EmptyTrips();

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: Column(
        children: [
          ExcludeSemantics(
            child: Icon(Icons.route, size: 40, color: onSurface.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.aucunTrajetPourLInstant, style: AppTypography.bodyBold.copyWith(color: onSurface)),
          Text(
            l10n.vosProchainsTrajetsApparaitrontIci,
            textAlign: TextAlign.center,
            style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7)),
          ),
        ],
      ),
    );
  }
}

class _TripsError extends StatelessWidget {
  const _TripsError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Column(
        children: [
          ExcludeSemantics(child: Icon(Icons.cloud_off, size: 40, color: onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: AppSpacing.sm),
          Text(message, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: onSurface)),
          const SizedBox(height: AppSpacing.sm),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: Text(l10n.reessayer),
          ),
        ],
      ),
    );
  }
}

// ── Recrutement chauffeurs (Module 8) ─────────────────────────────────────

/// Accès à la candidature chauffeur, en attendant l'écran Profil (écran 13)
/// qui l'accueillera aussi.
class _BecomeDriverCard extends StatelessWidget {
  const _BecomeDriverCard();

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.vousEtesChauffeurVtc, style: AppTypography.bodyBold.copyWith(color: onSurface)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.rejoignezXlcabEtConduisezUne,
            style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7)),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextButton.icon(
            onPressed: () => context.push(AppRoutes.driverOnboarding),
            icon: const Icon(Icons.badge_outlined),
            label: Text(l10n.devenirChauffeurXlcab),
          ),
        ],
      ),
    );
  }
}

/// Bourse de transport : places sur les lignes régulières, demandes de devis.
class _MarketCard extends StatelessWidget {
  const _MarketCard();

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.mkcLignesEtDevis, style: AppTypography.bodyBold.copyWith(color: onSurface)),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.mkcCarteAccueilTexte, style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7))),
          const SizedBox(height: AppSpacing.sm),
          TextButton.icon(
            onPressed: () => context.push(AppRoutes.market),
            icon: const Icon(Icons.alt_route),
            label: Text(l10n.mkcVoirLignesEtDevis),
          ),
        ],
      ),
    );
  }
}

// ── Éléments communs ──────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Text(text, style: AppTypography.h3.copyWith(color: Theme.of(context).colorScheme.onSurface)),
    );
  }
}

class _HomeNavigationBar extends StatelessWidget {
  const _HomeNavigationBar();

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: 0,
      onDestinationSelected: (index) {
        switch (index) {
          case 1:
            context.push(AppRoutes.shuttleSelection);
          case 2:
            context.push(AppRoutes.profile);
        }
      },
      destinations: [
        NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l10n.accueil),
        NavigationDestination(icon: const Icon(Icons.event_seat_outlined), selectedIcon: const Icon(Icons.event_seat), label: l10n.reserver),
        NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l10n.profil),
      ],
    );
  }
}
