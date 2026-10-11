import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/operator.dart';
import '../../providers/operator_provider.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'offer_messages_sheet.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Bourse de transport côté opérateur : demandes compatibles avec mes
/// véhicules (sans identité ni adresse exacte du client), mes propositions
/// (à reconfirmer quand le client en a choisi une).
class MarketFeedScreen extends ConsumerWidget {
  const MarketFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(myMarketOffersProvider).valueOrNull ?? const [];
    final toConfirm = offers.where((o) => o.status == OfferStatus.accepted).length;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.mkBourse),
          bottom: TabBar(tabs: [
            Tab(text: l10n.mkDemandes),
            Tab(text: toConfirm > 0 ? l10n.mkMesPropositionsAConfirmer(toConfirm) : l10n.mkMesPropositions),
          ]),
        ),
        body: const TabBarView(children: [_FeedTab(), _MyOffersTab()]),
      ),
    );
  }
}

String offerStatusLabel(OfferStatus s) => switch (s) {
      OfferStatus.pending => l10n.mkEnAttenteDuClient,
      OfferStatus.accepted => l10n.mkChoisieAConfirmer,
      OfferStatus.confirmed => l10n.mkConfirmee,
      OfferStatus.declined => l10n.mkRefuseeParVous,
      OfferStatus.withdrawn => l10n.mkRetiree,
      OfferStatus.rejected => l10n.mkNonRetenue,
      OfferStatus.expired => l10n.mkExpiree,
    };

class _FeedTab extends ConsumerWidget {
  const _FeedTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(marketFeedProvider);
    final locale = Localizations.localeOf(context).languageCode;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(marketFeedProvider);
        await ref.read(marketFeedProvider.future);
      },
      child: AsyncBody(
        value: feed,
        loadingLabel: l10n.mkChargementDesDemandes,
        onRetry: () => ref.invalidate(marketFeedProvider),
        data: (items) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            Text(l10n.mkFeedExplication, style: AppTypography.caption),
            const SizedBox(height: AppSpacing.sm),
            if (items.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl), child: Text(l10n.mkAucuneDemande, textAlign: TextAlign.center)),
            for (final r in items)
              OpCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l10n.opTrajet(r.originArea, r.destinationArea), style: AppTypography.bodyBold),
                  Text(
                    '${formatTripDate(r.departureAt, locale: locale)}'
                    '${r.flexMin > 0 ? ' · ${l10n.mkSouplesse(r.flexMin)}' : ''} · ${l10n.mkKm(r.distanceKm)}',
                    style: AppTypography.caption,
                  ),
                  if (r.returnAt != null) Text(l10n.mkRetourLe(formatTripDate(r.returnAt!, locale: locale)), style: AppTypography.caption),
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                    StatusPill(icon: Icons.people_outline, label: l10n.mkPassagers(r.passengers)),
                    if (r.luggage > 0) StatusPill(icon: Icons.luggage_outlined, label: l10n.mkBagages(r.luggage)),
                    if (r.accessible) StatusPill(icon: Icons.accessible, label: l10n.mkAccessible),
                    if (r.recurring) StatusPill(icon: Icons.repeat, label: r.frequency ?? l10n.mkRegulier),
                    if (r.budgetCents != null) StatusPill(label: l10n.mkBudget(formatPrice(r.budgetCents!, locale: locale))),
                  ]),
                  if (r.needs != null) Padding(padding: const EdgeInsets.only(top: AppSpacing.xs), child: Text(r.needs!)),
                  const SizedBox(height: AppSpacing.sm),
                  if (r.myOfferStatus != null)
                    Text(
                      l10n.mkVotreProposition(formatPrice(r.myOfferPriceCents ?? 0, locale: locale), offerStatusLabel(r.myOfferStatus!)),
                      style: AppTypography.bodyBold,
                    )
                  else
                    FilledButton.icon(
                      onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) => ProposeSheet(request: r),
                      ),
                      icon: const Icon(Icons.local_offer_outlined),
                      label: Text(l10n.mkFaireUneProposition),
                    ),
                ]),
              ),
          ],
        ),
      ),
    );
  }
}

/// Proposition de prix : véhicule, prix TTC, horaire (dans la souplesse du client), conditions.
class ProposeSheet extends ConsumerStatefulWidget {
  const ProposeSheet({super.key, required this.request});

  final MarketFeedItem request;

  @override
  ConsumerState<ProposeSheet> createState() => _ProposeSheetState();
}

