import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/services/auth_service.dart';
import 'package:xlcab_core/services/notifications_service.dart';
import 'package:xlcab_core/services/push_service.dart';
import 'package:xlcab_core/services/token_storage.dart';

import '../support/auth_fakes.dart';

// Notifications push : enregistrement du téléphone, retrait à la déconnexion, ouverture
// de l'écran voulu ; lecture de la boîte de réception.

class FakePushSource implements PushSource {
  bool allowed = true;
  String? currentToken = 'jeton-1';
  final refresh = StreamController<String>.broadcast();
  final foreground = StreamController<Map<String, String>>.broadcast();
  final opened = StreamController<Map<String, String>>.broadcast();
  Map<String, String>? launchedFrom;

  @override
  String get platform => 'android';
  @override
  Future<bool> requestPermission() async => allowed;
  @override
  Future<String?> token() async => currentToken;
  @override
  Stream<String> get onTokenRefresh => refresh.stream;
  @override
  Stream<Map<String, String>> get onForegroundMessage => foreground.stream;
  @override
  Stream<Map<String, String>> get onOpened => opened.stream;
  @override
  Future<Map<String, String>?> initialOpen() async => launchedFrom;
}

class FakeNotificationsService extends NotificationsService {
  FakeNotificationsService() : super(Dio());

  final List<String> calls = [];
  int inboxLoads = 0;

  @override
  Future<Inbox> inbox({int page = 1}) async {
    inboxLoads++;
    return const Inbox(items: [], unread: 0);
  }

  @override
  Future<void> registerDevice({required String token, required String platform, required String app}) async =>
      calls.add('register:$token:$platform:$app');

  @override
  Future<void> removeDevice(String token) async => calls.add('remove:$token');
}

void main() {
  late FakePushSource source;
  late FakeNotificationsService api;
  late MemoryTokenStorage storage;
  late FakeTokenRefresher refresher;

  ProviderContainer container() {
    final c = ProviderContainer(overrides: [
      pushSourceProvider.overrideWithValue(source),
      notificationsServiceProvider.overrideWithValue(api),
      tokenStorageProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(FakeAuthService()),
      tokenRefresherProvider.overrideWithValue(refresher),
    ]);
    addTearDown(c.dispose);
    c.listen(authProvider, (_, __) {});
    return c;
  }

  setUp(() {
    source = FakePushSource();
    api = FakeNotificationsService();
    storage = MemoryTokenStorage()
      ..access = fakeJwt({'sub': 'u1', 'role': 'passenger'})
      ..refresh = 'r';
    refresher = FakeTokenRefresher(storage)..result = RefreshResult.offline;
  });

  test('connexion : le téléphone est enregistré, puis à chaque nouveau jeton', () async {
    final c = container();
    await c.read(pushControllerProvider).start(app: 'passenger', onOpen: (_) {});
    expect(api.calls, ['register:jeton-1:android:passenger']);
    source.refresh.add('jeton-2');
    await Future<void>.delayed(Duration.zero);
    expect(api.calls.last, 'register:jeton-2:android:passenger');
  });

  test('autorisation refusée par l’utilisateur : rien n’est enregistré', () async {
    source.allowed = false;
    final c = container();
    await c.read(pushControllerProvider).start(app: 'passenger', onOpen: (_) {});
    expect(api.calls, isEmpty);
  });

  test('notification touchée : appli lancée par elle, ou ramenée au premier plan', () async {
    source.launchedFrom = {'type': 'line.guaranteed', 'tripId': 't1'};
    final opened = <Map<String, String>>[];
    final c = container();
    await c.read(pushControllerProvider).start(app: 'passenger', onOpen: opened.add);
    source.opened.add({'type': 'parcel.confirmed', 'parcelId': 'p1'});
    await Future<void>.delayed(Duration.zero);
    expect(opened, [
      {'type': 'line.guaranteed', 'tripId': 't1'},
      {'type': 'parcel.confirmed', 'parcelId': 'p1'},
    ]);
  });

  test('notification reçue appli ouverte : la boîte de réception est relue', () async {
    final c = container();
    c.listen(inboxProvider, (_, __) {});
    await c.read(inboxProvider.future);
    await c.read(pushControllerProvider).start(app: 'driver', onOpen: (_) {});
    source.foreground.add({'type': 'line.new_booking'});
    await Future<void>.delayed(Duration.zero);
    await c.read(inboxProvider.future);
    expect(api.inboxLoads, 2);
  });

  test('déconnexion volontaire : le téléphone est retiré AVANT la fin de la session', () async {
    final c = container();
    await Future<void>.delayed(Duration.zero);
    await c.read(pushControllerProvider).start(app: 'passenger', onOpen: (_) {});
    await c.read(authProvider.notifier).signOut();
    expect(api.calls, ['register:jeton-1:android:passenger', 'remove:jeton-1']);
    expect(c.read(authProvider).isAuthenticated, isFalse);
  });

  test('sans Firebase (pas de paramètres de compilation) : aucun appel', () async {
    final c = ProviderContainer(overrides: [pushSourceProvider.overrideWithValue(null), notificationsServiceProvider.overrideWithValue(api)]);
    addTearDown(c.dispose);
    await c.read(pushControllerProvider).start(app: 'passenger', onOpen: (_) {});
    expect(api.calls, isEmpty);
  });

  test('boîte de réception : lecture du serveur, non-lues, données texte', () {
    final box = Inbox.fromJson({
      'unread': 1,
      'items': [
        {'id': 'n1', 'type': 'line.guaranteed', 'title': 'Départ confirmé', 'body': 'b', 'data': {'tripId': 't1', 'seats': 2}, 'readAt': null, 'createdAt': '2026-10-23T08:00:00.000Z'},
        {'id': 'n2', 'type': 'x', 'title': 'Lu', 'body': 'b', 'readAt': '2026-10-23T09:00:00.000Z', 'createdAt': '2026-10-22T08:00:00.000Z'},
        {'type': 'sans id'},
      ],
    });
    expect(box.unread, 1);
    expect(box.items, hasLength(2));
    expect(box.items.first.data, {'tripId': 't1', 'seats': '2'});
    expect(box.items.first.unread, isTrue);
    expect(box.items.last.unread, isFalse);
  });
}
