import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/providers/clock_provider.dart';
import '../../providers/operator_provider.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'my_lines_screen.dart' show lineStatusLabel;
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Détail d'une de mes lignes : départs à venir (confirmer, arrêter ou
/// rouvrir la vente), jours sans départ, chauffeurs de réserve, pause et
/// fermeture.
class LineDetailScreen extends ConsumerStatefulWidget {
  const LineDetailScreen({super.key, required this.lineId});

  final String lineId;

  @override
  ConsumerState<LineDetailScreen> createState() => _LineDetailScreenState();
}

class _LineDetailScreenState extends ConsumerState<LineDetailScreen> {
  bool _busy = false;

  OperatorService get _service => ref.read(operatorServiceProvider);

  void _refresh() {
    ref.invalidate(myLinesProvider);
    ref.invalidate(lineDeparturesProvider(widget.lineId));
    ref.invalidate(lineBackupsProvider(widget.lineId));
  }

  Future<void> _do(Future<void> Function() action, {String? success}) async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await runAction(context, action, success: success);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) _refresh();
  }

  Future<void> _setStatus(RecurringLine line, LineStatus status) async {
    if (status == LineStatus.closed) {
      final ok = await confirmDialog(context, title: l10n.opFermerLaLigne, body: l10n.opFermerLaLigneExplication, action: l10n.opFermer);
      if (!ok) return;
    }
    await _do(() => _service.setLineStatus(line.id, status));
  }

  Future<void> _confirmTwoWeeks() async {
    final until = apiDate(ref.read(clockProvider)().add(const Duration(days: 14)));
    var n = 0;
    await _do(() async => n = await _service.confirmDepartures(until: until, lineId: widget.lineId));
    if (mounted && n > 0) showToast(context, l10n.opDepartsConfirmes(n));
  }

  Future<void> _closeDay() async {
    final now = ref.read(clockProvider)();
    final today = DateTime(now.year, now.month, now.day);
    final date = await ref.read(datePickerProvider)(context, today, today.add(const Duration(days: 365)), today.add(const Duration(days: 1)));
    if (date == null || !mounted) return;
    final reason = await textDialog(context, title: l10n.opFermerUnJour, label: l10n.opMotifFacultatif, action: l10n.opFermer, minLength: 0, maxLength: 200);
    if (reason == null) return;
    await _do(() => _service.addException(widget.lineId, apiDate(date), reason: reason), success: l10n.opJourFerme);
  }

  Future<void> _invite(int rank) async {
    final email = await showDialog<String>(context: context, builder: (_) => _EmailDialog(rank: rank));
    if (email == null) return;
    await _do(() => _service.inviteBackup(widget.lineId, email, rank), success: l10n.opInvitationEnvoyee);
  }

  @override
  Widget build(BuildContext context) {
    final lines = ref.watch(myLinesProvider);
    final departures = ref.watch(lineDeparturesProvider(widget.lineId));
    final backups = ref.watch(lineBackupsProvider(widget.lineId));
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.opLigne)),
      body: AsyncBody(
        value: lines,
        loadingLabel: l10n.opChargementDesLignes,
        onRetry: _refresh,
        data: (list) {
          final line = list.where((l) => l.id == widget.lineId).firstOrNull;
          if (line == null) return Center(child: Text(l10n.opLigneIntrouvable));
          final closed = line.status == LineStatus.closed;
          final price = formatPrice(line.priceCents, locale: locale);
          return RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                Text(l10n.opTrajet(line.origin.address, line.destination.address), style: AppTypography.h3),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  line.returnTime == null
                      ? l10n.opHoraireJours(line.departureTime, daysLabel(line.daysOfWeek))
                      : l10n.opHoraireRetourJours(line.departureTime, line.returnTime!, daysLabel(line.daysOfWeek)),
                ),
                Text(line.perSeat ? l10n.opPrixParPlace(price, line.seats) : l10n.opPrixVehicule(price, line.seats)),
                if (line.conditions != null) Text(line.conditions!, style: AppTypography.caption),
                const SizedBox(height: AppSpacing.sm),
                Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  StatusPill(label: lineStatusLabel(line.status)),
                  if (line.status == LineStatus.active)
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _setStatus(line, LineStatus.paused),
                      icon: const Icon(Icons.pause),
                      label: Text(l10n.opMettreEnPause),
                    ),
                  if (line.status == LineStatus.paused)
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _setStatus(line, LineStatus.active),
                      icon: const Icon(Icons.play_arrow),
                      label: Text(l10n.opReprendre),
                    ),
                  if (!closed)
                    TextButton(onPressed: _busy ? null : () => _setStatus(line, LineStatus.closed), child: Text(l10n.opFermerLaLigne)),
                ]),

                SectionTitle(l10n.opProchainsDeparts),
                if (!closed)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilledButton.tonalIcon(
                      onPressed: _busy ? null : _confirmTwoWeeks,
                      icon: const Icon(Icons.event_available),
                      label: Text(l10n.opConfirmerQuinzeJours),
                    ),
                  ),
                AsyncBody(
                  value: departures,
                  loadingLabel: l10n.opChargementDesDeparts,
                  onRetry: () => ref.invalidate(lineDeparturesProvider(widget.lineId)),
                  data: (deps) => Column(children: [
                    if (deps.isEmpty) Padding(padding: const EdgeInsets.all(AppSpacing.md), child: Text(l10n.opAucunDepartAVenir)),
                    for (final d in deps.take(20))
                      _DepartureTile(
                        departure: d,
                        busy: _busy,
                        onToggle: closed ? null : () => _do(() => _service.setDepartureClosed(d.id, d.status != DepartureStatus.closed)),
                      ),
                  ]),
                ),

                SectionTitle(l10n.opJoursSansDepart),
                for (final e in line.exceptions)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_busy),
                    title: Text(MaterialLocalizations.of(context).formatMediumDate(DateTime.parse(e.date))),
                    subtitle: Text(e.seats == null ? (e.reason ?? l10n.opPasDeDepart) : l10n.opPlacesCeJour(e.seats!)),
                    trailing: IconButton(
                      tooltip: l10n.opRetablirCeJour,
                      icon: const Icon(Icons.undo),
                      onPressed: _busy ? null : () => _do(() => _service.removeException(widget.lineId, e.date)),
                    ),
                  ),
                if (!closed)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(onPressed: _busy ? null : _closeDay, icon: const Icon(Icons.event_busy), label: Text(l10n.opFermerUnJour)),
                  ),

                SectionTitle(l10n.opChauffeursDeReserve),
                Text(l10n.opReservesExplication, style: AppTypography.caption),
                const SizedBox(height: AppSpacing.sm),
                AsyncBody(
                  value: backups,
                  loadingLabel: l10n.opChargementDesReserves,
                  onRetry: () => ref.invalidate(lineBackupsProvider(widget.lineId)),
                  data: (list) => Column(children: [
                    for (final rank in [2, 3])
                      _BackupSlot(
                        rank: rank,
                        backup: list.where((b) => b.rank == rank).firstOrNull,
                        busy: _busy || closed,
                        onInvite: () => _invite(rank),
                        onRemove: () => _do(() => _service.removeBackup(widget.lineId, rank)),
                      ),
                  ]),
                ),
                const SizedBox(height: AppSpacing.xl),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DepartureTile extends StatelessWidget {
  const _DepartureTile({required this.departure, required this.busy, required this.onToggle});

  final LineDeparture departure;
  final bool busy;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final d = departure;
    final status = switch (d.status) {
      DepartureStatus.toConfirm => l10n.opAConfirmer,
      // Seuil de départ : « en attente de N passagers » tant qu'il n'est pas atteint.
      DepartureStatus.open when d.awaitingPassengers => l10n.gtEnAttente((d.minPassengers! - d.seatsBooked).clamp(1, 99)),
      DepartureStatus.open when d.minPassengers != null => '${l10n.opEnVente} · ${l10n.gtConfirme}',
      DepartureStatus.open => l10n.opEnVente,
      DepartureStatus.closed when d.thresholdMissed => l10n.gtAnnule,
      DepartureStatus.closed => l10n.opVenteArretee,
    };
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(d.isReturn ? Icons.u_turn_left : Icons.arrow_forward),
      title: Text('${formatTripDate(d.departureAt, locale: locale)} · ${d.isReturn ? l10n.opRetour : l10n.opAller}'),
      subtitle: Text('${l10n.opPlacesReservees(d.seatsBooked, d.seatsTotal)} · $status'),
      trailing: onToggle == null || d.status == DepartureStatus.toConfirm || d.thresholdMissed
          ? null
          : TextButton(
              onPressed: busy ? null : onToggle,
              child: Text(d.status == DepartureStatus.closed ? l10n.opRouvrir : l10n.opArreterLaVente),
            ),
    );
  }
}

