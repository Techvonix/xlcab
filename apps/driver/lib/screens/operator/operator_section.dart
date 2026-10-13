import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/operator.dart';
import '../../providers/operator_provider.dart';
import 'package:xlcab_core/routes.dart';
import '../../services/operator_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/async_widgets.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Rafraîchit toutes les données de l'espace opérateur affichées dans le mode chauffeur.
void refreshOperatorSection(WidgetRef ref) {
  ref.invalidate(rescueOffersProvider);
  ref.invalidate(backupRolesProvider);
  ref.invalidate(assignmentsProvider);
}

/// Dans le mode chauffeur (écran 15) : départs à reprendre en urgence,
/// invitations de réserve, départs de ligne que j'assure et accès à
/// l'espace opérateur (lignes, bourse, annulations).
class OperatorSection extends ConsumerWidget {
  const OperatorSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rescues = ref.watch(rescueOffersProvider).valueOrNull ?? const <RescueOffer>[];
    final invites = (ref.watch(backupRolesProvider).valueOrNull ?? const <BackupRole>[]).where((b) => b.status == BackupStatus.invited).toList();
    final assignments = ref.watch(assignmentsProvider).valueOrNull ?? const <Assignment>[];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (rescues.isNotEmpty) ...[
        SectionTitle(l10n.opDepartsAReprendre),
        for (final r in rescues) _RescueCard(offer: r),
      ],
      if (invites.isNotEmpty) ...[
        SectionTitle(l10n.opInvitationsDeReserve),
        for (final b in invites) _BackupInviteCard(role: b),
      ],
      if (assignments.isNotEmpty) ...[
        SectionTitle(l10n.opMesDepartsDeLigne),
        for (final a in assignments) AssignmentTile(assignment: a),
      ],
    ]);
  }
}

/// Accès à l'espace opérateur : lignes, bourse, compte de versement, annulations, profil.
class OperatorEntries extends StatelessWidget {
  const OperatorEntries({super.key, this.onNavigate});

  /// Appelé avant d'ouvrir un écran (ferme le menu qui contient ces entrées).
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
        _Entry(icon: Icons.alt_route, label: l10n.opMesLignes, route: AppRoutes.myLines, onNavigate: onNavigate),
        _Entry(icon: Icons.storefront_outlined, label: l10n.mkBourse, route: AppRoutes.driverMarket, onNavigate: onNavigate),
        _Entry(icon: Icons.account_balance_outlined, label: l10n.payEntree, route: AppRoutes.driverPayouts, onNavigate: onNavigate),
        _Entry(icon: Icons.report_outlined, label: l10n.opMesAnnulations, route: AppRoutes.driverCancellations, onNavigate: onNavigate),
        _Entry(icon: Icons.badge_outlined, label: l10n.opProfilOperateur, route: AppRoutes.operatorProfile, onNavigate: onNavigate),
      ]);
}

/// Menu « Espace opérateur » ouvert depuis la barre du mode chauffeur.
Future<void> showOperatorMenu(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // Défilable : en paysage ou avec un texte agrandi, les 4 entrées dépassent la hauteur.
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(l10n.opEspaceOperateur, style: AppTypography.h3),
            // Le menu se ferme, puis l'écran s'ouvre depuis le mode chauffeur.
            OperatorEntries(onNavigate: () => Navigator.of(sheet).pop()),
          ]),
        ),
      ),
    );

class _Entry extends StatelessWidget {
  const _Entry({required this.icon, required this.label, required this.route, this.onNavigate});

  final IconData icon;
  final String label;
  final String route;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          final router = GoRouter.of(context);
          onNavigate?.call();
          router.push(route);
        },
      );
}

/// Départ abandonné par son chauffeur : le premier secours qui accepte le reprend.
class _RescueCard extends ConsumerStatefulWidget {
  const _RescueCard({required this.offer});

  final RescueOffer offer;

  @override
  ConsumerState<_RescueCard> createState() => _RescueCardState();
}

class _RescueCardState extends ConsumerState<_RescueCard> {
  bool _busy = false;

