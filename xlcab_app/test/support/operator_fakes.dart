import 'package:dio/dio.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';
import 'package:xlcab_app/services/operator_service.dart';

// Doubles de l'espace opérateur (lignes, départs, réserves, bourse) pour
// les tests widget : état en mémoire, appels enregistrés.

const porteMaillot = Place(address: 'Porte Maillot, Paris', lat: 48.8781, lng: 2.2834);
const beauvaisAirport = Place(address: 'Aéroport de Beauvais', lat: 49.4544, lng: 2.1128);

const trafic = OperatorVehicle(id: 'v1', brand: 'Renault', model: 'Trafic', plate: 'AA-111-AA', capacity: 8);

RecurringLine beauvaisLine({LineStatus status = LineStatus.active, int toConfirm = 0, bool perSeat = true}) => RecurringLine(
      id: 'l1',
      vehicleId: 'v1',
      origin: porteMaillot,
      destination: beauvaisAirport,
      departureTime: '05:00',
      daysOfWeek: const [1, 2, 3, 4, 5],
      startDate: '2026-10-12',
      seats: 8,
      luggage: 10,
      perSeat: perSeat,
      priceCents: 2500,
      status: status,
      departuresToConfirm: toConfirm,
    );

class FakeOperatorService extends OperatorService {
  FakeOperatorService() : super(Dio());

  OperatorProfile operatorProfile = const OperatorProfile(
    kind: 'independent', status: OperatorStatus.verified, perSeatAllowed: true, termsAccepted: true, termsVersion: '2026-10-09',
  );
  List<OperatorVehicle> fleet = [trafic];
  List<RecurringLine> myLines = [];
  List<LineDeparture> lineDepartures = [];
  List<LineBackup> lineBackups = [];
  List<Assignment> myAssignments = [];
  List<RescueOffer> rescueOffers = [];
  List<BackupRole> roles = [];
  List<DriverCancellation> myCancellations = [];
  Manifest? currentManifest;

  /// Erreur renvoyée par la prochaine action (puis effacée).
  ApiException? nextError;
  final List<String> calls = [];
  LineDraft? createdLine;
  Map<String, Object?>? savedProfile;

  void _act(String call) {
    calls.add(call);
    final e = nextError;
    nextError = null;
    if (e != null) throw e;
  }

  @override
  Future<OperatorProfile> profile() async => operatorProfile;

  @override
  Future<OperatorProfile> saveProfile({
    required String kind,
    String? legalName,
    String? siret,
    String? transportLicense,
    List<String> cities = const [],
    List<String> services = const [],
    String? description,
    String? acceptTermsVersion,
  }) async {
    _act('saveProfile');
    savedProfile = {
      'kind': kind, 'legalName': legalName, 'siret': siret, 'transportLicense': transportLicense, 'cities': cities,
      'services': services, 'description': description, 'acceptTermsVersion': acceptTermsVersion,
    };
    return operatorProfile;
  }

  @override
  Future<List<OperatorVehicle>> vehicles() async => fleet;

  @override
  Future<List<RecurringLine>> lines() async => myLines;

  @override
  Future<void> createLine(LineDraft draft) async {
    _act('createLine');
    createdLine = draft;
  }

  @override
  Future<void> setLineStatus(String lineId, LineStatus status) async => _act('setLineStatus:${status.name}');

  @override
  Future<void> addException(String lineId, String date, {int? seats, String? reason}) async => _act('addException:$date');

  @override
  Future<void> removeException(String lineId, String date) async => _act('removeException:$date');

  @override
  Future<List<LineDeparture>> departures({String? lineId}) async => lineDepartures;

  @override
  Future<int> confirmDepartures({required String until, String? lineId}) async {
    _act('confirmDepartures:$until');
    return 5;
  }

  @override
  Future<void> setDepartureClosed(String departureId, bool closed) async => _act('setDepartureClosed:$departureId:$closed');

  @override
  Future<List<Assignment>> assignments() async => myAssignments;

  @override
  Future<Manifest> manifest(String departureId) async => currentManifest!;

  @override
  Future<void> ready(String departureId) async => _act('ready');

  @override
  Future<String?> checkIn(String departureId, String qrCode) async {
    _act('checkIn:$qrCode');
    return 'Léa';
  }

