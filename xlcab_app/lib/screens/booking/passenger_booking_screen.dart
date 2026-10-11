import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import '../../providers/booking_provider.dart';
import '../../router.dart';
import 'package:xlcab_ui/theme/shuttle_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'address_search_screen.dart';
import 'widgets/booking_map.dart';
import 'widgets/price_summary.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Écran 6 — Réservation passager (Partie 7) :
/// carte 30 %, départ/arrivée avec autocomplétion, date et heure (au
/// moins 2 h à l'avance), 1 à 7 passagers, options en accordéon, toggle
/// colis, récapitulatif du prix recalculé à chaque modification, bouton
/// payer. La distance minimale de 60 km est vérifiée par le serveur sur
/// la distance routière (voir PassengerQuoteRequest).
class PassengerBookingScreen extends ConsumerStatefulWidget {
  const PassengerBookingScreen({super.key, this.initialShuttleType});

  /// Navette présélectionnée (depuis l'accueil ou la sélection de navette).
  final ShuttleType? initialShuttleType;

  @override
  ConsumerState<PassengerBookingScreen> createState() => _PassengerBookingScreenState();
}

class _PassengerBookingScreenState extends ConsumerState<PassengerBookingScreen> {
  @override
  void initState() {
    super.initState();
    final initial = widget.initialShuttleType;
    if (initial != null) {
      // Un provider ne peut pas être modifié pendant la construction de
      // l'arbre : on applique la présélection juste après la 1re image.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.read(bookingFormProvider.notifier).setShuttleType(initial);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final form = ref.watch(bookingFormProvider);
    final notifier = ref.read(bookingFormProvider.notifier);
    final quote = ref.watch(passengerQuoteProvider);
    final mapBuilder = ref.watch(bookingMapBuilderProvider);
    final now = ref.watch(clockProvider)();

    final readyQuote = quote.isLoading || quote.hasError ? null : quote.valueOrNull;
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.reserverUnTrajet)),
      body: Column(
        children: [
          // Partie 7 : "Maps 30 %".
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.3,
            width: double.infinity,
            child: mapBuilder(form.origin, form.destination),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                _ShuttleChooser(
                  selected: form.shuttleType,
                  onSelected: notifier.setShuttleType,
                ),
                const SizedBox(height: AppSpacing.md),
                _AddressField(
                  label: l10n.depart,
                  icon: Icons.trip_origin,
                  place: form.origin,
                  onTap: () async {
                    final place = await AddressSearchScreen.open(context, title: l10n.adresseDeDepart);
                    if (place != null) notifier.setOrigin(place);
                  },
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(
                    tooltip: l10n.inverserDepartEtArrivee,
                    icon: const Icon(Icons.swap_vert),
                    onPressed: form.origin == null && form.destination == null ? null : notifier.swapAddresses,
                  ),
                ),
                _AddressField(
                  label: l10n.arrivee,
                  icon: Icons.place,
                  place: form.destination,
                  errorText: form.sameAddresses ? l10n.lArriveeDoitEtreDifferente : null,
                  onTap: () async {
                    final place = await AddressSearchScreen.open(context, title: l10n.adresseDArrivee);
                    if (place != null) notifier.setDestination(place);
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                _DepartureField(
                  departure: form.departure,
                  errorText: form.departureTooSoon(now)
                      ? '${l10n.reservationAuMoins2H}${formatTripDate(BookingFormState.earliestDeparture(now), locale: locale)})'
                      : null,
                  onPick: () => _pickDeparture(form.departure, now),
                ),
                const SizedBox(height: AppSpacing.md),
                _Stepper(
                  label: l10n.passagers,
                  unit: 'passager',
                  value: form.seats,
                  min: 1,
                  max: maxSeats,
                  onChanged: notifier.setSeats,
                ),
                const SizedBox(height: AppSpacing.sm),
                _OptionsAccordion(form: form, notifier: notifier),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  secondary: const Icon(Icons.inventory_2_outlined),
                  title: Text(l10n.ajouterUnColis),
                  subtitle: Text(l10n.votreColisVoyageAvecVous),
                  value: form.withParcel,
                  onChanged: notifier.setWithParcel,
                ),
                const SizedBox(height: AppSpacing.md),
                PriceSummary(
                  quote: quote,
                  missingHint: l10n.renseignezLeDepartLArrivee,
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.md),
          child: PrimaryButton(
            icon: Icons.lock_outline,
            label: readyQuote == null
                ? l10n.payer2
                : l10n.payer(formatPrice(readyQuote.totalCents, currency: readyQuote.currency, locale: locale)),
            // Désactivé tant qu'aucun devis à jour n'est affiché : on ne
            // paie jamais un prix périmé ou en cours de recalcul.
            onPressed: readyQuote == null ? null : () => _goToPayment(form, readyQuote, now),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDeparture(DateTime? current, DateTime now) async {
    final earliest = BookingFormState.earliestDeparture(now);
    final initial = current != null && current.isAfter(earliest) ? current : earliest;

    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(earliest.year, earliest.month, earliest.day),
      // Horizon non fixé par la spec : 6 mois proposés.
      lastDate: now.add(const Duration(days: 180)),
      helpText: l10n.dateDeDepart,
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
      helpText: l10n.heureDeDepart,
    );
    if (time == null || !mounted) return;

    ref
        .read(bookingFormProvider.notifier)
        .setDeparture(DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  void _goToPayment(BookingFormState form, PassengerQuote quote, DateTime now) {
    final request = form.toQuoteRequest(now);
    if (request == null) return;
    context.push(AppRoutes.payment, extra: BookingDraft(request: request, quote: quote));
  }
}

// ── Choix de la navette ───────────────────────────────────────────────────

class _ShuttleChooser extends StatelessWidget {
  const _ShuttleChooser({required this.selected, required this.onSelected});

  final ShuttleType selected;
  final ValueChanged<ShuttleType> onSelected;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(header: true, child: Text(l10n.navette, style: AppTypography.h3.copyWith(color: onSurface))),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final type in ShuttleType.values)
              ChoiceChip(
                // Nom + icône : la navette n'est jamais identifiée par sa
                // seule couleur.
                avatar: Icon(type.icon, color: type.color, size: 18),
                label: Text(type.label),
                selected: type == selected,
                side: BorderSide(color: type == selected ? type.color : Theme.of(context).dividerColor, width: 2),
                onSelected: (_) => onSelected(type),
              ),
          ],
        ),
      ],
    );
  }
}

