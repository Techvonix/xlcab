import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/driver_mode.dart';
import 'api_service.dart';
import 'token_storage.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Événements reçus par le chauffeur (salle driver:{id}, Partie 7 écran 15).
sealed class DriverEvent {
  const DriverEvent();
}

class OfferReceived extends DriverEvent {
  const OfferReceived(this.offer);
  final MissionOffer offer;
}

/// Les 30 s sont écoulées : le serveur a passé la course au suivant.
class OfferExpired extends DriverEvent {
  const OfferExpired(this.tripId);
  final String tripId;
}

/// Statut d'une course suivie (ex. annulée par le passager).
class MissionStatusChanged extends DriverEvent {
  const MissionStatusChanged(this.tripId, this.status);
  final String tripId;
  final String status;
}

class DriverConnection extends DriverEvent {
  const DriverConnection(this.connected);
  final bool connected;
}

/// Canal temps réel du chauffeur. Interface : remplacée dans les tests.
abstract class DriverChannel {
  Stream<DriverEvent> get events;
  bool get isConnected;

  void connect();

  /// Position (Partie 7 : toutes les 10 s sans course, 3 s en course).
  void sendLocation({required double lat, required double lng, double? heading, double? speed});

  /// Suivi des changements de statut des courses attribuées.
  void watchTrips(Iterable<String> tripIds);

  void dispose();
}

/// Implémentation Socket.io — serveur : xlcab_backend/src/tracking.
class SocketIoDriverChannel implements DriverChannel {
  SocketIoDriverChannel({required String baseUrl, required TokenStorage tokens})
      : _socket = io.io(
          baseUrl,
          io.OptionBuilder()
              .setPath('/ws/tracking')
              .setTransports(['websocket'])
              .disableAutoConnect()
              .enableForceNew()
              // Jeton relu à chaque (re)connexion (expiration à 15 min).
              .setAuthFn((send) async => send({'token': await tokens.readAccessToken() ?? '', 'locale': l10n.localeName}))
              .enableReconnection()
              .setReconnectionDelay(1000)
              .setReconnectionDelayMax(10000)
              .build(),
        );

  final io.Socket _socket;
  final _events = StreamController<DriverEvent>.broadcast();
  final Set<String> _watched = {};
  Timer? _manualReconnect;
  bool _disposed = false;
  bool _started = false;

  void _emit(DriverEvent e) {
    if (!_disposed) _events.add(e);
  }

  @override
  Stream<DriverEvent> get events => _events.stream;

  @override
  bool get isConnected => _socket.connected;

  @override
  void connect() {
    if (_started) return;
    _started = true;
    _socket.onConnect((_) {
      _emit(const DriverConnection(true));
      // Les abonnements ne survivent pas à une reconnexion.
      for (final id in _watched) {
        _socket.emit('subscribe:trip', {'tripId': id});
      }
    });
    _socket.onDisconnect((reason) {
      _emit(const DriverConnection(false));
      // Coupure décidée par le serveur (jeton expiré) : pas de reconnexion
      // automatique côté Socket.io, on relance avec le jeton rafraîchi.
      if (reason == 'io server disconnect' && !_disposed) {
        _manualReconnect?.cancel();
        _manualReconnect = Timer(const Duration(seconds: 2), () {
          if (!_disposed) _socket.connect();
        });
      }
    });
    _socket.onConnectError((_) => _emit(const DriverConnection(false)));
    _socket.on('mission:offer', (data) {
      final offer = MissionOffer.fromJson(data);
      if (offer != null) _emit(OfferReceived(offer));
    });
    _socket.on('mission:expired', (data) {
      if (data is Map && data['tripId'] is String) _emit(OfferExpired(data['tripId'] as String));
    });
    _socket.on('status', (data) {
      if (data is Map && data['tripId'] is String && data['status'] is String) {
        _emit(MissionStatusChanged(data['tripId'] as String, data['status'] as String));
      }
    });
    _socket.connect();
  }

  @override
  void sendLocation({required double lat, required double lng, double? heading, double? speed}) {
    if (!_socket.connected) return; // pas de file d'attente : une position périmée n'a pas d'intérêt
    _socket.emit('driver:location', {
      'lat': lat,
      'lng': lng,
      if (heading != null && heading >= 0) 'heading': heading,
      if (speed != null && speed >= 0) 'speed': speed,
    });
  }

  @override
  void watchTrips(Iterable<String> tripIds) {
    final next = tripIds.toSet();
    for (final id in _watched.difference(next)) {
      if (_socket.connected) _socket.emit('unsubscribe:trip', {'tripId': id});
    }
    for (final id in next.difference(_watched)) {
      if (_socket.connected) _socket.emit('subscribe:trip', {'tripId': id});
    }
    _watched
      ..clear()
      ..addAll(next);
  }

  @override
  void dispose() {
    _disposed = true;
    _manualReconnect?.cancel();
    _socket.dispose();
    _events.close();
  }
}

final driverChannelFactoryProvider = Provider<DriverChannel Function()>((ref) {
  final tokens = ref.watch(tokenStorageProvider);
  return () => SocketIoDriverChannel(baseUrl: apiBaseUrl, tokens: tokens);
});
