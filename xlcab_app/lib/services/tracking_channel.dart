import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/tracking.dart';
import '../models/trip.dart';
import 'api_service.dart';
import 'token_storage.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Événements du canal de suivi (contrat WebSocket de la Partie 6).
sealed class TrackingEvent {
  const TrackingEvent();
}

class PositionEvent extends TrackingEvent {
  const PositionEvent(this.position);
  final LivePosition position;
}

class StatusEvent extends TrackingEvent {
  const StatusEvent(this.status);
  final TripStatus status;
}

class MessageEvent extends TrackingEvent {
  const MessageEvent(this.message);
  final ChatMessage message;
}

/// Connexion temps réel établie (true) ou perdue (false).
class ConnectionEvent extends TrackingEvent {
  const ConnectionEvent(this.connected);
  final bool connected;
}

/// Canal temps réel d'une course. Interface pour que les tests puissent
/// le remplacer sans serveur.
abstract class TrackingChannel {
  Stream<TrackingEvent> get events;

  /// Ouvre la connexion et s'abonne à la course (réabonnement automatique
  /// à chaque reconnexion).
  void start(String tripId);

  void sendMessage(String tripId, String text);

  /// true si le serveur a accusé réception de l'alerte.
  Future<bool> sendSos({required String tripId, required double lat, required double lng});

  void dispose();
}

/// Implémentation Socket.io — serveur : xlcab_backend/src/tracking.
class SocketIoTrackingChannel implements TrackingChannel {
  SocketIoTrackingChannel({required String baseUrl, required TokenStorage tokens})
      : _socket = io.io(
          baseUrl,
          io.OptionBuilder()
              .setPath('/ws/tracking')
              .setTransports(['websocket'])
              .disableAutoConnect()
              .enableForceNew()
              // Jeton relu à CHAQUE (re)connexion : après expiration
              // (15 min), c'est le jeton rafraîchi qui est présenté.
              .setAuthFn((send) async => send({'token': await tokens.readAccessToken() ?? '', 'locale': l10n.localeName}))
              .enableReconnection()
              .setReconnectionDelay(1000)
              .setReconnectionDelayMax(10000)
              .build(),
        );

  final io.Socket _socket;
  final _events = StreamController<TrackingEvent>.broadcast();
  Timer? _manualReconnect;
  bool _disposed = false;

  @override
  Stream<TrackingEvent> get events => _events.stream;

  void _emit(TrackingEvent e) {
    if (!_disposed) _events.add(e);
  }

  @override
  void start(String tripId) {
    _socket.onConnect((_) {
      _emit(const ConnectionEvent(true));
      // Les abonnements ne survivent pas à une reconnexion côté serveur.
      _socket.emit('subscribe:trip', {'tripId': tripId});
    });
    _socket.onDisconnect((reason) {
      _emit(const ConnectionEvent(false));
      // Déconnexion décidée par le serveur (ex. jeton expiré) : Socket.io
      // ne se reconnecte pas seul dans ce cas. On retente après un court
      // délai, avec le jeton relu par setAuthFn.
      if (reason == 'io server disconnect' && !_disposed) {
        _manualReconnect?.cancel();
        _manualReconnect = Timer(const Duration(seconds: 2), () {
          if (!_disposed) _socket.connect();
        });
      }
    });
    _socket.onConnectError((_) => _emit(const ConnectionEvent(false)));

    _socket.on('position', (data) {
      final p = LivePosition.fromSocket(data);
      if (p != null) _emit(PositionEvent(p));
    });
    _socket.on('status', (data) {
      if (data is Map && data['status'] is String) {
        _emit(StatusEvent(TripStatus.fromApi(data['status'] as String)));
      }
    });
    _socket.on('message', (data) {
      final m = ChatMessage.fromSocket(data);
      if (m != null) _emit(MessageEvent(m));
    });
    _socket.connect();
  }

  @override
  void sendMessage(String tripId, String text) {
    _socket.emit('message', {'tripId': tripId, 'text': text});
  }

  @override
  Future<bool> sendSos({required String tripId, required double lat, required double lng}) {
    if (!_socket.connected) return Future.value(false);
    final done = Completer<bool>();
    _socket.emitWithAck('sos', {'tripId': tripId, 'lat': lat, 'lng': lng}, ack: (data) {
      if (!done.isCompleted) done.complete(data is Map && data['received'] == true);
    });
    // Sans accusé de réception sous 5 s, l'alerte est considérée perdue :
    // l'interface propose alors d'appeler le 112.
    return done.future.timeout(const Duration(seconds: 5), onTimeout: () => false);
  }

  @override
  void dispose() {
    _disposed = true;
    _manualReconnect?.cancel();
    _socket.dispose();
    _events.close();
  }
}

/// Fabrique un canal par écran de suivi (injectable pour les tests).
final trackingChannelFactoryProvider = Provider<TrackingChannel Function()>((ref) {
  final tokens = ref.watch(tokenStorageProvider);
  return () => SocketIoTrackingChannel(baseUrl: apiBaseUrl, tokens: tokens);
});
