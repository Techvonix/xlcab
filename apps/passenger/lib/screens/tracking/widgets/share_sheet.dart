import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';

import '../../../services/safety_service.dart';

/// Feuille « Partager mon trajet » du suivi : prépare le lien de suivi, puis
/// l'envoie à un contact de confiance (SMS déjà rédigé dans la messagerie du
/// téléphone), le copie, ou arrête le partage.
Future<void> showShareSheet(BuildContext context, String tripId) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // Défilable : cinq contacts et un texte agrandi dépassent la demi-hauteur.
      isScrollControlled: true,
      builder: (_) => ShareSheet(tripId: tripId),
    );

class ShareSheet extends ConsumerStatefulWidget {
  const ShareSheet({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<ShareSheet> createState() => _ShareSheetState();
}

class _ShareSheetState extends ConsumerState<ShareSheet> {
  String? _url;
  String? _error;
  bool _stopping = false;

  @override
  void initState() {
    super.initState();
    _prepare();
  }

  /// Ouvrir la feuille, c'est vouloir partager : le lien est créé (ou retrouvé) tout de suite.
  Future<void> _prepare() async {
    setState(() => _error = null);
    try {
      final share = await ref.read(safetyServiceProvider).share(widget.tripId);
      if (mounted) setState(() => _url = share.url);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    if (mounted && _url == null && _error == null) setState(() => _error = l10n.secPartageIndisponible);
  }

  void _toast(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _sendTo(TrustedContact contact) async {
    final url = _url!;
    final ok = await ref.read(smsComposerProvider)(contact.phone, l10n.secMessageSuivi(url));
    if (ok || !mounted) return;
    // Pas de messagerie SMS (tablette…) : le lien reste utilisable.
    await ref.read(clipboardWriterProvider)(url);
    if (mounted) _toast(l10n.secSmsImpossible);
  }

  Future<void> _copy() async {
    await ref.read(clipboardWriterProvider)(_url!);
    if (mounted) _toast(l10n.secLienCopie);
  }

  Future<void> _stop() async {
    setState(() => _stopping = true);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(safetyServiceProvider).stopSharing(widget.tripId);
      navigator.pop();
      messenger.showSnackBar(SnackBar(content: Text(l10n.secPartageArrete)));
    } on ApiException catch (e) {
      if (mounted) setState(() => _stopping = false);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);
    final contacts = ref.watch(trustedContactsProvider).valueOrNull ?? const <TrustedContact>[];

    Widget content;
    if (_error != null) {
      content = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(_error!, style: AppTypography.body.copyWith(color: scheme.onSurface)),
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton(onPressed: _prepare, child: Text(l10n.reessayer)),
      ]);
    } else if (_url == null) {
      content = Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.secPreparation)),
      );
    } else {
      content = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(l10n.secPartageExplication, style: AppTypography.body.copyWith(color: muted)),
        const SizedBox(height: AppSpacing.sm),
        if (contacts.isEmpty)
          Text(l10n.secAucunContactFeuille, style: AppTypography.body.copyWith(color: scheme.onSurface))
        else
          for (final c in contacts)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.sms_outlined),
              title: Text(l10n.secEnvoyerA(c.name)),
              subtitle: Text(c.phone),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _sendTo(c),
            ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.link),
          title: Text(l10n.secCopierLien),
          onTap: _copy,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.group_outlined),
          title: Text(l10n.secGererContacts),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            final router = GoRouter.of(context);
            Navigator.of(context).pop();
            router.push(AppRoutes.trustedContacts);
          },
        ),
        const SizedBox(height: AppSpacing.sm),
        OutlinedButton.icon(
          onPressed: _stopping ? null : _stop,
          icon: const Icon(Icons.link_off),
          label: Text(l10n.secArreterPartage),
        ),
      ]);
    }

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Semantics(header: true, child: Text(l10n.secPartagerTrajet, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
          const SizedBox(height: AppSpacing.sm),
          content,
        ]),
      ),
    );
  }
}

/// Partage proposé de lui-même à l'ouverture du suivi, quand l'option est
/// activée, qu'il y a au moins un contact et qu'aucun partage n'est en cours.
/// Une seule fois par ouverture de l'écran ; sans effet si un appel échoue.
class AutoSharePrompt extends ConsumerStatefulWidget {
  const AutoSharePrompt({super.key, required this.tripId});

  final String tripId;

  @override
  ConsumerState<AutoSharePrompt> createState() => _AutoSharePromptState();
}

class _AutoSharePromptState extends ConsumerState<AutoSharePrompt> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybePrompt());
  }

  Future<void> _maybePrompt() async {
    try {
      final prefs = await ref.read(feedbackServiceProvider).preferences();
      if (!prefs.autoShareTrips || !mounted) return;
      final contacts = await ref.read(safetyServiceProvider).contacts();
      if (contacts.isEmpty || !mounted) return;
      final share = await ref.read(safetyServiceProvider).shareStatus(widget.tripId);
      if (share.active || !mounted) return;
      await showShareSheet(context, widget.tripId);
    } on ApiException {
      // Le suivi reste utilisable : le bouton « Partager » est toujours là.
    }
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
