import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/models/meeting_point.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';

import '../../providers/operator_provider.dart';

/// « +2 h 30 » : décalage d'un arrêt par rapport au départ.
String offsetLabel(int minutes) => '+${formatDuration(minutes)}';

/// Arrêts intermédiaires d'une ligne ou d'un départ ponctuel (vente à la place) :
/// des points du catalogue XLCAB, chacun avec son heure de passage et son prix
/// depuis le départ. Le prix d'un tronçon est la différence entre deux arrêts.
class StopsEditor extends ConsumerWidget {
  const StopsEditor({super.key, required this.stops, required this.onChanged});

  final List<StopDraft> stops;
  final ValueChanged<List<StopDraft>> onChanged;

  Future<void> _add(BuildContext context) async {
    final stop = await showModalBottomSheet<StopDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => StopSheet(exclude: stops.map((s) => s.point.id).toSet()),
    );
    if (stop == null) return;
    // Toujours dans l'ordre du trajet.
    onChanged([...stops, stop]..sort((a, b) => a.offsetMin.compareTo(b.offsetMin)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context).languageCode;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(l10n.stArretsAide, style: AppTypography.caption),
      for (final s in stops)
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.place_outlined),
          title: Text('${s.point.name} · ${s.point.city}'),
          subtitle: Text(l10n.stPassagePrix(offsetLabel(s.offsetMin), formatPrice(s.fareFromOriginCents, locale: locale))),
          trailing: IconButton(
            tooltip: l10n.stRetirerArret(s.point.name),
            icon: const Icon(Icons.close),
            onPressed: () => onChanged(stops.where((x) => x != s).toList()),
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(onPressed: () => _add(context), icon: const Icon(Icons.add_location_alt_outlined), label: Text(l10n.stAjouterUnArret)),
      ),
    ]);
  }
}

/// Choix d'un point du catalogue, de l'heure de passage et du prix depuis le départ.
class StopSheet extends ConsumerStatefulWidget {
  const StopSheet({super.key, this.exclude = const {}});

  final Set<String> exclude;

  @override
  ConsumerState<StopSheet> createState() => _StopSheetState();
}

class _StopSheetState extends ConsumerState<StopSheet> {
  final _form = GlobalKey<FormState>();
  final _offset = TextEditingController();
  final _fare = TextEditingController();
  MeetingPoint? _point;

  @override
  void dispose() {
    _offset.dispose();
    _fare.dispose();
    super.dispose();
  }

  void _submit() {
    if (_point == null || !_form.currentState!.validate()) return;
    final fare = double.parse(_fare.text.trim().replaceAll(',', '.'));
    Navigator.of(context).pop(StopDraft(point: _point!, offsetMin: int.parse(_offset.text), fareFromOriginCents: (fare * 100).round()));
  }

  @override
  Widget build(BuildContext context) {
    final points = ref.watch(meetingPointsProvider);
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, MediaQuery.of(context).viewInsets.bottom + AppSpacing.md),
      child: AsyncBody(
        value: points,
        loadingLabel: l10n.stChargementDesPoints,
        onRetry: () => ref.invalidate(meetingPointsProvider),
        data: (list) {
          final choices = list.where((p) => !widget.exclude.contains(p.id)).toList();
          return Form(
            key: _form,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(l10n.stAjouterUnArret, style: AppTypography.h3),
                const SizedBox(height: AppSpacing.sm),
                if (choices.isEmpty) Text(l10n.stAucunPoint, style: AppTypography.body),
                Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
                  for (final p in choices)
                    ChoiceChip(
                      label: Text('${p.name} · ${p.city}'),
                      selected: _point?.id == p.id,
                      onSelected: (_) => setState(() => _point = p),
                    ),
                ]),
                if (_point?.transit != null) Text(_point!.transit!, style: AppTypography.caption),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _offset,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: l10n.stPassageMinutes),
                  validator: (v) => (int.tryParse(v ?? '') ?? 0) < 1 ? l10n.opNombreInvalide : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                TextFormField(
                  controller: _fare,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: l10n.stPrixDepuisDepart, suffixText: '€'),
                  validator: (v) {
                    final f = double.tryParse((v ?? '').trim().replaceAll(',', '.'));
                    return f == null || f <= 0 ? l10n.opPrixInvalide : null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                FilledButton(onPressed: _point == null ? null : _submit, child: Text(l10n.stAjouter)),
              ]),
            ),
          );
        },
      ),
    );
  }
}
