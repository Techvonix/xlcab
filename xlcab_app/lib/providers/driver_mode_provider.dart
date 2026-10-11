import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/driver_mode.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../services/driver_channel.dart';
import '../services/driver_device.dart';
import '../services/document_picker.dart';
import '../services/driver_mode_service.dart';
import '../services/parcel_service.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Partie 7 (écran 15) : position toutes les 10 s sans course, 3 s en course.
const idleLocationInterval = Duration(seconds: 10);
const tripLocationInterval = Duration(seconds: 3);

/// Message ponctuel à afficher (snackbar). [id] distingue deux messages identiques.
class DriverNotice {
  const DriverNotice(this.id, this.message);
  final int id;
  final String message;
}

class DriverModeState {
  const DriverModeState({
    this.loading = true,
    this.loadError,
    this.approved = false,
    this.online = false,
    this.toggling = false,
    this.connected = false,
    this.offer,
    this.answering = false,
    this.missions = const MissionList(upcoming: [], recent: []),
    this.earnings,
    this.rating,
    this.totalTrips = 0,
    this.notice,
  });

  final bool loading;
  final String? loadError;
  final bool approved;
  final bool online;

  /// Passage en ligne / hors ligne en cours (bouton désactivé).
  final bool toggling;

  /// WebSocket connecté : sans lui, aucune mission ne peut arriver.
  final bool connected;
  final MissionOffer? offer;

  /// Réponse à l'offre en cours d'envoi (boutons désactivés).
  final bool answering;
  final MissionList missions;
  final Earnings? earnings;
  final double? rating;
  final int totalTrips;
  final DriverNotice? notice;

  DriverModeState copyWith({
    bool? loading,
    String? loadError,
    bool clearLoadError = false,
    bool? approved,
    bool? online,
    bool? toggling,
    bool? connected,
    MissionOffer? offer,
    bool clearOffer = false,
    bool? answering,
    MissionList? missions,
    Earnings? earnings,
    double? rating,
    int? totalTrips,
    DriverNotice? notice,
  }) =>
      DriverModeState(
        loading: loading ?? this.loading,
        loadError: clearLoadError ? null : loadError ?? this.loadError,
        approved: approved ?? this.approved,
        online: online ?? this.online,
        toggling: toggling ?? this.toggling,
        connected: connected ?? this.connected,
        offer: clearOffer ? null : offer ?? this.offer,
        answering: answering ?? this.answering,
        missions: missions ?? this.missions,
        earnings: earnings ?? this.earnings,
        rating: rating ?? this.rating,
        totalTrips: totalTrips ?? this.totalTrips,
        notice: notice ?? this.notice,
      );
}

class DriverModeController extends StateNotifier<DriverModeState> {
  DriverModeController(this._service, this._channelFactory, this._positions, [this._parcels]) : super(const DriverModeState()) {
    load();
  }

  final DriverModeService _service;
  final DriverChannel Function() _channelFactory;
  final PositionSource _positions;

  /// Colis (checklist) : absent dans les tests qui ne les concernent pas.
  final ParcelService? _parcels;

  DriverChannel? _channel;
  StreamSubscription<DriverEvent>? _eventsSub;
  StreamSubscription<DevicePosition>? _gpsSub;
  Timer? _sendTimer;
  Duration? _sendInterval;
  Timer? _offerExpiry;
  DevicePosition? _lastPosition;
  int _noticeSeq = 0;

  void _notify(String message) {
    if (mounted) state = state.copyWith(notice: DriverNotice(++_noticeSeq, message));
  }

  String _message(Object e) => e is ApiException ? e.message : l10n.serviceMomentanementIndisponibleReessayezPlus;

  // ── Chargement ──────────────────────────────────────────────────────

