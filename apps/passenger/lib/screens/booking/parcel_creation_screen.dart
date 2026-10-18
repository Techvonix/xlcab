import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/parcel_service.dart';
import '../../services/payment_service.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_ui/screens/address_search_screen.dart';

export 'package:xlcab_ui/screens/address_search_screen.dart' show addressPickerProvider;
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_core/services/trip_service.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart' show apiDate;

/// Choix de la date puis de l'heure d'enlèvement (sélecteurs natifs ;
/// injectable pour les tests).
final pickupDateTimePickerProvider = Provider<Future<DateTime?> Function(BuildContext, DateTime earliest, DateTime? current)>(
  (ref) => (context, earliest, current) async {
    final initial = current != null && current.isAfter(earliest) ? current : earliest;
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(earliest.year, earliest.month, earliest.day),
      lastDate: earliest.add(const Duration(days: 60)),
      helpText: l10n.dateDEnlevement,
    );
    if (date == null || !context.mounted) return null;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial), helpText: l10n.heureDEnlevement);
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  },
);

/// Écran 11 — Création colis (Partie 7) : enlèvement + livraison, créneau,
/// poids, dimensions, contenu, destinataire, puis deux options :
/// - navette partagée : un trajet déjà prévu (à l'aller avec des passagers,
///   ou au retour d'un chauffeur qui rentrerait à vide), forfait ;
/// - navette dédiée : tarif kilométrique.
/// Paiement Stripe (prépaiement) puis suivi (écran 12).
class ParcelCreationScreen extends ConsumerStatefulWidget {
  const ParcelCreationScreen({super.key});

  @override
  ConsumerState<ParcelCreationScreen> createState() => _ParcelCreationScreenState();
}

class _ParcelCreationScreenState extends ConsumerState<ParcelCreationScreen> {
  final _form = GlobalKey<FormState>();
  final _weight = TextEditingController();
  final _length = TextEditingController();
  final _width = TextEditingController();
  final _height = TextEditingController();
  final _description = TextEditingController();
  final _recipientName = TextEditingController();
  final _recipientPhone = TextEditingController();

  Place? _pickup;
  Place? _delivery;
  DateTime? _when;
  bool _fragile = false;
  bool _declared = false;