class _ProposeSheetState extends ConsumerState<ProposeSheet> {
  final _price = TextEditingController();
  final _conditions = TextEditingController();
  String? _vehicleId;
  bool _includesReturn = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _includesReturn = widget.request.returnAt != null;
  }

  @override
  void dispose() {
    _price.dispose();
    _conditions.dispose();
    super.dispose();
  }

  int? get _cents {
    final v = double.tryParse(_price.text.trim().replaceAll(',', '.'));
    return v == null ? null : (v * 100).round();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(marketServiceProvider).propose(
            widget.request.id,
            vehicleId: _vehicleId!,
            priceCents: _cents!,
            includesReturn: _includesReturn,
            conditions: _conditions.text.trim(),
          );
      ref.invalidate(marketFeedProvider);
      ref.invalidate(myMarketOffersProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      showToast(context, l10n.mkPropositionEnvoyee);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicles = ref.watch(operatorVehiclesProvider).valueOrNull ?? const <OperatorVehicle>[];
    final fitting = vehicles.where((v) => v.capacity >= widget.request.passengers && (!widget.request.accessible || v.accessible)).toList();
    final valid = _vehicleId != null && (_cents ?? 0) >= 100;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, MediaQuery.of(context).viewInsets.bottom + AppSpacing.md),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.mkFaireUneProposition, style: AppTypography.h3),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.opVehicule, style: AppTypography.bodyBold),
          if (fitting.isEmpty) Text(l10n.mkAucunVehiculeAdapte),
          Wrap(spacing: AppSpacing.sm, children: [
            for (final v in fitting)
              ChoiceChip(
                label: Text(l10n.opVehiculePlaces(v.label.isEmpty ? l10n.opVehicule : v.label, v.capacity)),
                selected: _vehicleId == v.id,
                onSelected: (_) => setState(() => _vehicleId = v.id),
              ),
          ]),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: InputDecoration(labelText: l10n.mkPrixTtc, suffixText: '€'),
            onChanged: (_) => setState(() {}),
          ),
          if (widget.request.returnAt != null)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _includesReturn,
              onChanged: (v) => setState(() => _includesReturn = v),
              title: Text(l10n.mkRetourCompris),
            ),
          TextField(
            controller: _conditions,
            maxLength: 1000,
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.opConditionsFacultatif),
          ),
          Text(l10n.mkPropositionNEngagePas, style: AppTypography.caption),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: AppSpacing.sm),
          FilledButton(onPressed: !valid || _busy ? null : _send, child: Text(l10n.mkEnvoyerLaProposition)),
        ]),
      ),
    );
  }
}

class _MyOffersTab extends ConsumerStatefulWidget {
  const _MyOffersTab();

  @override
  ConsumerState<_MyOffersTab> createState() => _MyOffersTabState();
}

class _MyOffersTabState extends ConsumerState<_MyOffersTab> {
  bool _busy = false;

  Future<void> _do(Future<void> Function() action, {String? success}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await runAction(context, action, success: success);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      ref.invalidate(myMarketOffersProvider);
      ref.invalidate(marketFeedProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offers = ref.watch(myMarketOffersProvider);
    final locale = Localizations.localeOf(context).languageCode;
    final service = ref.read(marketServiceProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myMarketOffersProvider);
        await ref.read(myMarketOffersProvider.future);
      },
      child: AsyncBody(
        value: offers,
        loadingLabel: l10n.mkChargementDesPropositions,
        onRetry: () => ref.invalidate(myMarketOffersProvider),
        data: (list) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            if (list.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl), child: Text(l10n.mkAucuneProposition, textAlign: TextAlign.center)),
            for (final o in list)
              OpCard(
                highlight: o.status == OfferStatus.accepted,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (o.originArea != null && o.destinationArea != null)
                    Text(l10n.opTrajet(o.originArea!, o.destinationArea!), style: AppTypography.bodyBold),
                  Text(
                    o.passengers == null
                        ? formatPrice(o.priceCents, locale: locale)
                        : '${formatPrice(o.priceCents, locale: locale)} · ${l10n.mkPassagers(o.passengers!)}',
                    style: AppTypography.bodyBold,
                  ),
                  Text('${formatTripDate(o.pickupAt, locale: locale)}${o.includesReturn ? ' · ${l10n.mkRetourCompris}' : ''}', style: AppTypography.caption),
                  const SizedBox(height: AppSpacing.xs),
                  StatusPill(label: offerStatusLabel(o.status)),
                  if (o.status == OfferStatus.accepted && o.confirmDeadline != null)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xs),
                      child: Text(l10n.mkAConfirmerAvant(formatTripDate(o.confirmDeadline!, locale: locale))),
                    ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                    if (o.status == OfferStatus.accepted) ...[
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _do(() => service.confirm(o.id), success: l10n.mkReservationConfirmeeMission),
                        icon: const Icon(Icons.check),
                        label: Text(l10n.mkJeConfirme),
                      ),
                      OutlinedButton(
                        onPressed: _busy ? null : () => _do(() => service.decline(o.id)),
                        child: Text(l10n.mkJeNePeuxPlus),
                      ),
                    ],
                    if (o.status == OfferStatus.pending)
                      OutlinedButton(onPressed: _busy ? null : () => _do(() => service.withdraw(o.id)), child: Text(l10n.mkRetirer)),
                    if ([OfferStatus.pending, OfferStatus.accepted, OfferStatus.confirmed].contains(o.status))
                      TextButton.icon(
                        onPressed: () => showOfferMessages(context, o.id),
                        icon: const Icon(Icons.chat_bubble_outline),
                        label: Text(l10n.mkMessages),
                      ),
                  ]),
                ]),
              ),
          ],
        ),
      ),
    );
  }
}
