import 'package:dio/dio.dart';
import 'package:xlcab_core/models/market.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/market_service.dart';

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
  Future<OfferChoice> acceptOffer(String offerId) async {
    _act('acceptOffer:$offerId');
    return OfferChoice(payment: choicePayment);
  }

  @override
  Future<void> authorizeOffer(String offerId) async {
    if (authorizeError != null) throw authorizeError!;
    _act('authorizeOffer:$offerId');
  }

  /// Refus du serveur à la validation de l'empreinte (proposition expirée…).
  ApiException? authorizeError;

  /// Paiement en ligne activé : feuille de paiement renvoyée au choix d'une proposition / à la réservation.
  PaymentSheetParams? choicePayment;
  PaymentSheetParams? bookingPayment;

  @override
  Future<void> cancelRequest(String requestId) async => _act('cancelRequest:$requestId');

  @override
  Future<List<LineSearchResult>> searchLines({
    required Place from,
    required Place to,
    required String date,
    required int seats,
    int luggage = 0,
    bool parcels = false,
  }) async {
    _act('searchLines:$date:$seats');
    return lineResults;
  }

  @override
  Future<LineBooking> bookLine(
    String departureId, {
    required int seats,
    int childSeats = 0,
    int luggage = 0,
    String? notes,
    List<int>? seatNumbers,
    String? boardStopId,
    String? alightStopId,
  }) async {
    _act('bookLine:$departureId:$seats:$childSeats:$luggage');
    bookedSeatNumbers = seatNumbers;
    bookedStops = (boardStopId, alightStopId);
    return LineBooking(tripId: 'trip-1', payment: bookingPayment);
  }

  /// Sièges demandés à la dernière réservation (null = attribution automatique).
  List<int>? bookedSeatNumbers;
  @override
  Future<LineParcelBooking> bookLineParcel(LineSearchResult departure, ParcelRequest parcel) async {
    _act('bookLineParcel:${departure.departureId}');
    lastLineParcel = parcel;
    return const LineParcelBooking(parcelId: 'parcel-line-1', tripId: 'trip-parcel-line');
  }

  ParcelRequest? lastLineParcel;

  /// Arrêts de montée / descente demandés à la dernière réservation.
  (String?, String?)? bookedStops;
  SeatMap seats = const SeatMap(seatsTotal: 8, taken: {2, 5}, choosable: true);

  @override
  Future<SeatMap> seatMap(String departureId, {String? boardStopId, String? alightStopId}) async {
    seatMapCalls.add((departureId, boardStopId, alightStopId));
    return seats;
  }

  /// Plans demandés : (départ, montée, descente).
  final List<(String, String?, String?)> seatMapCalls = [];

  @override
  Future<List<OfferMessage>> messages(String offerId) async => thread;

  @override
  Future<void> sendMessage(String offerId, String body) async {
    _act('sendMessage:$body');
    thread = [...thread, OfferMessage(id: 'm${thread.length}', mine: true, body: body, createdAt: DateTime(2026, 10, 10, 9))];
  }
}
