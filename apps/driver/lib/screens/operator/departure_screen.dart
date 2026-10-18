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
import 'package:xlcab_core/providers/clock_provider.dart';
import 'package:xlcab_core/services/document_picker.dart';
import 'package:xlcab_core/services/parcel_service.dart';
import '../driver/widgets/parcel_checklist.dart';

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

  ParcelActions _parcelActions() => ParcelActions(
        onCall: (phone) => ref.read(driverLauncherProvider).call(phone),
        onScan: (p) async {
          final code = await ref.read(qrScannerProvider).scan(context);
          if (code == null || !mounted) return;
          await _do(() => ref.read(parcelServiceProvider).pickup(p.id, code.trim()), success: l10n.colisABord);
        },
        onDeliver: (p) async {
          final code = await showDialog<String>(context: context, builder: (_) => const DeliveryCodeDialog());
          if (code == null || !mounted) return;
          // Photo obligatoire : seconde preuve de remise en cas de litige.
          final photo = await ref.read(documentPickerProvider).pick(DocumentSource.camera);
          if (photo == null) {
            if (mounted) showToast(context, l10n.photoDuColisRemisObligatoire);
            return;
          }
          await _do(() => ref.read(parcelServiceProvider).deliver(p.id, code, photo), success: l10n.colisRemisMerci);
        },
        onFail: (p) async {
          final reason = await showDialog<String>(context: context, builder: (_) => ParcelProblemDialog(task: p));
          if (reason != null) await _do(() => ref.read(parcelServiceProvider).fail(p.id, reason), success: l10n.problemeSignaleALEquipe);
        },
      );

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

  Future<void> _guarantee() async {
    final ok = await confirmDialog(context, title: l10n.gtJeParsTitre, body: l10n.gtJeParsTexte, action: l10n.gtJePars);
    if (ok) await _do(() => _service.guaranteeDeparture(widget.departureId), success: l10n.gtJeParsFait);
  }

  Future<void> _cancel(Manifest m) async {
    // Avant le seuil, le chauffeur ne s'était pas engagé : retrait sans secours ni pénalité.
    final pending = m.guarantee?.pending == true;
    final ok = await confirmDialog(
      context,
      title: l10n.opAnnulerCeDepart,
      body: pending ? l10n.gtRetirerExplication : l10n.opAnnulerCeDepartExplication,
      action: l10n.opContinuer,
    );
    if (!ok || !mounted) return;
    final reason = await textDialog(context, title: l10n.opAnnulerCeDepart, label: l10n.opMotif, action: l10n.opAnnulerLeDepart);
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    final done = await runAction(context, () => _service.cancelDeparture(widget.departureId, reason),
        success: pending ? l10n.gtDepartRetire : l10n.opDepartConfieAuSecours);
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
              if (m.guarantee?.pending == true && !m.started)
                OpCard(
                  highlight: true,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(l10n.gtEnAttente((m.guarantee!.minPassengers! - m.seatsBooked).clamp(1, 99)), style: AppTypography.bodyBold),
                    const SizedBox(height: AppSpacing.xs),
                    Text(l10n.gtSeuilRappel(m.guarantee!.minPassengers!)),
                    if (m.guarantee!.deadline != null)
                      Text(l10n.gtEcheance(formatTripDate(m.guarantee!.deadline!, locale: locale)), style: AppTypography.caption),
                    const SizedBox(height: AppSpacing.sm),
                    OutlinedButton.icon(onPressed: _busy ? null : _guarantee, icon: const Icon(Icons.check), label: Text(l10n.gtJePars)),
                  ]),
                )
              else if (m.guarantee?.guaranteed == true && m.guarantee?.minPassengers != null && !m.started)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Row(children: [
                    const ExcludeSemantics(child: Icon(Icons.verified, color: AppColors.success)),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(l10n.gtConfirme, style: AppTypography.bodyBold)),
                  ]),
                ),
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
              for (final p in m.passengers) _PassengerTile(passenger: p, manifest: m),
              if (m.parcels.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                ParcelChecklist(
                  parcels: m.parcels,
                  actions: _parcelActions(),
                  // Enlèvement dans l'heure du départ (le serveur le vérifie) ; remise une fois parti.
                  canPickUp: !m.started && m.departureAt.difference(ref.read(clockProvider)()).inMinutes <= 60,
                  canDeliver: m.started,
                  busy: _busy,
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              if (!m.started) ...[
                OutlinedButton.icon(onPressed: _busy ? null : _scan, icon: const Icon(Icons.qr_code_scanner), label: Text(l10n.opScannerUnQr)),
                const SizedBox(height: AppSpacing.sm),
                PrimaryButton(icon: Icons.play_arrow, label: l10n.opDemarrerLeDepart, onPressed: _busy ? null : () => _start(m)),
                const SizedBox(height: AppSpacing.lg),
                TextButton(
                  onPressed: _busy ? null : () => _cancel(m),
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
  const _PassengerTile({required this.passenger, required this.manifest});

  final ManifestPassenger passenger;
  final Manifest manifest;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = passenger;
    final details = [
      l10n.opPlaces(p.seats),
      if (p.seatNumbers.isNotEmpty) l10n.sgNumeros(p.seatNumbers.length, p.seatNumbers.join(', ')),
      if (p.childSeats > 0) l10n.opSiegesEnfant(p.childSeats),
      // Passager d'un tronçon : où il monte et où il descend.
      if (p.pickup != null && p.pickup != manifest.origin) l10n.stMonteA(p.pickup!),
      if (p.dropoff != null && p.dropoff != manifest.destination) l10n.stDescendA(p.dropoff!),
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
