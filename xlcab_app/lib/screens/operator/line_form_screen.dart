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

/// Nouvelle ligne régulière : trajet (non modifiable ensuite), véhicule,
/// horaires, jours, capacité, prix. Les départs sont créés « à confirmer ».
class LineFormScreen extends ConsumerStatefulWidget {
  const LineFormScreen({super.key});

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

  Place? _origin;
  Place? _destination;
  String? _vehicleId;
  TimeOfDay _departure = const TimeOfDay(hour: 7, minute: 0);
  TimeOfDay? _return;
  final Set<int> _days = {1, 2, 3, 4, 5};
  DateTime? _start;
  bool _perSeat = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_seats, _luggage, _price, _duration, _conditions]) {
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
    final picked = await ref.read(datePickerProvider)(context, today, today.add(const Duration(days: 365)), _start ?? today);
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
    if (_days.isEmpty) {
      setState(() => _error = l10n.opChoisissezAuMoinsUnJour);
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
    );
    setState(() => _busy = true);
    try {
      await ref.read(operatorServiceProvider).createLine(draft);
      ref.invalidate(myLinesProvider);
      if (!mounted) return;
      showToast(context, l10n.opLignePublieeConfirmez);
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
      appBar: AppBar(title: Text(l10n.opNouvelleLigne)),
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

                SectionTitle(l10n.opHorairesEtJours),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.schedule),
                  title: Text(l10n.opHeureDeDepart),
                  trailing: Text(_departure.format(context), style: AppTypography.bodyBold),
                  onTap: () => _pickTime(false),
                ),
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
                PrimaryButton(label: l10n.opPublierLaLigne, icon: Icons.check, onPressed: _busy ? null : _submit),
                const SizedBox(height: AppSpacing.sm),
                Text(l10n.opApresPublication, style: AppTypography.caption, textAlign: TextAlign.center),
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
