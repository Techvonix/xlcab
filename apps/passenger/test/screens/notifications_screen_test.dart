import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/notifications_service.dart';
import 'package:xlcab_passenger/notification_targets.dart';
import 'package:xlcab_ui/screens/notifications_screen.dart';
import 'package:xlcab_ui/theme/app_theme.dart';
import 'package:xlcab_ui/widgets/notification_bell.dart';

// Cloche et boîte de réception : pastille des non-lues, tout marqué lu à l'ouverture,
// une notification de trajet ouvre son récapitulatif.

class FakeNotificationsService extends NotificationsService {
  FakeNotificationsService(this.box) : super(Dio());

  Inbox box;
  final List<String> calls = [];

  @override
  Future<Inbox> inbox({int page = 1}) async => box;

  @override
  Future<void> markRead([List<String>? ids]) async {
    calls.add('read:${ids ?? 'tout'}');
    box = Inbox(items: box.items, unread: 0);
  }
}

AppNotification notification(String id, String title, {Map<String, String> data = const {}, bool read = false}) => AppNotification(
      id: id,
      type: 'line.guaranteed',
      title: title,
      body: 'Votre départ du 23 oct. est confirmé.',
      createdAt: DateTime(2026, 10, 22, 9),
      readAt: read ? DateTime(2026, 10, 22, 10) : null,
      data: data,
    );

Future<void> pump(WidgetTester tester, FakeNotificationsService api) async {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(appBar: AppBar(actions: const [NotificationBell()]))),
    GoRoute(path: AppRoutes.notifications, builder: (_, __) => const NotificationsScreen(targetOf: passengerNotificationTarget)),
    GoRoute(path: AppRoutes.confirmation, builder: (_, s) => Text('TRAJET ${s.pathParameters['tripId']}')),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [notificationsServiceProvider.overrideWithValue(api)],
    child: MaterialApp.router(theme: AppTheme.light, routerConfig: router),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('pastille des non-lues ; à l’ouverture tout est marqué lu ; une notification de trajet ouvre le récapitulatif', (tester) async {
    final api = FakeNotificationsService(Inbox(
      unread: 2,
      items: [
        notification('n1', 'Départ confirmé', data: {'tripId': 't1'}),
        notification('n2', 'Réservation confirmée'),
        notification('n3', 'Ancienne', read: true),
      ],
    ));
    await pump(tester, api);
    expect(find.text('2'), findsOneWidget);
    expect(find.byTooltip('Notifications, 2 non lues'), findsOneWidget);

    await tester.tap(find.byTooltip('Notifications, 2 non lues'));
    await tester.pumpAndSettle();
    expect(find.text('Départ confirmé'), findsOneWidget);
    expect(find.text('Ancienne'), findsOneWidget);
    expect(api.calls, ['read:tout']);

    await tester.tap(find.text('Départ confirmé'));
    await tester.pumpAndSettle();
    expect(find.text('TRAJET t1'), findsOneWidget);
  });

  testWidgets('boîte vide : message, pas de pastille', (tester) async {
    final api = FakeNotificationsService(const Inbox(items: [], unread: 0));
    await pump(tester, api);
    expect(find.byTooltip('Notifications'), findsOneWidget);
    await tester.tap(find.byTooltip('Notifications'));
    await tester.pumpAndSettle();
    expect(find.text('Aucune notification pour l’instant.'), findsOneWidget);
    expect(api.calls, isEmpty);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });

  test('cible : colis, trajet, demande de devis ; rien sinon', () {
    expect(passengerNotificationTarget({'parcelId': 'p1', 'tripId': 't1'}), AppRoutes.parcelTrackingFor('p1'));
    expect(passengerNotificationTarget({'tripId': 't1'}), AppRoutes.confirmationFor('t1'));
    expect(passengerNotificationTarget({'requestId': 'r1'}), AppRoutes.requestDetailFor('r1'));
    expect(passengerNotificationTarget({'type': 'account.inactivity_notice'}), isNull);
  });
}
