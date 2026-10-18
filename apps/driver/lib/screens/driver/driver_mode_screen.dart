import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/trip.dart';
import '../../providers/driver_mode_provider.dart';
import 'package:xlcab_core/services/document_picker.dart';
import '../../services/driver_device.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'widgets/mission_card.dart';
import 'widgets/offer_card.dart';
import 'widgets/parcel_checklist.dart';
import '../operator/operator_section.dart';
import 'package:xlcab_core/l10n/l10n.dart';

final _uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);

/// Écran 15 — Mode chauffeur (Partie 7) : en ligne / hors ligne, offres
/// de mission (30 s), mission en cours (itinéraire, scan du QR, fin de
/// course), missions à venir et revenus.
/// (Checklist colis : avec le module Colis, pas encore en base.)
class DriverModeScreen extends ConsumerStatefulWidget {
  const DriverModeScreen({super.key});

  @override
  ConsumerState<DriverModeScreen> createState() => _DriverModeScreenState();
}

class _DriverModeScreenState extends ConsumerState<DriverModeScreen> with WidgetsBindingObserver {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    // Retour au premier plan : offre reçue entre-temps, missions modifiées…
    if (lifecycle == AppLifecycleState.resumed) {
      ref.read(driverModeProvider.notifier).load();
      refreshOperatorSection(ref);
    }
  }

  DriverModeController get _controller => ref.read(driverModeProvider.notifier);

  void _snack(String message) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 5)));

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── Actions sur la mission ──────────────────────────────────────────

  MissionActions _actionsFor(Mission m) {
    final launcher = ref.read(driverLauncherProvider);
    return MissionActions(
      onNavigate: () async {
        final ok = await launcher.navigateTo(_navigationTarget(m));
        if (!ok && mounted) _snack(l10n.impossibleDOuvrirLItineraire);
      },
      onCall: (phone) => launcher.call(phone),
      onScanAndStart: () => _run(() async {
        final code = await _scanUuid();
        if (code == null) return;
        if (m.isParcelTrip) {
          await _controller.pickupAndStart(m, code);
        } else {
          await _controller.startMission(m, qrCode: code);
        }
      }),
      parcels: ParcelActions(
        onCall: (phone) => launcher.call(phone),
        onScan: (p) => _run(() async {
          final code = await _scanUuid();
          if (code != null) await _controller.pickupParcel(p, code);
        }),
        onDeliver: (p) => _run(() async {
          final code = await showDialog<String>(context: context, builder: (_) => const DeliveryCodeDialog());
          if (code == null || !mounted) return;
          // Photo obligatoire : seconde preuve de remise en cas de litige.
          final photo = await ref.read(documentPickerProvider).pick(DocumentSource.camera);
          if (photo == null) {
            _snack(l10n.photoDuColisRemisObligatoire);
            return;
          }
          await _controller.deliverParcel(p, code, photo);
        }),
        onFail: (p) => _run(() async {
          final reason = await showDialog<String>(context: context, builder: (_) => ParcelProblemDialog(task: p));
          if (reason != null) await _controller.failParcel(p, reason);
        }),
      ),
      onStartWithoutScan: () => _run(() async {
        final ok = await _confirm(
          title: l10n.demarrerSansScanner,
          body: l10n.leScanDuQrProuve +
              l10n.lEmbarquementNeSeraPas,
          action: l10n.demarrer,
        );
        if (ok) await _controller.startMission(m);
      }),
      onComplete: () => _run(() async {
        final ok = await _confirm(
          title: l10n.terminerLaCourse,
          body: l10n.confirmezQueLePassagerA,
          action: l10n.terminer,
        );
        if (ok) await _controller.completeMission(m);
      }),
      onWithdraw: () => _run(() async {
        final ok = await _confirm(
          title: l10n.vousDesister,
          body: l10n.laCourseSeraProposeeA +
              l10n.repetesPeuventEntrainerUneSuspension,
          action: l10n.meDesister,
        );
        if (ok) await _controller.withdraw(m, l10n.desistementDuChauffeur);
      }),
    );
  }

  /// Où aller maintenant : prochain colis à enlever, sinon prochaine remise,
  /// sinon départ / arrivée de la course.
  Place _navigationTarget(Mission m) {
    final parcels = m.currentParcels;
    for (final p in parcels) {
      if (p.toPickUp && m.status != TripStatus.accepted) return p.pickup;
    }
    if (m.isReturnStep || m.status == TripStatus.started) {
      for (final p in parcels) {
        if (p.onBoard) return p.delivery;
      }
    }
    if (m.isReturnStep) return m.origin; // retour vers le point de départ de l'aller
    return m.status == TripStatus.started ? m.destination : m.origin;
  }

  /// QR XLCAB (passager ou colis) : identifiant opaque au format UUID.
  Future<String?> _scanUuid() async {
    final code = await ref.read(qrScannerProvider).scan(context);
    if (code == null) return null;
    if (!_uuid.hasMatch(code.trim())) {
      _snack(l10n.qrCodeNonReconnuCe);
      return null;
    }
    return code.trim();
  }

  Future<bool> _confirm({required String title, required String body, required String action}) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.retour)),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(action),
          ),
        ],
      ),
    );
    return res == true;
  }

  // ── Construction ────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverModeProvider);
    ref.listen(driverModeProvider.select((s) => s.notice), (prev, next) {
      if (next != null && next.id != prev?.id) _snack(next.message);
    });

    return Scaffold(
      appBar: AppBar(
        // Onglet « Aujourd'hui » : revenus, départs et profil ont leur propre onglet.
        title: Text(l10n.aujourdHui),
        automaticallyImplyLeading: false,
      ),
      body: Stack(
        children: [
          if (state.loading)
            Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDuModeChauffeur))
          else if (state.loadError != null)
            _LoadError(message: state.loadError!, onRetry: _controller.load)
          else
            RefreshIndicator(
              onRefresh: () async {
                refreshOperatorSection(ref);
                await _controller.refresh();
              },
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.md, AppSpacing.md, AppSpacing.md,
                  // Place pour l'offre affichée par-dessus.
                  state.offer == null ? AppSpacing.lg : 420,
                ),
                children: _content(state),
              ),
            ),
          if (state.offer != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: OfferCard(
                key: ValueKey(state.offer!.tripId),
                offer: state.offer!,
                answering: state.answering,
                onAccept: _controller.acceptOffer,
                onRefuse: _controller.refuseOffer,
              ),
            ),
        ],
      ),
    );
  }

  List<Widget> _content(DriverModeState state) {
    final scheme = Theme.of(context).colorScheme;
    // Réservations de ligne : regroupées par départ dans la section opérateur.
    final current = state.missions.currentStandalone;
    final others = state.missions.standalone.where((m) => m.id != current?.id).toList();

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
          child: Semantics(header: true, child: Text(title, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
        );

    return [
      if (!state.approved)
        _InfoBanner(
          icon: Icons.hourglass_top,
          text: l10n.votreCompteChauffeurEstEn +
              l10n.vousPourrezPasserEnLigne,
        )
      else
        _OnlineCard(state: state, onChanged: _controller.setOnline),
      if (state.approved) const OperatorSection(),
      if (current != null) ...[
        section(current.isReturnStep ? l10n.retour : current.status == TripStatus.started ? l10n.enCourse : l10n.mission),
        MissionCard(mission: current, actions: _actionsFor(current), busy: _busy),
      ],
      if (others.isNotEmpty) ...[
        section(l10n.missionsAVenir),
        for (final m in others) MissionTile(mission: m),
      ],
    ];
  }
}

