import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/services/notifications_service.dart';
import 'package:xlcab_core/utils/formatters.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import '../widgets/async_widgets.dart';

/// Boîte de réception des notifications (route `AppRoutes.notifications`, cloche des deux
/// applis). À l'ouverture, tout est marqué lu ; une notification qui concerne un trajet, un
/// colis ou un départ ouvre l'écran correspondant ([targetOf], propre à chaque appli).
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key, required this.targetOf});

  /// Route à ouvrir pour une notification, d'après son type et ses données (null : rien à ouvrir).
  final String? Function(Map<String, String> data) targetOf;

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _marked = false;

  Future<void> _markAllRead() async {
    if (_marked) return;
    _marked = true;
    try {
      await ref.read(notificationsServiceProvider).markRead();
    } catch (_) {
      // Sans effet visible : réessayé à la prochaine ouverture.
    }
  }

  @override
  void initState() {
    super.initState();
    // fireImmediately : la boîte est souvent déjà chargée par la cloche avant l'ouverture.
    ref.listenManual(inboxProvider, (_, next) {
      if (next.valueOrNull?.unread case final n? when n > 0) _markAllRead();
    }, fireImmediately: true);
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(inboxProvider);
    final locale = Localizations.localeOf(context).languageCode;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.ntTitre)),
      body: AsyncBody(
        value: inbox,
        loadingLabel: l10n.chargement,
        onRetry: () => ref.invalidate(inboxProvider),
        data: (box) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(inboxProvider),
          child: box.items.isEmpty
              ? ListView(children: [
                  Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Text(l10n.ntAucune, textAlign: TextAlign.center, style: AppTypography.body.copyWith(color: scheme.onSurface)),
                  ),
                ])
              : ListView.separated(
                  itemCount: box.items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final n = box.items[i];
                    final target = widget.targetOf({...n.data, 'type': n.type});
                    return ListTile(
                      leading: ExcludeSemantics(
                        child: Icon(n.unread ? Icons.notifications_active : Icons.notifications_none, color: scheme.primary),
                      ),
                      title: Text(n.title, style: n.unread ? AppTypography.bodyBold : AppTypography.body),
                      subtitle: Text('${n.body}\n${formatTripDate(n.createdAt, locale: locale)}'),
                      isThreeLine: true,
                      trailing: target == null ? null : const Icon(Icons.chevron_right),
                      onTap: target == null ? null : () => context.push(target),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