class _BackupSlot extends StatelessWidget {
  const _BackupSlot({required this.rank, required this.backup, required this.busy, required this.onInvite, required this.onRemove});

  final int rank;
  final LineBackup? backup;
  final bool busy;
  final VoidCallback onInvite;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final b = backup;
    final title = l10n.opReserveNumero(rank);
    if (b == null || b.status == BackupStatus.declined) {
      return ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.person_add_alt),
        title: Text(title),
        subtitle: Text(b == null ? l10n.opPersonneDesigne : l10n.opInvitationDeclinee),
        trailing: TextButton(onPressed: busy ? null : onInvite, child: Text(l10n.opInviter)),
      );
    }
    final state = b.status == BackupStatus.accepted ? l10n.opReserveConfirmee(b.vehicleLabel ?? '') : l10n.opInvitationEnAttente;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(b.status == BackupStatus.accepted ? Icons.verified_user_outlined : Icons.hourglass_top),
      title: Text('$title · ${b.firstName ?? ''}'),
      subtitle: Text(state),
      trailing: IconButton(tooltip: l10n.opRetirerCetteReserve, icon: const Icon(Icons.person_remove_outlined), onPressed: busy ? null : onRemove),
    );
  }
}

/// E-mail du compte XLCAB du chauffeur invité comme réserve.
class _EmailDialog extends StatefulWidget {
  const _EmailDialog({required this.rank});

  final int rank;

  @override
  State<_EmailDialog> createState() => _EmailDialogState();
}

class _EmailDialogState extends State<_EmailDialog> {
  final _email = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = _email.text.trim();
    final valid = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
    return AlertDialog(
      title: Text(l10n.opInviterReserve(widget.rank)),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(l10n.opInviterReserveExplication),
        const SizedBox(height: AppSpacing.md),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: InputDecoration(labelText: l10n.email),
          onChanged: (_) => setState(() {}),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.retour)),
        FilledButton(onPressed: valid ? () => Navigator.of(context).pop(value.toLowerCase()) : null, child: Text(l10n.opInviter)),
      ],
    );
  }
}

