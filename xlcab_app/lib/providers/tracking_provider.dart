import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/tracking.dart';
import '../models/trip.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/tracking_channel.dart';
import '../services/trip_service.dart';

/// Intervalle du mode dégradé (Partie 7 : "fallback polling 10s").
final trackingPollIntervalProvider = Provider<Duration>((ref) => const Duration(seconds: 10));

enum TrackingConnection {
  /// Première connexion en cours.
  connecting,

  /// WebSocket ouvert : positions en temps réel.
  live,

  /// WebSocket coupé : rafraîchissement toutes les 10 s.
  polling,
}

@immutable
class TrackingState {
  const TrackingState({
    this.snapshot,
    this.position,
    this.status = TripStatus.unknown,
    this.connection = TrackingConnection.connecting,
    this.messages = const [],
    this.loadError,
  });

  final TrackingSnapshot? snapshot;
  final LivePosition? position;
  final TripStatus status;
  final TrackingConnection connection;
  final List<ChatMessage> messages;

  /// Échec du chargement initial (trajet introuvable, réseau…).
  final String? loadError;

  bool get isLoading => snapshot == null && loadError == null;

  TrackingState copyWith({
    TrackingSnapshot? snapshot,
    LivePosition? position,
    TripStatus? status,
    TrackingConnection? connection,
    List<ChatMessage>? messages,
    String? loadError,
  }) {
    return TrackingState(
      snapshot: snapshot ?? this.snapshot,
      position: position ?? this.position,
      status: status ?? this.status,
      connection: connection ?? this.connection,
      messages: messages ?? this.messages,
      loadError: loadError ?? this.loadError,
    );
  }
}

/// Résultat d'une alerte SOS, pour l'interface.
enum SosResult { sent, failed }

class TrackingController extends AutoDisposeFamilyNotifier<TrackingState, String> {
  TrackingChannel? _channel;
  StreamSubscription<TrackingEvent>? _events;
  Timer? _pollTimer;

  /// L'écran a été quitté : plus aucune mise à jour ni connexion.
  bool _disposed = false;

  String get _tripId => arg;

  @override
  TrackingState build(String tripId) {
    ref.onDispose(() {
      _disposed = true;
      _pollTimer?.cancel();
      _events?.cancel();
      _channel?.dispose();
    });
    // Démarrage après la construction de l'état initial.
    Future.microtask(_start);
    return const TrackingState();
  }

  Future<void> _start() async {
    if (_disposed) return;
    final trips = ref.read(tripServiceProvider);
    final channelFactory = ref.read(trackingChannelFactoryProvider);
    try {
      final snapshot = await trips.tracking(_tripId);
      if (_disposed) return;
      state = state.copyWith(
        snapshot: snapshot,
        status: snapshot.status,
        position: snapshot.lastPosition,
      );
    } on ApiException catch (e) {
      if (!_disposed) state = state.copyWith(loadError: e.message);
      return;
    }

    final channel = channelFactory();
    _channel = channel;
    _events = channel.events.listen(_onEvent);
    channel.start(_tripId);
    // Tant que le temps réel n'est pas établi, le polling prend le relais.
    _startPolling();
  }

  void _onEvent(TrackingEvent event) {
    switch (event) {
      case PositionEvent(:final position):
        state = state.copyWith(position: position);
      case StatusEvent(:final status):
        state = state.copyWith(status: status);
      case MessageEvent(:final message):
        state = state.copyWith(messages: [...state.messages, message]);
      case ConnectionEvent(:final connected):
        if (connected) {
          _pollTimer?.cancel();
          _pollTimer = null;
          state = state.copyWith(connection: TrackingConnection.live);
        } else {
          state = state.copyWith(connection: TrackingConnection.polling);
          _startPolling();
        }
    }
  }

  void _startPolling() {
    if (_pollTimer != null) return;
    _pollTimer = Timer.periodic(ref.read(trackingPollIntervalProvider), (_) => _poll());
  }

  Future<void> _poll() async {
    try {
      final snapshot = await ref.read(tripServiceProvider).tracking(_tripId);
      // Écran quitté, ou temps réel revenu pendant la requête (prioritaire).
      if (_disposed || state.connection == TrackingConnection.live) return;
      state = state.copyWith(
        snapshot: snapshot,
        status: snapshot.status,
        position: snapshot.lastPosition,
      );
    } on ApiException {
      // Réseau toujours coupé : on réessaiera au prochain tick.
    }
  }

  void sendMessage(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    _channel?.sendMessage(_tripId, trimmed.length > 500 ? trimmed.substring(0, 500) : trimmed);
  }

  /// Alerte SOS : position de l'appareil si disponible, sinon dernière
  /// position du véhicule (le passager est à bord), sinon le départ.
  Future<SosResult> sendSos() async {
    final channel = _channel;
    if (channel == null) return SosResult.failed;

    final device = await ref.read(locationServiceProvider).currentPosition();
    final fallback = state.position ?? state.snapshot?.lastPosition;
    final origin = state.snapshot?.origin;
    final lat = device?.lat ?? fallback?.lat ?? origin?.lat;
    final lng = device?.lng ?? fallback?.lng ?? origin?.lng;
    if (lat == null || lng == null) return SosResult.failed;

    final ok = await channel.sendSos(tripId: _tripId, lat: lat, lng: lng);
    return ok ? SosResult.sent : SosResult.failed;
  }
}

final trackingControllerProvider =
    NotifierProvider.autoDispose.family<TrackingController, TrackingState, String>(TrackingController.new);