  /// Au lancement, et au retour au premier plan : l'offre éventuellement
  /// reçue pendant que l'app était en arrière-plan est récupérée.
  Future<void> load() async {
    try {
      final status = await _service.status();
      if (!mounted) return;
      state = state.copyWith(
        loading: false,
        clearLoadError: true,
        approved: status.approved,
        online: status.online,
        rating: status.rating,
        totalTrips: status.totalTrips,
      );
      if (status.offer != null) _showOffer(status.offer!);
      // En ligne côté serveur (app relancée) : on reprend la session.
      if (status.online && _channel == null) await _startSession();
      await refresh();
    } catch (e) {
      if (mounted) state = state.copyWith(loading: false, loadError: _message(e));
    }
  }

  Future<void> refresh() async {
    try {
      final results = await Future.wait([_service.missions(), _service.earnings()]);
      if (!mounted) return;
      state = state.copyWith(missions: results[0] as MissionList, earnings: results[1] as Earnings);
      _channel?.watchTrips(state.missions.upcoming.map((m) => m.id));
      _updateSendInterval();
    } catch (_) {
      // Liste conservée : une erreur ponctuelle ne vide pas l'écran.
    }
  }

  // ── En ligne / hors ligne ───────────────────────────────────────────

  Future<void> setOnline(bool online) async {
    if (state.toggling || online == state.online) return;
    state = state.copyWith(toggling: true);
    try {
      if (online) {
        // Sans GPS, aucune mission ne peut être proposée : on bloque avant
        // de se déclarer disponible.
        final access = await _positions.ensureAccess();
        if (access != LocationAccess.granted) {
          _notify(access == LocationAccess.serviceDisabled
              ? l10n.activezLaLocalisationDuTelephone
              : l10n.autorisezLAccesAVotre);
          return;
        }
        await _service.setOnline(true);
        if (!mounted) return;
        state = state.copyWith(online: true);
        await _startSession();
      } else {
        await _service.setOnline(false);
        if (!mounted) return;
        _stopSession();
        state = state.copyWith(online: false, clearOffer: true, connected: false);
      }
    } catch (e) {
      _notify(_message(e));
    } finally {
      if (mounted) state = state.copyWith(toggling: false);
    }
  }

  Future<void> _startSession() async {
    final channel = _channelFactory();
    _channel = channel;
    _eventsSub = channel.events.listen(_onEvent);
    channel.connect();
    channel.watchTrips(state.missions.upcoming.map((m) => m.id));
    _gpsSub = _positions.watch().listen((p) {
      final first = _lastPosition == null;
      _lastPosition = p;
      if (first) _sendPosition(); // tout de suite : le chauffeur devient sollicitable sans attendre 10 s
    });
    _updateSendInterval();
  }

  void _stopSession() {
    _sendTimer?.cancel();
    _sendTimer = null;
    _sendInterval = null;
    _offerExpiry?.cancel();
    _gpsSub?.cancel();
    _gpsSub = null;
    _eventsSub?.cancel();
    _eventsSub = null;
    _channel?.dispose();
    _channel = null;
    _lastPosition = null;
  }

  void _updateSendInterval() {
    if (_channel == null) return;
    final interval = state.missions.current?.status == TripStatus.started ? tripLocationInterval : idleLocationInterval;
    if (interval == _sendInterval) return;
    _sendInterval = interval;
    _sendTimer?.cancel();
    _sendTimer = Timer.periodic(interval, (_) => _sendPosition());
  }

  void _sendPosition() {
    final p = _lastPosition;
    if (p == null) return;
    _channel?.sendLocation(lat: p.lat, lng: p.lng, heading: p.heading, speed: p.speedKmh);
  }

  // ── Événements temps réel ───────────────────────────────────────────

  void _onEvent(DriverEvent e) {
    switch (e) {
      case OfferReceived(:final offer):
        _showOffer(offer);
      case OfferExpired(:final tripId):
        if (state.offer?.tripId == tripId) {
          _offerExpiry?.cancel();
          state = state.copyWith(clearOffer: true);
          _notify(l10n.offreExpireeLaCourseA);
        }
      case MissionStatusChanged(:final status):
        if (status == TripStatus.cancelled.apiValue) _notify(l10n.uneDeVosCoursesA);
        refresh();
      case DriverConnection(:final connected):
        state = state.copyWith(connected: connected);
        if (connected) _sendPosition();
    }
  }

