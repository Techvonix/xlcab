import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import 'notifications_service.dart';

/// Notifications push (Firebase Cloud Messaging).
///
/// Firebase est initialisé à partir des paramètres de compilation (`--dart-define`
/// FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_SENDER_ID, FIREBASE_PROJECT_ID), sans fichier
/// `google-services.json` : tant que le projet Firebase n'existe pas, l'appli tourne
/// simplement sans push (la boîte de réception reste disponible).

/// Source des jetons et des messages push (Firebase en vrai, double dans les tests).
abstract class PushSource {
  String get platform;
  Future<bool> requestPermission();
  Future<String?> token();
  Stream<String> get onTokenRefresh;
  /// Notification reçue appli ouverte.
  Stream<Map<String, String>> get onForegroundMessage;
  /// Notification touchée alors que l'appli était en arrière-plan.
  Stream<Map<String, String>> get onOpened;
  /// Notification touchée qui a lancé l'appli.
  Future<Map<String, String>?> initialOpen();
}

class FirebasePushSource implements PushSource {
  final _messaging = FirebaseMessaging.instance;

  @override
  String get platform => Platform.isIOS ? 'ios' : 'android';

  @override
  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() => _messaging.getToken();

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<Map<String, String>> get onForegroundMessage => FirebaseMessaging.onMessage.map(_data);

  @override
  Stream<Map<String, String>> get onOpened => FirebaseMessaging.onMessageOpenedApp.map(_data);

  @override
  Future<Map<String, String>?> initialOpen() async {
    final message = await _messaging.getInitialMessage();
    return message == null ? null : _data(message);
  }

  static Map<String, String> _data(RemoteMessage m) => {for (final e in m.data.entries) e.key: '${e.value}'};
}

/// Source push de l'appli : renseignée par [initPush] au démarrage, null sans Firebase.
PushSource? _configuredSource;

/// À appeler dans `main()` avant `runApp` : initialise Firebase si l'appli a été compilée
/// avec ses paramètres. Ne lève jamais (sans Firebase, pas de push).
Future<void> initPush() async {
  const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  const appId = String.fromEnvironment('FIREBASE_APP_ID');
  const senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  if (apiKey.isEmpty || appId.isEmpty || senderId.isEmpty || projectId.isEmpty) return;
  try {
    await Firebase.initializeApp(
      options: const FirebaseOptions(apiKey: apiKey, appId: appId, messagingSenderId: senderId, projectId: projectId),
    );
    _configuredSource = FirebasePushSource();
  } catch (e) {
    debugPrint('Notifications push indisponibles : $e');
  }
}

final pushSourceProvider = Provider<PushSource?>((ref) => _configuredSource);

/// Branche les notifications push pour le compte connecté : enregistre ce téléphone auprès
/// du serveur, le retire avant la déconnexion, recharge la boîte de réception à chaque
/// notification reçue et ouvre l'écran voulu quand on en touche une.
class PushController {
  PushController(this._ref);

  final Ref _ref;
  final List<StreamSubscription<Object?>> _subs = [];
  String? _token;
  bool _hooked = false;

  /// [app] : `passenger` ou `driver` ; [onOpen] : ouvre l'écran correspondant aux données.
  Future<void> start({required String app, required void Function(Map<String, String> data) onOpen}) async {
    final source = _ref.read(pushSourceProvider);
    if (source == null) return;
    await stop();
    final api = _ref.read(notificationsServiceProvider);
    Future<void> register(String token) async {
      _token = token;
      try {
        await api.registerDevice(token: token, platform: source.platform, app: app);
      } catch (_) {
        // Serveur injoignable : nouvel essai au prochain démarrage.
      }
    }

    if (!_hooked) {
      _hooked = true;
      _ref.read(authProvider.notifier).addBeforeSignOut(() async {
        final token = _token;
        await stop();
        if (token != null) await api.removeDevice(token);
      });
    }
    if (!await source.requestPermission()) return;
    final token = await source.token();
    if (token != null) await register(token);
    _subs
      ..add(source.onTokenRefresh.listen(register))
      ..add(source.onForegroundMessage.listen((_) => _ref.invalidate(inboxProvider)))
      ..add(source.onOpened.listen(onOpen));
    final initial = await source.initialOpen();
    if (initial != null) onOpen(initial);
  }

  Future<void> stop() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
  }
}

final pushControllerProvider = Provider<PushController>((ref) => PushController(ref));