  ParcelQuote? _quote;
  ParcelMode? _mode;
  /// Départs de lignes régulières qui prennent encore un colis sur ce trajet, ce jour-là.
  List<LineSearchResult> _lines = const [];
  LineSearchResult? _line;
  ParcelBooking? _booking;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_weight, _length, _width, _height, _description, _recipientName, _recipientPhone]) {
      c.dispose();
    }
    super.dispose();
  }

  DateTime get _earliest => ref.read(clockProvider)().add(const Duration(hours: 2, minutes: 5));

  /// Toute modification invalide le devis (le prix dépend du formulaire).
  void _changed() {
    if (_quote != null || _booking != null || _lines.isNotEmpty) {
      setState(() {
        _quote = null;
        _mode = null;
        _booking = null;
        _lines = const [];
        _line = null;
      });
    }
  }

  double? get _weightKg => double.tryParse(_weight.text.replaceAll(',', '.'));
  int? _int(TextEditingController c) => int.tryParse(c.text);

  ParcelRequest? _request() {
    if (_pickup == null || _delivery == null || _when == null) return null;
    final w = _weightKg, l = _int(_length), wd = _int(_width), h = _int(_height);
    if (w == null || l == null || wd == null || h == null) return null;
    return ParcelRequest(
      pickup: _pickup!,
      delivery: _delivery!,
      scheduledAt: _when!,
      weightKg: w,
      lengthCm: l,
      widthCm: wd,
      heightCm: h,
      description: _description.text,
      isFragile: _fragile,
      recipientName: _recipientName.text,
      recipientPhone: _recipientPhone.text,
    );
  }

  String? _missing() {
    if (_pickup == null) return l10n.choisissezLAdresseDEnlevement;
    if (_delivery == null) return l10n.choisissezLAdresseDeLivraison;
    if (_pickup!.isSameAs(_delivery!)) return l10n.enlevementEtLivraisonDoiventEtre;
    if (_when == null) return l10n.choisissezLaDateDEnlevement;
    if (_when!.isBefore(ref.read(clockProvider)().add(const Duration(hours: 2)))) return l10n.envoiAuMoins2H;
    if (!_declared) return l10n.confirmezQueLeColisNe;
    return null;
  }

  Future<void> _getQuote() async {
    final formOk = _form.currentState!.validate();
    final missing = _missing();
    setState(() => _error = missing);
    if (!formOk || missing != null) return;
    setState(() => _loading = true);
    try {
      final quote = await ref.read(parcelServiceProvider).quote(_request()!);
      // Lignes régulières du jour : le colis voyage avec un chauffeur qui fait déjà ce trajet.
      var lines = const <LineSearchResult>[];
      try {
        lines = await ref.read(marketServiceProvider).searchLines(from: _pickup!, to: _delivery!, date: apiDate(_when!), seats: 1, parcels: true);
      } on ApiException {
        // Recherche indisponible : les deux autres options restent proposées.
      }
      setState(() {
        _quote = quote;
        _lines = lines;
        // Option la moins chère proposée par défaut : une ligne régulière, sinon la navette partagée.
        _line = lines.isEmpty ? null : (List.of(lines)..sort((a, b) => a.totalPriceCents.compareTo(b.totalPriceCents))).first;
        _mode = _line != null ? null : quote.grafted.available ? ParcelMode.grafted : quote.dedicated.available ? ParcelMode.dedicated : null;
        if (_mode == null && _line == null) _error = quote.dedicated.reason ?? l10n.aucuneOptionDisponiblePourCe;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Colis confié à un départ de ligne : paiement si le paiement en ligne est activé, puis suivi.
  Future<void> _sendOnLine(LineSearchResult line) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final booking = await ref.read(marketServiceProvider).bookLineParcel(line, _request()!);
      if (booking.payment != null) {
        final presenter = ref.read(paymentSheetPresenterProvider);
        final result = presenter.isAvailable
            ? await presenter.present(booking.payment!)
            : PaymentSheetResult(PaymentSheetOutcome.failed, l10n.paiementMomentanementIndisponibleReessayezPlus);
        if (result.outcome != PaymentSheetOutcome.completed) {
          // Abandon : la réservation est annulée tout de suite, l'emplacement rendu.
          try {
            await ref.read(tripServiceProvider).cancel(booking.tripId, 'Paiement non finalisé');
          } on ApiException {
            // Sans paiement, la réservation tombe d'elle-même au bout de 30 minutes.
          }
          setState(() => _error = result.outcome == PaymentSheetOutcome.canceled ? l10n.paiementAnnuleVotreEnvoiN : (result.message ?? l10n.paiementRefuse));
          return;
        }
        await ref.read(paymentServiceProvider).confirm(booking.tripId);
      }
      if (mounted) context.go(AppRoutes.parcelTrackingFor(booking.parcelId));
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pay() async {
    if (_line != null) return _sendOnLine(_line!);
    final mode = _mode;
    if (mode == null) return;
    final presenter = ref.read(paymentSheetPresenterProvider);
    if (!presenter.isAvailable) {
      setState(() => _error = l10n.paiementMomentanementIndisponibleReessayezPlus);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Nouvel essai après fermeture de la feuille : même réservation,
      // paiement repris (pas de doublon).
      final PaymentSheetParams params;
      final ParcelBooking booking;
      if (_booking == null) {
        booking = await ref.read(parcelServiceProvider).book(_request()!, mode);
        _booking = booking;
        params = booking.payment;
      } else {
        booking = _booking!;
        params = await ref.read(paymentServiceProvider).resume(booking.tripId);
      }
      final result = await presenter.present(params);
      switch (result.outcome) {
        case PaymentSheetOutcome.completed:
          await ref.read(paymentServiceProvider).confirm(booking.tripId);
          if (mounted) context.go(AppRoutes.parcelTrackingFor(booking.parcelId));
        case PaymentSheetOutcome.canceled:
          setState(() => _error = l10n.paiementAnnuleVotreEnvoiN);
        case PaymentSheetOutcome.failed:
          setState(() => _error = result.message ?? l10n.paiementRefuse);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await ref.read(pickupDateTimePickerProvider)(context, _earliest, _when);
    if (picked == null) return;
    setState(() => _when = picked);
    _changed();
  }

  Future<void> _pickAddress(bool pickup) async {
    final place = await ref.read(addressPickerProvider)(context, pickup ? l10n.adresseDEnlevement : l10n.adresseDeLivraison);
    if (place == null) return;
    setState(() => pickup ? _pickup = place : _delivery = place);
    _changed();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = scheme.onSurface.withValues(alpha: 0.75);

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
          child: Semantics(header: true, child: Text(title, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
        );

    Widget address(String label, IconData icon, Place? place, VoidCallback onTap) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon),
          title: Text(place?.address ?? label),
          subtitle: place == null ? null : Text(label),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        );

    Widget number(TextEditingController c, String label, String? Function(String?) validator, {bool decimal = false}) => Expanded(
          child: TextFormField(
            controller: c,
            keyboardType: TextInputType.numberWithOptions(decimal: decimal),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(decimal ? r'[0-9.,]' : r'[0-9]'))],
            decoration: InputDecoration(labelText: label),
            validator: validator,
            onChanged: (_) => _changed(),
          ),
        );

    String? cm(String? v) {
      final n = int.tryParse(v ?? '');
      return n == null || n < 1 ? l10n.requis : null;
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.envoyerUnColis)),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            section(l10n.trajet),
            address(l10n.adresseDEnlevement, Icons.trip_origin, _pickup, () => _pickAddress(true)),
            address(l10n.adresseDeLivraison, Icons.place, _delivery, () => _pickAddress(false)),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event),
              title: Text(_when == null ? l10n.dateEtHeureDEnlevement : formatTripDate(_when!, locale: locale)),
              subtitle: Text(l10n.auMoins2HA),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickDate,
            ),
            section(l10n.colis),
            Row(children: [
              number(_weight, l10n.poidsKg, (v) {
                final w = double.tryParse((v ?? '').replaceAll(',', '.'));
                if (w == null || w <= 0) return l10n.requis;
                return w > parcelMaxWeightKg ? l10n.n30KgMaximum : null;
              }, decimal: true),
            ]),
            const SizedBox(height: AppSpacing.sm),
            Row(children: [
              number(_length, l10n.longueurCm, cm),
              const SizedBox(width: AppSpacing.sm),
              number(_width, l10n.largeurCm, cm),
              const SizedBox(width: AppSpacing.sm),
              number(_height, l10n.hauteurCm, cm),
            ]),
            Builder(builder: (context) {
              final l = _int(_length), w = _int(_width), h = _int(_height);
              final tooBig = l != null && w != null && h != null && !parcelFits(l, w, h);
              return Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  tooBig ? l10n.tropGrand1208080 : l10n.maximum30KgEt120,
                  style: AppTypography.caption.copyWith(color: tooBig ? scheme.error : muted),
                ),
              );
            }),
            TextFormField(
              controller: _description,
              decoration: InputDecoration(labelText: l10n.contenuExCartonDeLivres),
              maxLength: 200,
              validator: (v) => (v ?? '').trim().length < 3 ? l10n.decrivezLeContenu : null,
              onChanged: (_) => _changed(),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.colisFragile),
              value: _fragile,
              onChanged: (v) {
                setState(() => _fragile = v);
                _changed();
              },
            ),
            section(l10n.destinataire),
            TextFormField(
              controller: _recipientName,
              decoration: InputDecoration(labelText: l10n.nomDuDestinataire),
              validator: (v) => (v ?? '').trim().length < 2 ? l10n.requis : null,
              onChanged: (_) => _changed(),
            ),
            TextFormField(
              controller: _recipientPhone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.telephoneDuDestinataire),
              validator: (v) => RegExp(r'^(\+\d{8,15}|0\d{9})$').hasMatch((v ?? '').replaceAll(RegExp(r'[\s.-]'), ''))
                  ? null
                  : l10n.numeroInvalide,
              onChanged: (_) => _changed(),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _declared,
              onChanged: (v) {
                setState(() => _declared = v ?? false);
                _changed();
              },
              title: Text(
                l10n.jeCertifieQueLeColis +
                l10n.armesStupefiantsAnimauxDenreesPerissables,
              ),
            ),
            if (_quote != null) ...[
              section(l10n.commentVoyageVotreColis),
              for (final line in _lines) ...[
                _LineOptionCard(
                  line: line,
                  selected: identical(_line, line),
                  onTap: () => setState(() {
                    _line = line;
                    _mode = null;
                  }),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              _OptionCard(
                title: _quote!.grafted.onReturnLeg ? l10n.navettePartageeTrajetRetour : l10n.navettePartagee,
                description: _quote!.grafted.onReturnLeg
                    ? l10n.votreColisVoyageAuRetour
                    : l10n.votreColisVoyageAvecUne,
                option: _quote!.grafted,
                selected: _mode == ParcelMode.grafted,
                onTap: () => setState(() {
                  _mode = ParcelMode.grafted;
                  _line = null;
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              _OptionCard(
                title: l10n.navetteDediee,
                description: l10n.uneNavettePartPourVotre,
                option: _quote!.dedicated,
                selected: _mode == ParcelMode.dedicated,
                onTap: () => setState(() {
                  _mode = ParcelMode.dedicated;
                  _line = null;
                }),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.annulationGratuiteJusquAL +
                l10n.sinon50DeFraisEntre,
                style: AppTypography.caption.copyWith(color: muted),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.md),
                child: Semantics(
                  liveRegion: true,
                  child: Text(_error!, style: AppTypography.body.copyWith(color: scheme.error)),
                ),
              ),
            const SizedBox(height: AppSpacing.lg),
            if (_quote == null)
              PrimaryButton(icon: Icons.calculate_outlined, label: l10n.voirLesOptionsEtLe, onPressed: _loading ? null : _getQuote)
            else
              PrimaryButton(
                icon: Icons.lock_outline,
                label: _mode == null && _line == null
                    ? l10n.aucuneOptionDisponible
                    : _line != null
                        ? l10n.lcEnvoyerSurCeDepart(formatPrice(_selectedPrice()!, locale: locale))
                        : l10n.payer(formatPrice(_selectedPrice()!, locale: locale)),
                onPressed: _loading || (_mode == null && _line == null) ? null : _pay,
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }

  int? _selectedPrice() => _line?.totalPriceCents ?? (_mode == ParcelMode.grafted ? _quote?.grafted : _quote?.dedicated)?.price?.totalCents;
}

/// Départ de ligne régulière qui prend le colis : chauffeur, heure et lieu de remise, prix.
class _LineOptionCard extends StatelessWidget {
  const _LineOptionCard({required this.line, required this.selected, required this.onTap});

  final LineSearchResult line;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: selected ? AppColors.primaryButton : scheme.outline.withValues(alpha: 0.4), width: selected ? 2 : 1),
          ),
          child: Row(children: [
            ExcludeSemantics(child: Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? AppColors.primaryButton : muted)),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l10n.lcLigneReguliere(line.operatorName ?? ''), style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                Text(l10n.lcRemiseAuChauffeur(line.origin, formatTripDate(line.departureAt, locale: locale)), style: AppTypography.caption.copyWith(color: muted)),
                if (line.board?.transit != null) Text(line.board!.transit!, style: AppTypography.caption.copyWith(color: muted)),
                Text(l10n.lcRetraitA(line.destination), style: AppTypography.caption.copyWith(color: muted)),
              ]),
            ),
            Text(formatPrice(line.totalPriceCents, locale: locale), style: AppTypography.price.copyWith(color: scheme.onSurface, fontSize: 18)),
          ]),
        ),
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({required this.title, required this.description, required this.option, required this.selected, required this.onTap});

  final String title;
  final String description;
  final ParcelOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    return Semantics(
      selected: selected,
      button: option.available,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        onTap: option.available ? onTap : null,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: selected ? AppColors.primaryButton : scheme.outline.withValues(alpha: 0.4), width: selected ? 2 : 1),
          ),
          child: Row(
            children: [
              ExcludeSemantics(
                child: Icon(
                  !option.available ? Icons.block : selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                  color: selected ? AppColors.primaryButton : muted,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: AppTypography.bodyBold.copyWith(color: scheme.onSurface)),
                  Text(option.available ? description : option.reason ?? l10n.indisponible, style: AppTypography.caption.copyWith(color: muted)),
                  if (option.available && option.departureAt != null)
                    Text(l10n.departPrevu(formatTripDate(option.departureAt!, locale: locale)), style: AppTypography.caption.copyWith(color: muted)),
                ]),
              ),
              if (option.price != null && option.available)
                Text(formatPrice(option.price!.totalCents, locale: locale), style: AppTypography.price.copyWith(color: scheme.onSurface, fontSize: 18)),
            ],
          ),
        ),
      ),
    );
  }
}