class _OnlineCard extends StatelessWidget {
  const _OnlineCard({required this.state, required this.onChanged});

  final DriverModeState state;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final online = state.online;
    final String detail;
    if (!online) {
      detail = l10n.passezEnLignePourRecevoir;
    } else if (!state.connected) {
      detail = l10n.connexionAuServeurLesMissions;
    } else {
      detail = l10n.enAttenteDeMissionsGardez;
    }

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        boxShadow: AppShadows.level1,
      ),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Icon(
              online ? (state.connected ? Icons.wifi_tethering : Icons.wifi_tethering_error) : Icons.power_settings_new,
              color: online ? AppColors.success : scheme.onSurface.withValues(alpha: 0.6),
              size: 32,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(online ? l10n.enLigne : l10n.horsLigne, style: AppTypography.h3.copyWith(color: scheme.onSurface)),
                Text(detail, style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
                Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: Text(
                      // Pas de note tant qu'aucun passager n'a noté (le serveur renvoie null).
                      state.rating == null
                          ? l10n.pasEncoreDeNoteCourses(state.totalTrips)
                          : l10n.noteCourses(formatDecimal(state.rating!, keepDigits: true), state.totalTrips),
                      style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75)),
                    ),
                  ),
              ],
            ),
          ),
          Semantics(
            label: l10n.disponiblePourDesMissions,
            child: Switch(
              value: online,
              activeTrackColor: AppColors.success,
              onChanged: state.toggling ? null : onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

/// Revenus du jour, de la semaine et du mois (onglet Revenus).
class EarningsCard extends StatelessWidget {
  const EarningsCard({super.key, required this.earnings});

  final Earnings? earnings;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final e = earnings;

    Widget tile(String label, EarningsPeriod? p) => Expanded(
          child: Semantics(
            container: true,
            child: Column(
              children: [
                Text(label, style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75))),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  p == null ? '—' : formatPrice(p.netCents, locale: locale),
                  style: AppTypography.bodyBold.copyWith(color: scheme.onSurface, fontFeatures: const [FontFeature.tabularFigures()]),
                ),
                Text(
                  p == null ? '' : l10n.course(p.trips, p.trips > 1 ? 's' : ''),
                  style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75)),
                ),
              ],
            ),
          ),
        );

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(AppSpacing.radiusCard)),
      child: Column(
        children: [
          Row(children: [tile(l10n.aujourdHui, e?.today), tile(l10n.cetteSemaine, e?.week), tile(l10n.ceMois, e?.month)]),
          const SizedBox(height: AppSpacing.sm),
          Text(
            e == null
                ? l10n.revenuNetDesCoursesTerminees
                : l10n.revenuNetCommissionXlcabDe(_percent(e.commissionPercent)) +
                    l10n.ceMoisPayesParLes(formatPrice(e.month.grossCents, locale: locale)) +
                    l10n.commission(formatPrice(e.month.commissionCents, locale: locale)),
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(color: scheme.onSurface.withValues(alpha: 0.75)),
          ),
        ],
      ),
    );
  }
}

/// 10 → "10 %", 12.5 → "12,5 %" (12.5 % en anglais).
String _percent(double p) =>
    '${formatDecimal(p)} %';

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(color: scheme.surface, borderRadius: BorderRadius.circular(AppSpacing.radiusCard)),
      child: Row(children: [
        ExcludeSemantics(child: Icon(icon, color: scheme.onSurface)),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: Text(text, style: AppTypography.body.copyWith(color: scheme.onSurface))),
      ]),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton(onPressed: onRetry, child: Text(l10n.reessayer)),
          ]),
        ),
      );
}