  Future<void> _answer(bool accept) async {
    setState(() => _busy = true);
    final ok = await runAction(
      context,
      () => ref.read(operatorServiceProvider).answerRescue(widget.offer.id, accept: accept),
      success: accept ? l10n.opDepartRepris : null,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    // Même en cas d'échec (déjà repris par un autre) : la liste a changé.
    refreshOperatorSection(ref);
    if (ok && accept) {
      final departureId = await _departureOfOffer();
      if (mounted && departureId.isNotEmpty) context.push(AppRoutes.departureFor(departureId));
    }
  }

  /// Le départ repris apparaît dans « Mes départs de ligne » ; on l'ouvre directement.
  Future<String> _departureOfOffer() async {
    final list = await ref.read(assignmentsProvider.future);
    final match = list.where((a) => a.departureAt == widget.offer.departureAt).firstOrNull;
    return match?.departureId ?? (list.isEmpty ? '' : list.first.departureId);
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final locale = Localizations.localeOf(context).languageCode;
    return OpCard(
      highlight: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(o.fromBackupRole ? l10n.opVousEtesReserve : l10n.opAlerteGenerale, style: AppTypography.bodyBold),
        const SizedBox(height: AppSpacing.xs),
        Text(l10n.opTrajet(o.origin, o.destination)),
        Text('${formatTripDate(o.departureAt, locale: locale)} · ${l10n.mkPassagers(o.passengers)} · ${formatPrice(o.totalPriceCents, locale: locale)}'),
        Text(l10n.opRepondezAvant(formatTripDate(o.expiresAt, locale: locale)), style: AppTypography.caption),
        const SizedBox(height: AppSpacing.sm),
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
          FilledButton.icon(onPressed: _busy ? null : () => _answer(true), icon: const Icon(Icons.check), label: Text(l10n.opJeReprends)),
          OutlinedButton(onPressed: _busy ? null : () => _answer(false), child: Text(l10n.opJeNePeuxPas)),
        ]),
      ]),
    );
  }
}

/// Un opérateur me propose d'être sa réserve n° 2 ou n° 3.
class _BackupInviteCard extends ConsumerStatefulWidget {
  const _BackupInviteCard({required this.role});

  final BackupRole role;

  @override
  ConsumerState<_BackupInviteCard> createState() => _BackupInviteCardState();
}

class _BackupInviteCardState extends ConsumerState<_BackupInviteCard> {
  bool _busy = false;

  Future<void> _accept() async {
    final vehicles = await ref.read(operatorVehiclesProvider.future);
    if (!mounted) return;
    final fitting = vehicles.where((v) => v.capacity >= widget.role.seats).toList();
    if (fitting.isEmpty) {
      showToast(context, l10n.opAucunVehiculeAssezGrand(widget.role.seats));
      return;
    }
    final vehicleId = fitting.length == 1
        ? fitting.first.id
        : await showDialog<String>(
            context: context,
            builder: (context) => SimpleDialog(
              title: Text(l10n.opChoisissezUnVehicule),
              children: [
                for (final v in fitting)
                  SimpleDialogOption(
                    onPressed: () => Navigator.of(context).pop(v.id),
                    child: Text(l10n.opVehiculePlaces(v.label.isEmpty ? l10n.opVehicule : v.label, v.capacity)),
                  ),
              ],
            ),
          );
    if (vehicleId == null || !mounted) return;
    await _answer(true, vehicleId);
  }

  Future<void> _answer(bool accept, [String? vehicleId]) async {
    setState(() => _busy = true);
    await runAction(
      context,
      () => ref.read(operatorServiceProvider).answerBackup(widget.role.id, accept: accept, vehicleId: vehicleId),
      success: accept ? l10n.opReserveAcceptee : null,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    ref.invalidate(backupRolesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.role;
    return OpCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(l10n.opInvitationReserve(r.rank), style: AppTypography.bodyBold),
        Text(l10n.opTrajet(r.origin, r.destination)),
        Text(l10n.opHoraireJours(r.departureTime, daysLabel(r.daysOfWeek)), style: AppTypography.caption),
        const SizedBox(height: AppSpacing.xs),
        Text(l10n.opInvitationReserveExplication, style: AppTypography.caption),
        const SizedBox(height: AppSpacing.sm),
        Wrap(spacing: AppSpacing.sm, children: [
          FilledButton(onPressed: _busy ? null : _accept, child: Text(l10n.opAccepter)),
          OutlinedButton(onPressed: _busy ? null : () => _answer(false), child: Text(l10n.opDecliner)),
        ]),
      ]),
    );
  }
}

/// Un départ de ligne que j'assure : ouvre sa liste d'embarquement.
class AssignmentTile extends StatelessWidget {
  const AssignmentTile({super.key, required this.assignment});

  final Assignment assignment;

  @override
  Widget build(BuildContext context) {
    final a = assignment;
    final locale = Localizations.localeOf(context).languageCode;
    final state = a.started ? l10n.opEnCours : (a.ready ? l10n.opEnRoute : l10n.opAConfirmerEnRoute);
    return OpCard(
      highlight: !a.ready && !a.started,
      child: InkWell(
        onTap: () => context.push(AppRoutes.departureFor(a.departureId)),
        child: Row(children: [
          const ExcludeSemantics(child: Icon(Icons.airport_shuttle_outlined)),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(formatTripDate(a.departureAt, locale: locale), style: AppTypography.bodyBold),
              Text(l10n.opTrajet(a.origin, a.destination)),
              Text(
                '${l10n.mkPassagers(a.passengers)} · $state${a.rescued ? ' · ${l10n.opRepris}' : ''}',
                style: AppTypography.caption,
              ),
            ]),
          ),
          const ExcludeSemantics(child: Icon(Icons.chevron_right)),
        ]),
      ),
    );
  }
}
