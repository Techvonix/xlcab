import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/market.dart';
import '../../models/place.dart';
import '../../providers/booking_provider.dart' show clockProvider;
import '../../providers/operator_provider.dart';
import '../../router.dart';
import '../../services/api_service.dart';
import '../../services/market_service.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../utils/formatters.dart';
import '../../widgets/primary_button.dart';
import '../booking/parcel_creation_screen.dart' show addressPickerProvider, pickupDateTimePickerProvider;
import 'line_search_screen.dart' show SeatStepper;
import 'package:xlcab_app/l10n/l10n.dart';

/// Demande de devis : le client décrit son trajet, les opérateurs vérifiés
/// compatibles proposent un prix. Son identité et son adresse exacte ne
/// leur sont communiquées qu'après confirmation.
class RequestFormScreen extends ConsumerStatefulWidget {
  const RequestFormScreen({super.key});

  @override
  ConsumerState<RequestFormScreen> createState() => _RequestFormScreenState();
}

class _RequestFormScreenState extends ConsumerState<RequestFormScreen> {
  final _budget = TextEditingController();
  final _needs = TextEditingController();
  Place? _origin;
  Place? _destination;
  DateTime? _when;
  DateTime? _returnAt;
  int _flexMin = 30;
  int _passengers = 2;
  int _luggage = 0;
  bool _accessible = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _budget.dispose();
    _needs.dispose();
    super.dispose();
  }

  /// Départ au plus tôt : dans 2 h (règle du serveur), arrondi au quart d'heure suivant.
  DateTime get _earliest {
    final t = ref.read(clockProvider)().add(const Duration(hours: 2, minutes: 15));
    return DateTime(t.year, t.month, t.day, t.hour, t.minute - t.minute % 15);
  }

  Future<void> _pickPlace(bool origin) async {
    final place = await ref.read(addressPickerProvider)(context, origin ? l10n.mkcDepart : l10n.mkcArrivee);
    if (place == null || !mounted) return;
    setState(() => origin ? _origin = place : _destination = place);
  }

  Future<void> _pickWhen(bool isReturn) async {
    final earliest = isReturn ? (_when ?? _earliest).add(const Duration(hours: 1)) : _earliest;
    final picked = await ref.read(pickupDateTimePickerProvider)(context, earliest, isReturn ? _returnAt : _when);
    if (picked == null || !mounted) return;
    setState(() => isReturn ? _returnAt = picked : _when = picked);
  }

  Future<void> _submit() async {
    if (_origin == null || _destination == null) {
      setState(() => _error = l10n.opChoisissezDepartEtArrivee);
      return;
    }
    if (_when == null) {
      setState(() => _error = l10n.mkcChoisissezDateHeure);
      return;
    }
    final budget = double.tryParse(_budget.text.trim().replaceAll(',', '.'));
    setState(() {
      _busy = true;
      _error = null;
    });
    final router = GoRouter.of(context);
    try {
      final id = await ref.read(marketServiceProvider).createRequest(RequestDraft(
            origin: _origin!,
            destination: _destination!,
            departureAt: _when!,
            flexMin: _flexMin,
            returnAt: _returnAt,
            passengers: _passengers,
            luggage: _luggage,
            accessible: _accessible,
            budgetCents: budget == null ? null : (budget * 100).round(),
            needs: _needs.text.trim(),
          ));
      ref.invalidate(myRequestsProvider);
      // La demande remplace le formulaire : « retour » revient à la liste.
      router.pushReplacement(AppRoutes.requestDetailFor(id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.mkcDemanderDesDevis)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Text(l10n.mkcDemandeIntro, style: AppTypography.caption),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.trip_origin),
            title: Text(l10n.mkcDepart),
            subtitle: Text(_origin?.address ?? l10n.opChoisirUneAdresse),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickPlace(true),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.place_outlined),
            title: Text(l10n.mkcArrivee),
            subtitle: Text(_destination?.address ?? l10n.opChoisirUneAdresse),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickPlace(false),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event),
            title: Text(l10n.mkcDateEtHeure),
            subtitle: Text(_when == null ? l10n.mkcAChoisir : formatTripDate(_when!, locale: locale)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _pickWhen(false),
          ),
          Text(l10n.mkcSouplesseHoraire, style: AppTypography.body),
          Wrap(spacing: AppSpacing.sm, children: [
            for (final m in const [0, 15, 30, 60, 120])
              ChoiceChip(
                label: Text(m == 0 ? l10n.mkcHeureExacte : l10n.mkSouplesse(m)),
                selected: _flexMin == m,
                onSelected: (_) => setState(() => _flexMin = m),
              ),
          ]),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.u_turn_left),
            title: Text(l10n.mkcRetour),
            subtitle: Text(_returnAt == null ? l10n.mkcAllerSimple : formatTripDate(_returnAt!, locale: locale)),
            trailing: _returnAt == null
                ? TextButton(onPressed: () => _pickWhen(true), child: Text(l10n.opAjouterUnRetour))
                : IconButton(tooltip: l10n.opRetirerLeRetour, icon: const Icon(Icons.close), onPressed: () => setState(() => _returnAt = null)),
          ),
          SeatStepper(label: l10n.mkcPassagers, value: _passengers, min: 1, max: 60, onChanged: (v) => setState(() => _passengers = v)),
          SeatStepper(label: l10n.mkcBagages, value: _luggage, min: 0, max: 100, onChanged: (v) => setState(() => _luggage = v)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _accessible,
            onChanged: (v) => setState(() => _accessible = v),
            title: Text(l10n.mkcVehiculeAccessible),
          ),
          TextField(
            controller: _budget,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: l10n.mkcBudgetFacultatif, suffixText: '€'),
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _needs,
            maxLength: 500,
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.mkcBesoinsParticuliers, hintText: l10n.mkcBesoinsExemple),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(icon: Icons.send, label: l10n.mkcPublierLaDemande, onPressed: _busy ? null : _submit),
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.mkcDemandeGratuite, style: AppTypography.caption, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
