import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/notifications_service.dart';

/// Cloche de la barre du haut : ouvre la boîte de réception, pastille des non-lues.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider);
    return IconButton(
      tooltip: unread > 0 ? l10n.ntNonLues(unread) : l10n.notifications,
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: Icon(unread > 0 ? Icons.notifications_active_outlined : Icons.notifications_none),
      ),
      onPressed: () async {
        await context.push(AppRoutes.notifications);
        // Retour de la boîte : tout y a été marqué lu.
        ref.invalidate(inboxProvider);
      },
    );
  }
}
