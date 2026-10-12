import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import '../../providers/home_provider.dart';
import 'package:xlcab_core/providers/market_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_ui/screens/address_search_screen.dart' show addressPickerProvider;
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

import '../../models/return_trip.dart';
import 'seat_picker.dart';

/// Recherche d'un départ de ligne régulière et réservation de places.
class LineSearchScreen extends ConsumerStatefulWidget {
  const LineSearchScreen({super.key, this.initial});

  /// « Réserver le retour » : adresses (déjà inversées) et places préremplies.
  final ReturnTripRequest? initial;

  @override
  ConsumerState<LineSearchScreen> createState() => _LineSearchScreenState();
}

class _LineSearchScreenState extends ConsumerState<LineSearchScreen> {
  late Place? _from = widget.initial?.origin;
  late Place? _to = widget.initial?.destination;
  DateTime? _date;
  late int _seats = (widget.initial?.seats ?? 1).clamp(1, 20);
  bool _loading = false;
  String? _error;
  List<LineSearchResult>? _results;

  DateTime get _today {
    final now = ref.read(clockProvider)();
    return DateTime(now.year, now.month, now.day);
  }

  Future<void> _pickPlace(bool from) async {
    final place = await ref.read(addressPickerProvider)(context, from ? l10n.mkcDepart : l10n.mkcArrivee);
    if (place == null || !mounted) return;
    setState(() => from ? _from = place : _to = place);
  }

  Future<void> _pickDate() async {
    final today = _today;
    final picked = await ref.read(datePickerProvider)(context, today, today.add(const Duration(days: 30)), _date ?? today.add(const Duration(days: 1)));
    if (picked != null && mounted) setState(() => _date = picked);
  }

  Future<void> _search() async {
    if (_from == null || _to == null) {
      setState(() => _error = l10n.opChoisissezDepartEtArrivee);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await ref.read(marketServiceProvider).searchLines(
            from: _from!,
            to: _to!,
            date: apiDate(_date ?? _today.add(const Duration(days: 1))),
            seats: _seats,
          );
      if (mounted) setState(() => _results = results);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final date = _date ?? _today.add(const Duration(days: 1));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.mkcLignesRegulieres)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.trip_origin),
            title: Text(l10n.mkcDepart),
            subtitle: Text(_from?.address ?? l10n.opChoisirUneAdresse),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickPlace(true),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(l10n.mkcArrivee),
            subtitle: Text(_to?.address ?? l10n.opChoisirUneAdresse),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickPlace(false),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event),
            title: Text(l10n.mkcDate),
            trailing: Text(MaterialLocalizations.of(context).formatMediumDate(date), style: AppTypography.bodyBold),
            onTap: _pickDate,
          ),
          SeatStepper(label: l10n.mkcPlaces, value: _seats, min: 1, max: 20, onChanged: (v) => setState(() => _seats = v)),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(icon: Icons.search, label: l10n.mkcRechercher, onPressed: _loading ? null : _search),
          if (_loading) Padding(padding: const EdgeInsets.all(AppSpacing.lg), child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.mkcRechercheEnCours))),
          if (_results != null && !_loading) ...[
            SectionTitle(l10n.mkcDepartsDisponibles),
            if (_results!.isEmpty) ...[
              Text(l10n.mkcAucunDepart),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton.icon(
                onPressed: () => context.push(AppRoutes.requestNew),
                icon: const Icon(Icons.request_quote_outlined),
                label: Text(l10n.mkcDemanderDesDevis),
              ),
            ],
            for (final r in _results!) LineResultCard(result: r, seats: _seats),
          ],
        ],
      ),
    );
  }
}

/// Compteur − / + (places, bagages…), boutons de 48 px.
class SeatStepper extends StatelessWidget {
  const SeatStepper({super.key, required this.label, required this.value, required this.min, required this.max, required this.onChanged});

  final String label;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(child: Text(label, style: AppTypography.body)),
        IconButton(
          tooltip: l10n.mkcMoins(label),
          icon: const Icon(Icons.remove_circle_outline),
          onPressed: value > min ? () => onChanged(value - 1) : null,
        ),
        Semantics(liveRegion: true, child: Text('$value', style: AppTypography.bodyBold)),
        IconButton(
          tooltip: l10n.mkcPlus(label),
          icon: const Icon(Icons.add_circle_outline),
          onPressed: value < max ? () => onChanged(value + 1) : null,
        ),
      ]);
}

/// Raison du classement, en clair.
String reasonLabel(MatchReason r) => switch (r.code) {
      // Adresse de la ligne elle-même : la distance n'apporte rien.
      'pickup' || 'dropoff' when (r.value ?? 0) < 0.1 => '',
      'pickup' => l10n.mkcRaisonDepart(formatDecimal((r.value ?? 0).toDouble())),
      'dropoff' => l10n.mkcRaisonArrivee(formatDecimal((r.value ?? 0).toDouble())),
      'seats_left' => l10n.mkcRaisonPlaces((r.value ?? 0).toInt()),
      'private_vehicle' => l10n.mkcRaisonVehiculePrive,
      'verified_operator' => l10n.mkcRaisonOperateurVerifie,
      _ => '',
    };

/// Un départ réservable : heure, opérateur, prix, raisons, bouton « Réserver ».
class LineResultCard extends ConsumerWidget {
  const LineResultCard({super.key, required this.result, required this.seats});

