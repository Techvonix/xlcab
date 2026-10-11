import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/market.dart';
import '../../providers/operator_provider.dart';
import '../../router.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Bourse de transport côté client : réserver une place sur une ligne
/// régulière, demander des devis, suivre ses demandes.
class MarketHomeScreen extends ConsumerWidget {
  const MarketHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(myRequestsProvider);
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.mkcLignesEtDevis)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myRequestsProvider);
          await ref.read(myRequestsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            _Choice(
              icon: Icons.alt_route,
              title: l10n.mkcLignesRegulieres,
              text: l10n.mkcLignesRegulieresTexte,
              onTap: () => context.push(AppRoutes.lineSearch),
            ),
            _Choice(
              icon: Icons.request_quote_outlined,
              title: l10n.mkcDemanderDesDevis,
              text: l10n.mkcDemanderDesDevisTexte,
              onTap: () => context.push(AppRoutes.requestNew),
            ),
            SectionTitle(l10n.mkcMesDemandes),
            AsyncBody(
              value: requests,
              loadingLabel: l10n.mkChargementDesDemandes,
              onRetry: () => ref.invalidate(myRequestsProvider),
              data: (list) => Column(children: [
                if (list.isEmpty) Padding(padding: const EdgeInsets.all(AppSpacing.md), child: Text(l10n.mkcAucuneDemande, textAlign: TextAlign.center)),
                for (final r in list)
                  OpCard(
                    highlight: r.status == RequestStatus.offersReceived,
                    child: InkWell(
                      onTap: () => context.push(AppRoutes.requestDetailFor(r.id)),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(l10n.opTrajet(r.origin.address, r.destination.address), style: AppTypography.bodyBold),
                            Text('${formatTripDate(r.departureAt, locale: locale)} · ${l10n.mkPassagers(r.passengers)}', style: AppTypography.caption),
                            const SizedBox(height: AppSpacing.xs),
                            StatusPill(label: requestStatusLabel(r)),
                          ]),
                        ),
                        const ExcludeSemantics(child: Icon(Icons.chevron_right)),
                      ]),
                    ),
                  ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

/// Statut d'une demande, en clair pour le client.
String requestStatusLabel(MarketRequest r) => switch (r.status) {
      RequestStatus.draft => l10n.mkcStatutBrouillon,
      RequestStatus.published => l10n.mkcStatutRecherche,
      RequestStatus.offersReceived => l10n.mkcStatutPropositions(r.openOffers),
      RequestStatus.accepted => l10n.mkcStatutAttenteOperateur,
      RequestStatus.confirmed => l10n.mkcStatutConfirmee,
      RequestStatus.inProgress => l10n.mkcStatutEnCours,
      RequestStatus.completed => l10n.mkcStatutTerminee,
      RequestStatus.cancelled => l10n.mkcStatutAnnulee,
      RequestStatus.expired => l10n.mkcStatutExpiree,
    };

class _Choice extends StatelessWidget {
  const _Choice({required this.icon, required this.title, required this.text, required this.onTap});

  final IconData icon;
  final String title;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => OpCard(
        child: InkWell(
          onTap: onTap,
          child: Row(children: [
            ExcludeSemantics(child: Icon(icon, size: 32)),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: AppTypography.bodyBold),
                Text(text, style: AppTypography.caption),
              ]),
            ),
            const ExcludeSemantics(child: Icon(Icons.chevron_right)),
          ]),
        ),
      );
}