  void _showOffer(MissionOffer offer) {
    final left = offer.remaining();
    if (left == Duration.zero) return;
    _offerExpiry?.cancel();
    state = state.copyWith(offer: offer, answering: false);
    // Filet local : l'offre disparaît à l'échéance même si l'événement
    // "mission:expired" se perd (réseau).
    _offerExpiry = Timer(left, () {
      if (mounted && state.offer?.tripId == offer.tripId) state = state.copyWith(clearOffer: true);
    });
  }

  // ── Réponse à une offre ─────────────────────────────────────────────

  Future<void> acceptOffer() async {
    final offer = state.offer;
    if (offer == null || state.answering) return;
    state = state.copyWith(answering: true);
    try {
      await _service.accept(offer.tripId);
      _notify(l10n.missionAcceptee);
    } catch (e) {
      _notify(_message(e)); // ex. "Offre expirée ou inexistante", "déjà une course sur ce créneau"
    } finally {
      _offerExpiry?.cancel();
      if (mounted) state = state.copyWith(clearOffer: true, answering: false);
    }
    await refresh();
  }

  Future<void> refuseOffer() async {
    final offer = state.offer;
    if (offer == null || state.answering) return;
    state = state.copyWith(answering: true);
    try {
      await _service.refuse(offer.tripId);
    } catch (_) {
      // Offre déjà expirée côté serveur : le résultat est le même.
    } finally {
      _offerExpiry?.cancel();
      if (mounted) state = state.copyWith(clearOffer: true, answering: false);
    }
  }

  // ── Missions ────────────────────────────────────────────────────────

  /// true si l'action a réussi.
  Future<bool> _missionAction(Future<void> Function() call, String success) async {
    try {
      await call();
      _notify(success);
      await refresh();
      return true;
    } catch (e) {
      _notify(_message(e));
      return false;
    }
  }

  Future<bool> startMission(Mission m, {String? qrCode}) => _missionAction(
        () => _service.start(m.id, qrCode: qrCode),
        qrCode == null ? l10n.courseDemarree : l10n.passagerEmbarqueCourseDemarree,
      );

  Future<bool> completeMission(Mission m) => _missionAction(() => _service.complete(m.id), l10n.courseTermineeMerci);

  Future<bool> withdraw(Mission m, String reason) =>
      _missionAction(() => _service.withdraw(m.id, reason), l10n.desistementEnregistreLaCourseEst);

  // ── Colis (checklist, écran 15) ─────────────────────────────────────

  Future<bool> pickupParcel(ParcelTask p, String qrCode) =>
      _missionAction(() => _parcels!.pickup(p.id, qrCode), l10n.colisABord);

  Future<bool> deliverParcel(ParcelTask p, String code, PickedDocument photo) =>
      _missionAction(() => _parcels!.deliver(p.id, code, photo), l10n.colisRemisMerci);

  Future<bool> failParcel(ParcelTask p, String reason) =>
      _missionAction(() => _parcels!.fail(p.id, reason), l10n.problemeSignaleALEquipe);

  /// Navette colis dédiée : scan du colis puis démarrage (le serveur exige l'ordre).
  Future<bool> pickupAndStart(Mission m, String qrCode) async {
    final parcel = m.parcels.isEmpty ? null : m.parcels.first;
    if (parcel == null) return false;
    if (parcel.toPickUp && !await _missionAction(() => _parcels!.pickup(parcel.id, qrCode), l10n.colisABord)) return false;
    return startMission(m);
  }

  @override
  void dispose() {
    _stopSession();
    super.dispose();
  }
}

/// Recréé à chaque changement de compte (déconnexion : session GPS arrêtée).
final driverModeProvider = StateNotifierProvider<DriverModeController, DriverModeState>((ref) {
  ref.watch(authProvider.select((a) => a.userId));
  return DriverModeController(
    ref.watch(driverModeServiceProvider),
    ref.watch(driverChannelFactoryProvider),
    ref.watch(positionSourceProvider),
    ref.watch(parcelServiceProvider),
  );
});