// ── Champs ────────────────────────────────────────────────────────────────

/// Champ d'adresse en lecture seule : l'appui ouvre la recherche.
/// Style Input de la Partie 5 (hauteur 56, rayon 12) via le thème.
class _AddressField extends StatelessWidget {
  const _AddressField({
    required this.label,
    required this.icon,
    required this.place,
    required this.onTap,
    this.errorText,
  });

  final String label;
  final IconData icon;
  final Place? place;
  final VoidCallback onTap;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      button: true,
      label: '$label : ${place?.address ?? 'non renseigné'}',
      hint: l10n.ouvreLaRechercheDAdresse,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        child: InputDecorator(
          isEmpty: place == null,
          decoration: InputDecoration(
            labelText: label,
            prefixIcon: Icon(icon),
            errorText: errorText,
            errorMaxLines: 3,
          ),
          child: Text(
            place?.address ?? '',
            style: AppTypography.body.copyWith(color: onSurface),
          ),
        ),
      ),
    );
  }
}

class _DepartureField extends StatelessWidget {
  const _DepartureField({required this.departure, required this.onPick, this.errorText});

  final DateTime? departure;
  final VoidCallback onPick;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final locale = Localizations.localeOf(context).languageCode;
    final value = departure == null ? null : formatTripDate(departure!, locale: locale);
    return Semantics(
      button: true,
      label: l10n.dateEtHeureDeDepart(value ?? 'non renseignées'),
      hint: errorText,
      excludeSemantics: true,
      child: InkWell(
        onTap: onPick,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        child: InputDecorator(
          isEmpty: value == null,
          decoration: InputDecoration(
            labelText: l10n.dateEtHeureDeDepart2,
            prefixIcon: const Icon(Icons.event),
            errorText: errorText,
            errorMaxLines: 3,
          ),
          child: Text(value ?? '', style: AppTypography.body.copyWith(color: onSurface)),
        ),
      ),
    );
  }
}

/// Compteur − / + (zones tactiles ≥ 44 px), annoncé comme une valeur
/// ajustable par VoiceOver / TalkBack.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.unit,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final String unit;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  String _describe(int v) => '$v $unit${v > 1 ? 's' : ''}';

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      label: label,
      value: _describe(value),
      increasedValue: value < max ? _describe(value + 1) : null,
      decreasedValue: value > min ? _describe(value - 1) : null,
      onIncrease: value < max ? () => onChanged(value + 1) : null,
      onDecrease: value > min ? () => onChanged(value - 1) : null,
      child: Row(
        children: [
          Expanded(
            child: ExcludeSemantics(
              child: Text(label, style: AppTypography.bodyBold.copyWith(color: onSurface)),
            ),
          ),
          IconButton(
            tooltip: l10n.retirerUn(unit),
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: value > min ? () => onChanged(value - 1) : null,
          ),
          ExcludeSemantics(
            child: SizedBox(
              width: AppSpacing.xl,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: AppTypography.h3.copyWith(
                  color: onSurface,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: l10n.ajouterUn(unit),
            icon: const Icon(Icons.add_circle_outline),
            onPressed: value < max ? () => onChanged(value + 1) : null,
          ),
        ],
      ),
    );
  }
}

/// Partie 7 : "options accordéon".
class _OptionsAccordion extends StatelessWidget {
  const _OptionsAccordion({required this.form, required this.notifier});

  final BookingFormState form;
  final BookingFormNotifier notifier;

  @override
  Widget build(BuildContext context) {
    final active = [
      if (form.childSeats > 0) l10n.siegeEnfant(form.childSeats, form.childSeats > 1 ? 's' : ''),
      if (form.wifi) 'Wi-Fi',
      if (form.extraLuggage) l10n.bagageSupplementaire,
    ];
    return Theme(
      // Supprime les séparateurs par défaut de l'ExpansionTile.
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        leading: const Icon(Icons.tune),
        title: Text(l10n.options),
        subtitle: Text(active.isEmpty ? l10n.aucuneOption : active.join(', ')),
        children: [
          _Stepper(
            label: l10n.siegesEnfants,
            unit: l10n.siegeEnfant2,
            value: form.childSeats,
            min: 0,
            max: form.seats,
            onChanged: notifier.setChildSeats,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.wifi),
            title: Text(l10n.wiFiABord),
            value: form.wifi,
            onChanged: notifier.setWifi,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.luggage_outlined),
            title: Text(l10n.bagageSupplementaire2),
            value: form.extraLuggage,
            onChanged: notifier.setExtraLuggage,
          ),
        ],
      ),
    );
  }
}
