import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/operator.dart';
import '../../providers/operator_provider.dart';
import '../../services/driver_device.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Un départ de ligne que j'assure : liste d'embarquement, « Je suis en
/// route », scan des QR, démarrage et fin pour tous les passagers, ou
/// annulation (un chauffeur de secours prend le relais).
class DepartureScreen extends ConsumerStatefulWidget {
  const DepartureScreen({super.key, required this.departureId});

  final String departureId;

  @override
  ConsumerState<DepartureScreen> createState() => _DepartureScreenState();
}

class _DepartureScreenState extends ConsumerState<DepartureScreen> {
  bool _busy = false;

  OperatorService get _service => ref.read(operatorServiceProvider);

  void _refresh() {
    ref.invalidate(manifestProvider(widget.departureId));
    ref.invalidate(assignmentsProvider);
  }

  Future<void> _do(Future<void> Function() action, {String? success}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await runAction(context, action, success: success);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _refresh();
  }

  Future<void> _scan() async {
    final code = await ref.read(qrScannerProvider).scan(context);
    if (code == null || !mounted) return;
    String? name;
    await _do(() async => name = await _service.checkIn(widget.departureId, code.trim()));
    if (mounted && name != null) showToast(context, l10n.opPassagerEmbarque(name!));
  }

  Future<void> _start(Manifest m) async {
    final missing = m.passengers.where((p) => !p.checkedIn).length;
    final ok = await confirmDialog(
      context,
      title: l10n.opDemarrerLeDepart,
      body: missing == 0 ? l10n.opTousEmbarques : l10n.opPassagersNonScannes(missing),
      action: l10n.demarrer,
    );
    if (ok) await _do(() => _service.startDeparture(widget.departureId));
  }

  Future<void> _complete() async {
    final ok = await confirmDialog(context, title: l10n.opTerminerLeDepart, body: l10n.opTerminerLeDepartExplication, action: l10n.terminer);
    if (ok) await _do(() => _service.completeDeparture(widget.departureId), success: l10n.opDepartTermine);
  }

  Future<void> _cancel() async {
    final ok = await confirmDialog(context, title: l10n.opAnnulerCeDepart, body: l10n.opAnnulerCeDepartExplication, action: l10n.opContinuer);
    if (!ok || !mounted) return;
    final reason = await textDialog(context, title: l10n.opAnnulerCeDepart, label: l10n.opMotif, action: l10n.opAnnulerLeDepart);
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    final done = await runAction(context, () => _service.cancelDeparture(widget.departureId, reason), success: l10n.opDepartConfieAuSecours);
    if (!mounted) return;
    setState(() => _busy = false);
    if (done) {
      ref.invalidate(assignmentsProvider);
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final manifest = ref.watch(manifestProvider(widget.departureId));
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.opDepart)),
      body: AsyncBody(
        value: manifest,
        loadingLabel: l10n.opChargementDuDepart,
        onRetry: _refresh,
        data: (m) => RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              Text(formatTripDate(m.departureAt, locale: locale), style: AppTypography.h3),
              Text(l10n.opTrajet(m.origin, m.destination)),
              Text(l10n.opPassagersReservations(m.seatsBooked, m.passengers.length), style: AppTypography.caption),
              const SizedBox(height: AppSpacing.md),
              if (!m.ready && !m.started)
                OpCard(
                  highlight: true,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(l10n.opJeSuisEnRouteExplication),
                    const SizedBox(height: AppSpacing.sm),
                    PrimaryButton(
                      icon: Icons.directions_car,
                      label: l10n.opJeSuisEnRoute,
                      onPressed: _busy ? null : () => _do(() => _service.ready(widget.departureId), success: l10n.opBonneRoute),
                    ),
                  ]),
                )
              else if (m.ready && !m.started)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Row(children: [
                    const ExcludeSemantics(child: Icon(Icons.check_circle, color: AppColors.success)),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(l10n.opEnRouteConfirme)),
                  ]),
                ),

              SectionTitle(l10n.opListeDEmbarquement),
              for (final p in m.passengers) _PassengerTile(passenger: p),
              const SizedBox(height: AppSpacing.md),
              if (!m.started) ...[
                OutlinedButton.icon(onPressed: _busy ? null : _scan, icon: const Icon(Icons.qr_code_scanner), label: Text(l10n.opScannerUnQr)),
                const SizedBox(height: AppSpacing.sm),
                PrimaryButton(icon: Icons.play_arrow, label: l10n.opDemarrerLeDepart, onPressed: _busy ? null : () => _start(m)),
                const SizedBox(height: AppSpacing.lg),
                TextButton(
                  onPressed: _busy ? null : _cancel,
                  child: Text(l10n.opAnnulerCeDepart, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              ] else
                PrimaryButton(icon: Icons.flag, label: l10n.opTerminerLeDepart, onPressed: _busy ? null : _complete),
            ],
          ),
        ),
      ),
    );
  }
}

class _PassengerTile extends ConsumerWidget {
  const _PassengerTile({required this.passenger});

  final ManifestPassenger passenger;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = passenger;
    final details = [
      l10n.opPlaces(p.seats),
      if (p.childSeats > 0) l10n.opSiegesEnfant(p.childSeats),
      if (p.notes != null) p.notes!,
    ].join(' · ');
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(p.checkedIn ? Icons.how_to_reg : Icons.person_outline, color: p.checkedIn ? AppColors.success : null),
      title: Text('${p.firstName ?? l10n.opPassager}${p.checkedIn ? ' · ${l10n.opEmbarque}' : ''}'),
      subtitle: Text(details),
      trailing: p.phone == null
          ? null
          : IconButton(
              tooltip: l10n.opAppelerLePassager(p.firstName ?? ''),
              icon: const Icon(Icons.phone),
              onPressed: () => ref.read(driverLauncherProvider).call(p.phone!),
            ),
    );
  }
}