  @override
  Future<void> startDeparture(String departureId) async => _act('startDeparture');

  @override
  Future<void> completeDeparture(String departureId) async => _act('completeDeparture');

  @override
  Future<void> cancelDeparture(String departureId, String reason) async => _act('cancelDeparture:$reason');

  @override
  Future<List<LineBackup>> backups(String lineId) async => lineBackups;

  @override
  Future<void> inviteBackup(String lineId, String email, int rank) async => _act('inviteBackup:$email:$rank');

  @override
  Future<void> removeBackup(String lineId, int rank) async => _act('removeBackup:$rank');

  @override
  Future<List<BackupRole>> backupRoles() async => roles;

  @override
  Future<void> answerBackup(String backupId, {required bool accept, String? vehicleId}) async => _act('answerBackup:$accept:$vehicleId');

  @override
  Future<List<RescueOffer>> rescues() async => rescueOffers;

  @override
  Future<void> answerRescue(String offerId, {required bool accept}) async => _act('answerRescue:$accept');

  @override
  Future<List<DriverCancellation>> cancellations() async => myCancellations;

  @override
  Future<void> justify(String cancellationId, String justification) async => _act('justify:$justification');

  @override
  Future<void> contest(String penaltyId, String reason) async => _act('contest:$reason');
}

class FakeMarketService extends MarketService {
  FakeMarketService() : super(Dio());

  List<MarketFeedItem> items = [];
  List<MarketOffer> offers = [];
  List<OfferMessage> thread = [];
  ApiException? nextError;
  final List<String> calls = [];

  void _act(String call) {
    calls.add(call);
    final e = nextError;
    nextError = null;
    if (e != null) throw e;
  }

  @override
  Future<List<MarketFeedItem>> feed() async => items;

  @override
  Future<MarketOffer?> propose(
    String requestId, {
    required String vehicleId,
    required int priceCents,
    DateTime? pickupAt,
    bool includesReturn = false,
    String? conditions,
  }) async {
    _act('propose:$requestId:$vehicleId:$priceCents:$includesReturn');
    return null;
  }

  @override
  Future<List<MarketOffer>> myOffers() async => offers;

  @override
  Future<void> withdraw(String offerId) async => _act('withdraw:$offerId');

  @override
  Future<void> confirm(String offerId) async => _act('confirm:$offerId');

  @override
  Future<void> decline(String offerId) async => _act('decline:$offerId');

  // ── Côté client ──
  List<MarketRequest> requests = [];
  List<MarketOffer> requestOffers = [];
  List<LineSearchResult> lineResults = [];
  RequestDraft? createdRequest;

  @override
  Future<String> createRequest(RequestDraft draft) async {
    _act('createRequest');
    createdRequest = draft;
    return 'r-new';
  }

  @override
  Future<List<MarketRequest>> myRequests() async => requests;

  @override
  Future<MarketRequest> request(String requestId) async => requests.firstWhere((r) => r.id == requestId);

  @override
  Future<List<MarketOffer>> offersFor(String requestId) async => requestOffers;

  @override
  Future<List<LineSearchResult>> lineMatches(String requestId) async => lineResults;

  @override
  Future<void> acceptOffer(String offerId) async => _act('acceptOffer:$offerId');

  @override
  Future<void> cancelRequest(String requestId) async => _act('cancelRequest:$requestId');

  @override
  Future<List<LineSearchResult>> searchLines({
    required Place from,
    required Place to,
    required String date,
    required int seats,
    int luggage = 0,
  }) async {
    _act('searchLines:$date:$seats');
    return lineResults;
  }

  @override
  Future<String> bookLine(String departureId, {required int seats, int childSeats = 0, int luggage = 0, String? notes}) async {
    _act('bookLine:$departureId:$seats:$childSeats:$luggage');
    return 'trip-1';
  }

  @override
  Future<List<OfferMessage>> messages(String offerId) async => thread;

  @override
  Future<void> sendMessage(String offerId, String body) async {
    _act('sendMessage:$body');
    thread = [...thread, OfferMessage(id: 'm${thread.length}', mine: true, body: body, createdAt: DateTime(2026, 10, 10, 9))];
  }
}
