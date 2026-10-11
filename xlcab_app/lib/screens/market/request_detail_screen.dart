import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/market.dart';
import '../../providers/operator_provider.dart';
import '../../router.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import '../operator/offer_messages_sheet.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'line_search_screen.dart' show LineResultCard;
import 'market_home_screen.dart' show requestStatusLabel;
import 'package:xlcab_core/l10n/l10n.dart';

const _open = [RequestStatus.published, RequestStatus.offersReceived];
const _cancellable = [RequestStatus.draft, RequestStatus.published, RequestStatus.offersReceived, RequestStatus.accepted];

/// Une de mes demandes : son statut, les propositions reçues à comparer
/// (prix, horaire, véhicule, opérateur vérifié), les départs de ligne qui y
/// répondent déjà, puis la réservation une fois confirmée par l'opérateur.
class RequestDetailScreen extends ConsumerStatefulWidget {
  const RequestDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends ConsumerState<RequestDetailScreen> {
  bool _busy = false;

  void _refresh() {
    ref.invalidate(marketRequestProvider(widget.requestId));
    ref.invalidate(requestOffersProvider(widget.requestId));
    ref.invalidate(requestLinesProvider(widget.requestId));
    ref.invalidate(myRequestsProvider);
  }

  Future<void> _do(Future<void> Function() action, {String? success}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await runAction(context, action, success: success);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _refresh();
  }

  Future<void> _choose(MarketOffer offer) async {
    final locale = Localizations.localeOf(context).languageCode;
    final ok = await confirmDialog(
      context,
      title: l10n.mkcChoisirCetteProposition,
      body: l10n.mkcChoisirExplication(offer.operatorName ?? l10n.mkcLOperateur, formatPrice(offer.priceCents, locale: locale)),
      action: l10n.mkcChoisir,
    );
    if (ok) await _do(() => ref.read(marketServiceProvider).acceptOffer(offer.id), success: l10n.mkcPropositionChoisie);
  }

  Future<void> _cancel() async {
    final ok = await confirmDialog(context, title: l10n.mkcAnnulerLaDemande, body: l10n.mkcAnnulerLaDemandeExplication, action: l10n.mkcAnnulerLaDemande);
    if (ok) await _do(() => ref.read(marketServiceProvider).cancelRequest(widget.requestId));
  }

  @override
  Widget build(BuildContext context) {
    final request = ref.watch(marketRequestProvider(widget.requestId));
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.mkcMaDemande)),
      body: AsyncBody(
        value: request,
        loadingLabel: l10n.mkChargementDesDemandes,
        onRetry: _refresh,
        data: (r) => RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              Text(l10n.opTrajet(r.origin.address, r.destination.address), style: AppTypography.h3),
              Text(
                [
                  formatTripDate(r.departureAt, locale: locale),
                  if (r.flexMin > 0) l10n.mkSouplesse(r.flexMin),
                  l10n.mkPassagers(r.passengers),
                  if (r.luggage > 0) l10n.mkBagages(r.luggage),
                ].join(' · '),
              ),
              if (r.returnAt != null) Text(l10n.mkRetourLe(formatTripDate(r.returnAt!, locale: locale))),
              if (r.needs != null) Text(r.needs!, style: AppTypography.caption),
              const SizedBox(height: AppSpacing.sm),
              Align(alignment: Alignment.centerLeft, child: StatusPill(label: requestStatusLabel(r))),
              const SizedBox(height: AppSpacing.sm),
              Text(_explanation(r.status), style: AppTypography.caption),

              if (r.tripId != null) ...[
                const SizedBox(height: AppSpacing.md),
                PrimaryButton(
                  icon: Icons.confirmation_number_outlined,
                  label: l10n.mkcVoirMaReservation,
                  onPressed: () => context.push(AppRoutes.confirmationFor(r.tripId!)),
                ),
                if (r.returnTripId != null)
                  TextButton(
                    onPressed: () => context.push(AppRoutes.confirmationFor(r.returnTripId!)),
                    child: Text(l10n.mkcVoirLeRetour),
                  ),
              ],

              if (_open.contains(r.status) || r.status == RequestStatus.accepted) _Offers(requestId: r.id, canChoose: _open.contains(r.status) && !_busy, onChoose: _choose),
              if (_open.contains(r.status)) _Lines(requestId: r.id, seats: r.passengers),

              if (_cancellable.contains(r.status)) ...[
                const SizedBox(height: AppSpacing.lg),
                TextButton(
                  onPressed: _busy ? null : _cancel,
                  child: Text(l10n.mkcAnnulerLaDemande, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _explanation(RequestStatus s) => switch (s) {
        RequestStatus.draft || RequestStatus.published => l10n.mkcExplicationRecherche,
        RequestStatus.offersReceived => l10n.mkcExplicationPropositions,
        RequestStatus.accepted => l10n.mkcExplicationAttente,
        RequestStatus.confirmed || RequestStatus.inProgress => l10n.mkcExplicationConfirmee,
        RequestStatus.completed => l10n.mkcExplicationTerminee,
        RequestStatus.cancelled => l10n.mkcExplicationAnnulee,
        RequestStatus.expired => l10n.mkcExplicationExpiree,
      };
}

class _Offers extends ConsumerWidget {
  const _Offers({required this.requestId, required this.canChoose, required this.onChoose});

  final String requestId;
  final bool canChoose;
  final ValueChanged<MarketOffer> onChoose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(requestOffersProvider(requestId));
    final locale = Localizations.localeOf(context).languageCode;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(l10n.mkcPropositionsRecues),
      AsyncBody(
        value: offers,
        loadingLabel: l10n.mkChargementDesPropositions,
        onRetry: () => ref.invalidate(requestOffersProvider(requestId)),
        data: (list) {
          final shown = list.where((o) => [OfferStatus.pending, OfferStatus.accepted, OfferStatus.confirmed].contains(o.status)).toList();
          if (shown.isEmpty) return Text(l10n.mkcAucunePropositionPourLInstant);
          return Column(children: [
            for (final o in shown)
              OpCard(
                highlight: o.status == OfferStatus.accepted,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(o.operatorName ?? l10n.mkcLOperateur, style: AppTypography.bodyBold),
                        Text(
                          [
                            if (o.vehicleLabel != null && o.vehicleLabel!.isNotEmpty) o.vehicleLabel!,
                            if (o.vehicleCapacity != null) l10n.opPlaces(o.vehicleCapacity!),
                            o.operatorRating == null ? l10n.mkcPasEncoreNote : l10n.mkcNote(formatDecimal(o.operatorRating!), o.operatorRatingCount),
                          ].join(' · '),
                          style: AppTypography.caption,
                        ),
                      ]),
                    ),
                    Text(formatPrice(o.priceCents, locale: locale), style: AppTypography.h3),
                  ]),
                  Text(
                    '${l10n.mkcPriseEnCharge(formatTripDate(o.pickupAt, locale: locale))}${o.includesReturn ? ' · ${l10n.mkRetourCompris}' : ''}',
                    style: AppTypography.caption,
                  ),
                  if (o.conditions != null) Text(o.conditions!, style: AppTypography.caption),
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                    if (o.operatorVerified) StatusPill(icon: Icons.verified_outlined, label: l10n.mkcRaisonOperateurVerifie),
                    if (o.vehicleAccessible) StatusPill(icon: Icons.accessible, label: l10n.mkAccessible),
                    if (o.status == OfferStatus.accepted) StatusPill(icon: Icons.hourglass_top, label: l10n.mkcEnAttenteDeConfirmation),
                  ]),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                    if (o.status == OfferStatus.pending) FilledButton(onPressed: canChoose ? () => onChoose(o) : null, child: Text(l10n.mkcChoisir)),
                    TextButton.icon(
                      onPressed: () => showOfferMessages(context, o.id),
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: Text(l10n.mkcPoserUneQuestion),
                    ),
                  ]),
                ]),
              ),
          ]);
        },
      ),
    ]);
  }
}

/// Départs de lignes régulières qui répondent déjà à la demande : réservables tout de suite.
class _Lines extends ConsumerWidget {
  const _Lines({required this.requestId, required this.seats});

  final String requestId;
  final int seats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lines = ref.watch(requestLinesProvider(requestId)).valueOrNull ?? const <LineSearchResult>[];
    if (lines.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(l10n.mkcLignesCompatibles),
      Text(l10n.mkcLignesCompatiblesTexte, style: AppTypography.caption),
      const SizedBox(height: AppSpacing.sm),
      for (final l in lines) LineResultCard(result: l, seats: seats),
    ]);
  }
}
