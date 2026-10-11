import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/auth_service.dart';
import 'package:xlcab_core/services/token_storage.dart';

import '../support/auth_fakes.dart';

void main() {
  late MemoryTokenStorage storage;
  late FakeAuthService service;
  late FakeTokenRefresher refresher;

  ProviderContainer makeContainer() {
    final c = ProviderContainer(overrides: [
      tokenStorageProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(service),
      tokenRefresherProvider.overrideWithValue(refresher),
    ]);
    addTearDown(c.dispose);
    // Création immédiate : la reprise de session démarre comme à
    // l'ouverture de l'app (un provider n'existe qu'à sa première lecture).
    c.listen(authProvider, (_, __) {});
    return c;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  setUp(() {
    storage = MemoryTokenStorage();
    service = FakeAuthService();
    refresher = FakeTokenRefresher(storage);
  });

  group('reprise de session au démarrage', () {
    test('aucune session : non connecté', () async {
      final c = makeContainer();
      expect(c.read(authProvider).isLoading, isTrue); // splash
      await settle();
      expect(c.read(authProvider).isLoading, isFalse);
      expect(c.read(authProvider).isAuthenticated, isFalse);
    });

    test('refresh accepté : connecté avec le rôle relu par le serveur', () async {
      storage.refresh = 'r';
      refresher
        ..result = RefreshResult.ok
        // Rôle à jour : passager devenu chauffeur depuis la dernière ouverture.
        ..newAccess = fakeJwt({'sub': 'u1', 'role': 'driver', 'jti': 'j'});
      final c = makeContainer();
      await settle();
      expect(c.read(authProvider).isAuthenticated, isTrue);
      expect(c.read(authProvider).role, UserRole.driver);
      expect(c.read(authProvider).userId, 'u1');
    });

    test('hors ligne : la session locale est conservée', () async {
      storage
        ..refresh = 'r'
        ..access = fakeJwt({'sub': 'u1', 'role': 'passenger'});
      refresher.result = RefreshResult.offline;
      final c = makeContainer();
      await settle();
      expect(c.read(authProvider).isAuthenticated, isTrue);
    });

    test('refresh refusé (révoqué) : non connecté', () async {
      storage.refresh = 'r';
      refresher.result = RefreshResult.invalid;
      final c = makeContainer();
      await settle();
      expect(c.read(authProvider).isAuthenticated, isFalse);
    });
  });

  test('connexion : jetons enregistrés, état connecté', () async {
    service.next = AuthTokens(fakeJwt({'sub': 'u1', 'role': 'passenger'}), 'refresh-1');
    final c = makeContainer();
    await settle();
    await c.read(authProvider.notifier).login('lea@x.fr', 'secret123');

    expect(c.read(authProvider).isAuthenticated, isTrue);
    expect(c.read(authProvider).role, UserRole.passenger);
    expect(storage.refresh, 'refresh-1');
  });

  test('inscription : compte passager créé et connecté', () async {
    service.next = AuthTokens(fakeJwt({'sub': 'u2', 'role': 'passenger'}), 'refresh-2');
    final c = makeContainer();
    await settle();
    await c.read(authProvider.notifier).signup('new@x.fr', 'secret123');
    expect(service.calls, ['signup:new@x.fr']);
    expect(c.read(authProvider).isAuthenticated, isTrue);
  });

  test('déconnexion : session révoquée côté serveur puis effacée', () async {
    storage
      ..access = 'access-1'
      ..refresh = 'r';
    refresher.result = RefreshResult.offline;
    final c = makeContainer();
    await settle();
    await c.read(authProvider.notifier).signOut();

    expect(service.loggedOutWith, 'access-1');
    expect(storage.refresh, isNull);
    expect(c.read(authProvider).isAuthenticated, isFalse);
  });

  test('session expirée : déconnexion avec message', () async {
    final c = makeContainer();
    await settle();
    await c.read(authProvider.notifier).sessionExpired();
    expect(c.read(authProvider).notice, 'Votre session a expiré. Reconnectez-vous.');
  });

  group('rafraîchissement automatique (intercepteur dio)', () {
    /// Serveur simulé : répond selon une liste de réponses programmées.
    late _ScriptedAdapter adapter;

    Dio apiDio(ProviderContainer c) {
      final dio = c.read(dioProvider);
      dio.httpClientAdapter = adapter;
      return dio;
    }

    setUp(() => adapter = _ScriptedAdapter());

    test('401 → rotation du jeton → requête rejouée avec le nouveau jeton', () async {
      storage
        ..access = 'expired'
        ..refresh = 'r';
      refresher.result = RefreshResult.offline; // démarrage sans rotation
      final c = makeContainer();
      await settle();
      // Le jeton expire pendant l'utilisation : rotation à la volée.
      refresher
        ..result = RefreshResult.ok
        ..newAccess = 'fresh';
      adapter.responses.addAll([(401, {}), (200, {'ok': true})]);

      final res = await apiDio(c).get<Map<String, dynamic>>('/api/v1/bookings/passenger/history');

      expect(res.data, {'ok': true});
      expect(adapter.authHeaders, ['Bearer expired', 'Bearer fresh']);
      expect(refresher.calls, 2); // démarrage + rotation
    });

    test('refresh refusé : session terminée, retour à la connexion', () async {
      storage
        ..access = 'expired'
        ..refresh = 'r';
      refresher.result = RefreshResult.offline; // démarrage hors ligne
      final c = makeContainer();
      await settle();
      refresher.result = RefreshResult.invalid;
      adapter.responses.add((401, {}));

      await expectLater(apiDio(c).get<void>('/api/v1/x'), throwsA(isA<DioException>()));
      expect(c.read(authProvider).isAuthenticated, isFalse);
      expect(c.read(authProvider).notice, isNotNull);
    });

    test('une seule nouvelle tentative : pas de boucle si le serveur répond encore 401', () async {
      storage
        ..access = 'a'
        ..refresh = 'r';
      refresher
        ..result = RefreshResult.ok
        ..newAccess = 'b';
      final c = makeContainer();
      await settle();
      adapter.responses.addAll([(401, {}), (401, {})]);

      await expectLater(apiDio(c).get<void>('/api/v1/x'), throwsA(isA<DioException>()));
      expect(adapter.authHeaders, hasLength(2));
    });
  });
}

class _ScriptedAdapter implements HttpClientAdapter {
  final List<(int, Map<String, Object?>)> responses = [];
  final List<String?> authHeaders = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    authHeaders.add(options.headers['Authorization'] as String?);
    final (status, body) = responses.removeAt(0);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}
