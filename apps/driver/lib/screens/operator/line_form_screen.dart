import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import '../../providers/operator_provider.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_ui/screens/address_search_screen.dart' show addressPickerProvider;
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/meeting_point.dart';
import 'stops_editor.dart';

/// Nouvelle ligne régulière : trajet (non modifiable ensuite), véhicule,
/// horaires, jours, capacité, prix. Les départs sont créés « à confirmer ».
class LineFormScreen extends ConsumerStatefulWidget {
  const LineFormScreen({super.key, this.oneOff = false});

  /// Départ ponctuel (« je pars le …, il me reste N places ») : un seul jour,
  /// mis en vente dès sa publication, au lieu d'une ligne régulière.
  final bool oneOff;

  @override
  ConsumerState<LineFormScreen> createState() => _LineFormScreenState();
}

class _LineFormScreenState extends ConsumerState<LineFormScreen> {
  final _form = GlobalKey<FormState>();
  final _seats = TextEditingController();
  final _luggage = TextEditingController();
  final _price = TextEditingController();
  final _duration = TextEditingController();
  final _conditions = TextEditingController();
  final _minPassengers = TextEditingController();
  final _parcelSlots = TextEditingController();
  final _parcelPrice = TextEditingController();

  Place? _origin;
  Place? _destination;
  String? _vehicleId;
  TimeOfDay _departure = const TimeOfDay(hour: 7, minute: 0);
  TimeOfDay? _return;
  final Set<int> _days = {1, 2, 3, 4, 5};
  DateTime? _start;
  bool _perSeat = false;
  /// Seuil de départ garanti : « je pars d'office dès N passagers ».
  bool _threshold = false;
  /// Arrêts intermédiaires (points de rencontre du catalogue).
  List<StopDraft> _stops = [];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_seats, _luggage, _price, _duration, _conditions, _minPassengers, _parcelSlots, _parcelPrice]) {
      c.dispose();
    }
    super.dispose();
  }

  DateTime get _today {
    final now = ref.read(clockProvider)();
    return DateTime(now.year, now.month, now.day);
  }

  Future<void> _pickPlace(bool origin) async {
    final place = await ref.read(addressPickerProvider)(context, origin ? l10n.opDepartDeLaLigne : l10n.opArriveeDeLaLigne);
    if (place == null || !mounted) return;
    setState(() => origin ? _origin = place : _destination = place);
  }

  Future<void> _pickTime(bool isReturn) async {
    final picked = await ref.read(timePickerProvider)(context, isReturn ? (_return ?? const TimeOfDay(hour: 18, minute: 0)) : _departure);
    if (picked == null || !mounted) return;
    setState(() => isReturn ? _return = picked : _departure = picked);
  }

  Future<void> _pickStart() async {
    final today = _today;
    // Départ ponctuel : publiable 30 jours à l'avance au plus (fenêtre de vente du serveur).
    final last = today.add(Duration(days: widget.oneOff ? 30 : 365));
    final picked = await ref.read(datePickerProvider)(context, today, last, _start ?? today);
    if (picked != null && mounted) setState(() => _start = picked);
  }

  /// "25" ou "25,50" → centimes.
  static int? _cents(String text) {
    final v = double.tryParse(text.trim().replaceAll(',', '.'));
    return v == null ? null : (v * 100).round();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (_origin == null || _destination == null) {
      setState(() => _error = l10n.opChoisissezDepartEtArrivee);
      return;
    }
    if (_vehicleId == null) {
      setState(() => _error = l10n.opChoisissezUnVehicule);
      return;
    }
    if (!widget.oneOff && _days.isEmpty) {
      setState(() => _error = l10n.opChoisissezAuMoinsUnJour);
      return;
    }
    if (_perSeat && _stops.isNotEmpty && int.tryParse(_duration.text) == null) {
      setState(() => _error = l10n.stDureeRequise);
      return;
    }
    final draft = LineDraft(
      vehicleId: _vehicleId!,
      origin: _origin!,
      destination: _destination!,
      departureTime: apiTime(_departure),
      returnTime: _return == null ? null : apiTime(_return!),
      daysOfWeek: _days.toList()..sort(),
      startDate: apiDate(_start ?? _today.add(const Duration(days: 1))),
      seats: int.parse(_seats.text),
      luggage: int.parse(_luggage.text),
      perSeat: _perSeat,
      priceCents: _cents(_price.text)!,
      durationMin: int.tryParse(_duration.text),
      conditions: _conditions.text.trim(),
      minPassengers: _perSeat && _threshold ? int.tryParse(_minPassengers.text) : null,
      stops: _perSeat ? _stops : const [],
      parcelSlots: _perSeat ? int.tryParse(_parcelSlots.text) ?? 0 : 0,
      parcelPriceCents: _perSeat && (int.tryParse(_parcelSlots.text) ?? 0) > 0 ? _cents(_parcelPrice.text) : null,
    );
    setState(() => _busy = true);
    try {
      final service = ref.read(operatorServiceProvider);
      await (widget.oneOff ? service.publishDeparture(draft) : service.createLine(draft));
      ref.invalidate(myLinesProvider);
      if (!mounted) return;
      showToast(context, widget.oneOff ? l10n.poDepartPublie : l10n.opLignePublieeConfirmez);
      context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicles = ref.watch(operatorVehiclesProvider);
    final profile = ref.watch(operatorProfileProvider).valueOrNull;
    final perSeatAllowed = profile?.perSeatAllowed == true;

    return Scaffold(
      appBar: AppBar(title: Text(widget.oneOff ? l10n.poPublierUnDepart : l10n.opNouvelleLigne)),
      body: AsyncBody(
        value: vehicles,
        loadingLabel: l10n.opChargementDesVehicules,
        onRetry: () => ref.invalidate(operatorVehiclesProvider),
        data: (list) {
          final vehicle = list.where((v) => v.id == _vehicleId).firstOrNull;
          return Form(
            key: _form,
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                SectionTitle(l10n.opTrajetSection),
                _PlaceTile(icon: Icons.trip_origin, label: l10n.opDepartDeLaLigne, place: _origin, onTap: () => _pickPlace(true)),
                _PlaceTile(icon: Icons.place_outlined, label: l10n.opArriveeDeLaLigne, place: _destination, onTap: () => _pickPlace(false)),
                Text(l10n.opTrajetNonModifiable, style: AppTypography.caption),

                SectionTitle(l10n.opVehicule),
                if (list.isEmpty) Text(l10n.opAucunVehicule, style: AppTypography.body),
                Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                  for (final v in list)
                    ChoiceChip(
                      label: Text(l10n.opVehiculePlaces(v.label.isEmpty ? l10n.opVehicule : v.label, v.capacity)),
                      selected: _vehicleId == v.id,
                      onSelected: (_) => setState(() {
                        _vehicleId = v.id;
                        if (_seats.text.isEmpty) _seats.text = '${v.capacity}';
                      }),
                    ),
                ]),

                SectionTitle(widget.oneOff ? l10n.poDateEtHeure : l10n.opHorairesEtJours),
                if (widget.oneOff)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event),
                    title: Text(l10n.poJourDuDepart),
                    trailing: Text(
                      MaterialLocalizations.of(context).formatMediumDate(_start ?? _today.add(const Duration(days: 1))),
                      style: AppTypography.bodyBold,
                    ),
                    onTap: _pickStart,
                  ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.schedule),
                  title: Text(l10n.opHeureDeDepart),
                  trailing: Text(_departure.format(context), style: AppTypography.bodyBold),
                  onTap: () => _pickTime(false),
                ),
                if (!widget.oneOff) ...[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.u_turn_left),
                    title: Text(l10n.opRetourLeMemeJour),
                    subtitle: Text(_return == null ? l10n.opPasDeRetour : _return!.format(context)),
                    trailing: _return == null
                        ? TextButton(onPressed: () => _pickTime(true), child: Text(l10n.opAjouterUnRetour))
                        : IconButton(tooltip: l10n.opRetirerLeRetour, icon: const Icon(Icons.close), onPressed: () => setState(() => _return = null)),
                  ),
                  Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                    for (var d = 1; d <= 7; d++)
                      FilterChip(
                        label: Text(dayShort(d)),
                        selected: _days.contains(d),
                        onSelected: (on) => setState(() => on ? _days.add(d) : _days.remove(d)),
                      ),
                  ]),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event),
                    title: Text(l10n.opPremierJour),
                    trailing: Text(
                      MaterialLocalizations.of(context).formatMediumDate(_start ?? _today.add(const Duration(days: 1))),
                      style: AppTypography.bodyBold,
                    ),
                    onTap: _pickStart,
                  ),
                ],

                SectionTitle(l10n.opCapaciteEtPrix),
                TextFormField(
                  controller: _seats,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: l10n.opPlacesParDepart, helperText: vehicle == null ? null : l10n.opAuPlus(vehicle.capacity)),
                  validator: (v) {
                    final n = int.tryParse(v ?? '');
                    if (n == null || n < 1) return l10n.opNombreInvalide;
                    if (vehicle != null && n > vehicle.capacity) return l10n.opAuPlus(vehicle.capacity);
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _luggage,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: l10n.opBagagesParDepart),
                  validator: (v) => int.tryParse(v ?? '') == null ? l10n.opNombreInvalide : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                // Vente à la place = transport collectif : seulement avec une licence vérifiée par XLCAB.
                Wrap(spacing: AppSpacing.sm, children: [
                  ChoiceChip(label: Text(l10n.opParVehicule), selected: !_perSeat, onSelected: (_) => setState(() => _perSeat = false)),
                  ChoiceChip(
                    label: Text(l10n.opParPlace),
                    selected: _perSeat,
                    onSelected: perSeatAllowed ? (_) => setState(() => _perSeat = true) : null,
                  ),
                ]),
                if (!perSeatAllowed)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: Text(l10n.opVenteALaPlaceReservee, style: AppTypography.caption),
                  ),
                if (_perSeat) ...[
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l10n.gtSeuilTitre),
                    subtitle: Text(l10n.gtSeuilAide),
                    value: _threshold,
                    onChanged: (on) => setState(() {
                      _threshold = on;
                      if (on && _minPassengers.text.isEmpty) {
                        final seats = int.tryParse(_seats.text);
                        // Proposition : la moitié des places, arrondie au-dessus.
                        if (seats != null && seats > 0) _minPassengers.text = '${(seats + 1) ~/ 2}';
                      }
                    }),
                  ),
                  if (_threshold)
                    TextFormField(
                      controller: _minPassengers,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: l10n.gtSeuilChamp),
                      validator: (v) {
                        final n = int.tryParse(v ?? '');
                        final seats = int.tryParse(_seats.text) ?? 0;
                        if (n == null || n < 1 || (seats > 0 && n > seats)) return l10n.gtSeuilInvalide;
                        return null;
                      },
                    ),
                ],
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: _perSeat ? l10n.opPrixParPlaceTtc : l10n.opPrixDuVehiculeTtc,
                    suffixText: '€',
                  ),
                  validator: (v) {
                    final c = _cents(v ?? '');
                    return c == null || c < 100 ? l10n.opPrixInvalide : null;
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _duration,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: l10n.opDureeEstimeeMinutes),
                ),
                if (_perSeat) ...[
                  SectionTitle(l10n.lcColis),
                  Text(l10n.lcColisAide, style: AppTypography.caption),
                  const SizedBox(height: AppSpacing.sm),
                  TextFormField(
                    controller: _parcelSlots,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: l10n.lcColisParDepart),
                    onChanged: (_) => setState(() {}),
                    validator: (v) => (int.tryParse(v ?? '') ?? 0) > 20 ? l10n.lcVingtAuPlus : null,
                  ),
                  if ((int.tryParse(_parcelSlots.text) ?? 0) > 0) ...[
                    const SizedBox(height: AppSpacing.sm),
                    TextFormField(
                      controller: _parcelPrice,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(labelText: l10n.lcPrixParColis, suffixText: '€'),
                      validator: (v) {
                        final c = _cents(v ?? '');
                        return c == null || c < 100 ? l10n.opPrixInvalide : null;
                      },
                    ),
                  ],
                  SectionTitle(l10n.stArrets),
                  StopsEditor(stops: _stops, onChanged: (stops) => setState(() => _stops = stops)),
                ],
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _conditions,
                  maxLength: 1000,
                  minLines: 2,
                  maxLines: 4,
                  decoration: InputDecoration(labelText: l10n.opConditionsFacultatif, hintText: l10n.opConditionsExemple),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                    child: Text(_error!, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.error)),
                  ),
                const SizedBox(height: AppSpacing.md),
                PrimaryButton(
                  label: widget.oneOff ? l10n.poPublierLeDepart : l10n.opPublierLaLigne,
                  icon: Icons.check,
                  onPressed: _busy ? null : _submit,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(widget.oneOff ? l10n.poApresPublication : l10n.opApresPublication, style: AppTypography.caption, textAlign: TextAlign.center),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({required this.icon, required this.label, required this.place, required this.onTap});

  final IconData icon;
  final String label;
  final Place? place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(label),
        subtitle: Text(place?.address ?? l10n.opChoisirUneAdresse),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      );
}