  final LineSearchResult result;
  final int seats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = result;
    final locale = Localizations.localeOf(context).languageCode;
    final reasons = r.reasons.map(reasonLabel).where((s) => s.isNotEmpty).toList();
    return OpCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(formatTripDate(r.departureAt, locale: locale), style: AppTypography.bodyBold),
              Text(l10n.opTrajet(r.origin, r.destination)),
            ]),
          ),
          Text(formatPrice(r.totalPriceCents, locale: locale), style: AppTypography.h3),
        ]),
        Text(
          [
            if (r.operatorName != null) r.operatorName!,
            if (r.vehicleLabel != null && r.vehicleLabel!.isNotEmpty) r.vehicleLabel!,
            if (r.operatorRating != null) l10n.mkcNote(formatDecimal(r.operatorRating!), r.operatorRatingCount),
            if (r.durationMin != null) formatDuration(r.durationMin!),
          ].join(' · '),
          style: AppTypography.caption,
        ),
        Text(r.perSeat ? l10n.mkcPrixParPlace(formatPrice(r.unitPriceCents, locale: locale)) : l10n.mkcVehiculeEntier, style: AppTypography.caption),
        if (r.conditions != null) Text(r.conditions!, style: AppTypography.caption),
        const SizedBox(height: AppSpacing.xs),
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [for (final s in reasons) StatusPill(label: s)]),
        const SizedBox(height: AppSpacing.sm),
        FilledButton(
          onPressed: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            builder: (_) => BookLineSheet(result: r, seats: seats),
          ),
          child: Text(l10n.mkcReserver),
        ),
      ]),
    );
  }
}

/// Confirmation d'une réservation sur un départ : places, sièges enfant, bagages, message.
class BookLineSheet extends ConsumerStatefulWidget {
  const BookLineSheet({super.key, required this.result, required this.seats});

  final LineSearchResult result;
  final int seats;

  @override
  ConsumerState<BookLineSheet> createState() => _BookLineSheetState();
}

class _BookLineSheetState extends ConsumerState<BookLineSheet> {
  late int _seats = widget.seats.clamp(1, widget.result.seatsLeft < 1 ? 1 : widget.result.seatsLeft);
  int _childSeats = 0;
  int _luggage = 0;

  /// Sièges choisis, dans l'ordre des touchers. Vide = attribution automatique.
  List<int> _picked = [];
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _book() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final router = GoRouter.of(context);
    final navigator = Navigator.of(context);
    try {
      final tripId = await ref.read(marketServiceProvider).bookLine(
            widget.result.departureId,
            seats: _seats,
            childSeats: _childSeats,
            luggage: _luggage,
            notes: _notes.text.trim(),
            seatNumbers: _picked.isEmpty ? null : _picked,
          );
      ref.invalidate(recentTripsProvider);
      navigator.pop();
      // Écran 8 : récapitulatif et QR d'embarquement de la réservation.
      router.push(AppRoutes.confirmationFor(tripId));
    } on ApiException catch (e) {
      // Siège pris entre-temps : le plan est rechargé pour montrer les sièges restants.
      ref.invalidate(seatMapProvider(widget.result.departureId));
      if (mounted) {
        setState(() {
          _error = e.message;
          _picked = [];
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.result;
    final locale = Localizations.localeOf(context).languageCode;
    final total = r.perSeat ? r.unitPriceCents * _seats : r.totalPriceCents;
    // Choix facultatif, mais jamais partiel : aucun siège, ou un par place.
    final missing = _picked.isEmpty ? 0 : _seats - _picked.length;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, MediaQuery.of(context).viewInsets.bottom + AppSpacing.md),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l10n.mkcReserverCeDepart, style: AppTypography.h3),
          Text('${formatTripDate(r.departureAt, locale: locale)} · ${l10n.opTrajet(r.origin, r.destination)}'),
          const SizedBox(height: AppSpacing.sm),
          SeatStepper(label: l10n.mkcPlaces, value: _seats, min: 1, max: r.seatsLeft < 1 ? 1 : r.seatsLeft, onChanged: (v) => setState(() {
            _seats = v;
            // Moins de places : on garde les derniers sièges touchés.
            if (_picked.length > v) _picked = _picked.sublist(_picked.length - v);
          })),
          SeatStepper(label: l10n.mkcSiegesEnfant, value: _childSeats, min: 0, max: 4, onChanged: (v) => setState(() => _childSeats = v)),
          if (r.perSeat)
            SeatPicker(
              departureId: r.departureId,
              count: _seats,
              selected: _picked,
              onChanged: (seats) => setState(() => _picked = seats),
            ),
          SeatStepper(label: l10n.mkcBagages, value: _luggage, min: 0, max: r.luggage, onChanged: (v) => setState(() => _luggage = v)),
          TextField(
            controller: _notes,
            maxLength: 300,
            decoration: InputDecoration(labelText: l10n.mkcMessageAuChauffeur, hintText: l10n.mkcMessageExemple),
          ),
          Text(l10n.mkcPaiementPlusTard, style: AppTypography.caption),
          if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: AppSpacing.sm),
          if (missing > 0) Text(l10n.sgReste(missing), style: AppTypography.caption),
          PrimaryButton(label: l10n.mkcConfirmerPrix(formatPrice(total, locale: locale)), onPressed: _busy || missing > 0 ? null : _book),
        ]),
      ),
    );
  }
}
