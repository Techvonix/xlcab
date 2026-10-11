import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:xlcab_app/models/place.dart';
import 'package:xlcab_app/models/quote.dart';
import 'package:xlcab_app/models/shuttle.dart';
import 'package:xlcab_app/models/tracking.dart';
import 'package:xlcab_app/models/trip.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/models/driver_application.dart';
import 'package:xlcab_app/models/account.dart';
import 'package:xlcab_app/models/driver_mode.dart';
import 'package:xlcab_app/models/parcel.dart';
import 'package:xlcab_app/services/parcel_service.dart';
import 'package:xlcab_app/services/account_service.dart';
import 'package:xlcab_app/services/driver_channel.dart';
import 'package:xlcab_app/services/driver_device.dart';
import 'package:xlcab_app/services/driver_mode_service.dart';
import 'package:xlcab_app/models/payment.dart';
import 'package:xlcab_app/models/trip_detail.dart';
import 'package:xlcab_app/services/payment_service.dart';
import 'package:xlcab_app/services/booking_service.dart';
import 'package:xlcab_app/services/document_picker.dart';
import 'package:xlcab_app/services/driver_service.dart';
import 'package:xlcab_app/services/location_service.dart';
import 'package:xlcab_app/services/places_service.dart';
import 'package:xlcab_app/services/tracking_channel.dart';
import 'package:xlcab_app/services/trip_service.dart';

// Doubles de test partagés : aucun appel réseau réel.

const paris = Place(address: 'Gare de Lyon, 75012 Paris, France', lat: 48.8443, lng: 2.3744, placeId: 'p-paris');
const rouen = Place(address: 'Gare de Rouen-Rive-Droite, Rouen, France', lat: 49.4488, lng: 1.0942, placeId: 'p-rouen');

/// 135,4 km en Navette Bleue : 12 186 c, TVA 0 %.
const baseQuote = PassengerQuote(
  distanceKm: 135.4,
  durationMin: 97,
  priceCents: 12186,
  vatCents: 0,
  totalCents: 12186,
  currency: 'EUR',
  vatLines: [VatLine(regime: 'passenger', baseCents: 12186, ratePercent: 0, vatCents: 0)],
);

/// Même trajet + colis : 800 c à 20 % → 160 c de TVA.
const parcelQuote = PassengerQuote(
  distanceKm: 135.4,
  durationMin: 97,
  priceCents: 12986,
  vatCents: 160,
  totalCents: 13146,
  currency: 'EUR',
  vatLines: [
    VatLine(regime: 'passenger', baseCents: 12186, ratePercent: 0, vatCents: 0),
    VatLine(regime: 'parcel', baseCents: 800, ratePercent: 20, vatCents: 160),
  ],
);

class FakeBookingService extends BookingService {
  FakeBookingService() : super(Dio());

  final List<PassengerQuoteRequest> quoteRequests = [];

  /// Erreur à renvoyer au lieu d'un devis (ex. règle des 60 km).
  ApiException? quoteError;

  @override
  Future<PassengerQuote> quotePassenger(PassengerQuoteRequest request, {CancelToken? cancelToken}) async {
    quoteRequests.add(request);
    if (quoteError != null) throw quoteError!;
    return request.withParcel ? parcelQuote : baseQuote;
  }
}

class FakePlacesService extends PlacesService {
  FakePlacesService() : super(Dio(), 'test-key', 'fr');

  final List<String> queries = [];

  @override
  Future<List<PlaceSuggestion>> autocomplete(String input, {required String sessionToken, CancelToken? cancelToken}) async {
    queries.add(input);
    return const [
      PlaceSuggestion(placeId: 'p-paris', mainText: 'Gare de Lyon', secondaryText: 'Paris, France'),
    ];
  }

  @override
  Future<Place> details(String placeId, {required String sessionToken}) async => paris;
}

// ── Suivi temps réel (Module 7) ───────────────────────────────────────────

const trackedTripId = '44444444-4444-4444-8444-444444444444';

TrackingSnapshot snapshotFor({
  TripStatus status = TripStatus.started,
  String? phone = '+33600000000',
  LivePosition? lastPosition,
}) {
  return TrackingSnapshot(
    tripId: trackedTripId,
    status: status,
    shuttleType: ShuttleType.bleue,
    origin: paris,
    destination: rouen,
    driver: TrackedDriver(
      firstName: 'Nadia',
      rating: 4.9,
      phone: phone,
      vehicle: const DriverVehicle(
        brand: 'Renault',
        model: 'Trafic',
        color: 'Gris',
        plate: 'AB-123-CD',
        dashcamActive: true,
        pmrEquipped: false,
      ),
    ),
    lastPosition: lastPosition,
  );
}

class FakeTripService extends TripService {
  FakeTripService() : super(Dio());

  TrackingSnapshot snapshot = snapshotFor();
  ApiException? error;
  int calls = 0;

  TripDetail? tripDetail;
  CancelResult cancelResult = const CancelResult(feeCents: 0, refundedCents: 12186, refundPending: false);
  final List<String> cancelled = [];

  @override
  Future<TrackingSnapshot> tracking(String tripId) async {
    calls++;
    if (error != null) throw error!;
    return snapshot;
  }

  @override
  Future<TripDetail> detail(String tripId) async {
    if (error != null) throw error!;
    return tripDetail!;
  }

  final List<String> invoiceLinks = [];

  @override
  Future<Uri> invoiceLink(String invoiceId) async {
    invoiceLinks.add(invoiceId);
    return Uri.parse('http://localhost:3000/api/v1/invoices/$invoiceId/file?token=t');
  }

  @override
  Future<CancelResult> cancel(String tripId, String reason) async {
    cancelled.add(tripId);
    return cancelResult;
  }
}

// ── Paiement (Stripe) ─────────────────────────────────────────────────────

PaymentSheetParams sheetFor({String tripId = 'trip-paid', int amountCents = 12186}) => PaymentSheetParams(
      tripId: tripId,
      paymentIntentClientSecret: 'pi_1_secret_x',
      customerId: 'cus_1',
      ephemeralKeySecret: 'ek_1',
      amountCents: amountCents,
      currency: 'EUR',
    );

class FakePaymentService extends PaymentService {
  FakePaymentService() : super(Dio());

  final List<String> calls = [];
  int amountCents = 12186;
  ApiException? error;

  @override
  Future<PaymentSheetParams> createBooking(PassengerQuoteRequest request) async {
    calls.add('book');
    if (error != null) throw error!;
    return sheetFor(amountCents: amountCents);
  }

  @override
  Future<PaymentSheetParams> resume(String tripId) async {
    calls.add('resume:$tripId');
    return sheetFor(tripId: tripId, amountCents: amountCents);
  }

  @override
  Future<String> confirm(String tripId) async {
    calls.add('confirm:$tripId');
    return 'succeeded';
  }
}

class FakePresenter implements PaymentSheetPresenter {
  bool available = true;
  final List<PaymentSheetResult> results = [];
  final List<PaymentSheetParams> presented = [];

  @override
  bool get isAvailable => available;

  @override
  Future<PaymentSheetResult> present(PaymentSheetParams params) async {
    presented.add(params);
    return results.isEmpty ? const PaymentSheetResult(PaymentSheetOutcome.completed) : results.removeAt(0);
  }

  final List<SetupSheetParams> setups = [];

  @override
  Future<PaymentSheetResult> presentSetup(SetupSheetParams params) async {
    setups.add(params);
    return results.isEmpty ? const PaymentSheetResult(PaymentSheetOutcome.completed) : results.removeAt(0);
  }
}

/// Canal temps réel piloté par le test : il pousse lui-même les événements.
class FakeTrackingChannel implements TrackingChannel {
  final _events = StreamController<TrackingEvent>.broadcast();
  String? startedTripId;
  final List<String> sentMessages = [];
  final List<({double lat, double lng})> sosSent = [];
  bool sosAcknowledged = true;
  bool disposed = false;

  void push(TrackingEvent e) => _events.add(e);

  @override
  Stream<TrackingEvent> get events => _events.stream;

  @override
  void start(String tripId) => startedTripId = tripId;

  @override
  void sendMessage(String tripId, String text) => sentMessages.add(text);

  @override
  Future<bool> sendSos({required String tripId, required double lat, required double lng}) async {
    sosSent.add((lat: lat, lng: lng));
    return sosAcknowledged;
  }

  @override
  void dispose() {
    disposed = true;
    _events.close();
  }
}

// ── Onboarding chauffeur (Module 8) ───────────────────────────────────────

/// "Maintenant" fixe des tests d'onboarding.
final now = DateTime(2026, 10, 1, 9);
final nextYear = DateTime(2027, 10, 1);

/// Brouillon complet et valide pour toutes les étapes.
DriverApplicationDraft completeDraft() => DriverApplicationDraft(
      firstName: 'Nadia',
      lastName: 'Benali',
      phone: '06 12 34 56 78',
      languages: const {'fr', 'en'},
      licenseNumber: '12AB34567',
      licenseExpiry: nextYear,
      vtcCardNumber: 'VTC-075-123',
      vtcCardExpiry: nextYear,
      brand: 'Renault',
      model: 'Trafic',
      color: 'Gris',
      plate: 'ab 123 cd',
      capacity: 8,
      dashcamInstalled: true,
      insuranceExpiry: nextYear,
      technicalControlExpiry: nextYear,
      consent: true,
    );

class FakeDriverService extends DriverService {
  FakeDriverService() : super(Dio());

  DriverApplicationStatus status = DriverApplicationStatus.draft;
  final Set<DriverDocumentType> serverDocs = {};
  final List<DriverDocumentType> uploads = [];
  Map<String, dynamic>? lastApplication;
  ApiException? uploadError;
  ApiException? applyError;

  @override
  Future<DriverApplicationView> application() async =>
      DriverApplicationView(status: status, uploaded: {...serverDocs});

  @override
  Future<void> uploadDocument(DriverDocumentType type, PickedDocument doc) async {
    uploads.add(type);
    if (uploadError != null) throw uploadError!;
    serverDocs.add(type);
  }

  @override
  Future<DriverApplicationView> apply(DriverApplicationDraft draft) async {
    lastApplication = draft.toJson();
    if (applyError != null) throw applyError!;
    status = DriverApplicationStatus.pending;
    return DriverApplicationView(status: status, uploaded: {...serverDocs});
  }
}

class FakeDocumentPicker implements DocumentPicker {
  /// null = l'utilisateur annule.
  PickedDocument? next = PickedDocument(bytes: Uint8List.fromList([0xff, 0xd8, 0xff]), filename: 'document.jpg');
  final List<DocumentSource> sources = [];

  @override
  Future<PickedDocument?> pick(DocumentSource source) async {
    sources.add(source);
    return next;
  }
}

// ── Mode chauffeur (écran 15) ─────────────────────────────────────────────

const offeredTripId = '5a5a0000-0000-4000-8000-000000000001';
const missionTripId = '5a5a0000-0000-4000-8000-000000000002';
const boardingQr = '9b2e0000-0000-4000-8000-0000000000aa';

MissionOffer offerFor({String tripId = offeredTripId, Duration left = const Duration(seconds: 30)}) => MissionOffer(
      tripId: tripId,
      shuttleType: ShuttleType.bleue,
      originAddress: paris.address,
      destinationAddress: rouen.address,
      distanceKm: 135.4,
      scheduledAt: DateTime(2026, 10, 12, 14, 30),
      seats: 3,
      totalPriceCents: 12186,
      pickupDistanceKm: 2.4,
      expiresAt: DateTime.now().add(left),
    );

Mission missionFor({
  TripStatus status = TripStatus.accepted,
  DateTime? scheduledAt,
  String? phone = '+33611111111',
  String type = 'passenger',
  List<ParcelTask> parcels = const [],
}) =>
    Mission(
      type: type,
      parcels: parcels,
      id: missionTripId,
      status: status,
      shuttleType: ShuttleType.bleue,
      origin: paris,
      destination: rouen,
      scheduledAt: scheduledAt ?? DateTime.now().add(const Duration(minutes: 30)),
      distanceKm: 135.4,
      durationMin: 97,
      seats: 2,
      childSeats: 1,
      checkedIn: status == TripStatus.started,
      totalPriceCents: 12186,
      passengerFirstName: 'Léa',
      passengerPhone: phone,
    );

class FakeDriverModeService extends DriverModeService {
  FakeDriverModeService() : super(Dio());

  DriverStatus driverStatus = const DriverStatus(online: false, approved: true, rating: 4.9, totalTrips: 41);
  MissionList missionList = const MissionList(upcoming: [], recent: []);
  Earnings earningsValue = const Earnings(
    // Commission 10 % sur le HT (TVA 0 % ici).
    today: EarningsPeriod(trips: 1, grossCents: 12186, commissionCents: 1219, netCents: 10967),
    week: EarningsPeriod(trips: 4, grossCents: 48000, commissionCents: 4800, netCents: 43200),
    month: EarningsPeriod(trips: 12, grossCents: 150000, commissionCents: 15000, netCents: 135000),
  );
  final List<String> calls = [];

  /// Erreur à lever sur la prochaine action (accept, start, setOnline…).
  ApiException? nextError;

  Future<void> _act(String call) async {
    calls.add(call);
    final e = nextError;
    nextError = null;
    if (e != null) throw e;
  }

  @override
  Future<DriverStatus> status() async => driverStatus;

  @override
  Future<bool> setOnline(bool online) async {
    await _act('online:$online');
    return online;
  }

  @override
  Future<MissionList> missions() async => missionList;

  @override
  Future<Earnings> earnings() async => earningsValue;

  @override
  Future<void> accept(String tripId) => _act('accept:$tripId');

  @override
  Future<void> refuse(String tripId) => _act('refuse:$tripId');

  @override
  Future<void> start(String tripId, {String? qrCode}) => _act('start:$tripId:${qrCode ?? '-'}');

  @override
  Future<void> complete(String tripId) => _act('complete:$tripId');

  @override
  Future<void> withdraw(String tripId, String reason) => _act('withdraw:$tripId');
}

class FakeDriverChannel implements DriverChannel {
  final _events = StreamController<DriverEvent>.broadcast();
  bool connected = false;
  bool disposed = false;
  final List<({double lat, double lng})> locations = [];
  Set<String> watched = {};

  void push(DriverEvent e) => _events.add(e);

  @override
  Stream<DriverEvent> get events => _events.stream;

  @override
  bool get isConnected => connected;

  @override
  void connect() {
    connected = true;
    // Comme le vrai canal : l'événement de connexion arrive après coup.
    scheduleMicrotask(() => _events.add(const DriverConnection(true)));
  }

  @override
  void sendLocation({required double lat, required double lng, double? heading, double? speed}) =>
      locations.add((lat: lat, lng: lng));

  @override
  void watchTrips(Iterable<String> tripIds) => watched = tripIds.toSet();

  @override
  void dispose() {
    disposed = true;
    _events.close();
  }
}

class FakePositionSource implements PositionSource {
  LocationAccess access = LocationAccess.granted;
  final positions = StreamController<DevicePosition>.broadcast();

  @override
  Future<LocationAccess> ensureAccess() async => access;

  @override
  Stream<DevicePosition> watch() => positions.stream;
}

class FakeQrScanner implements QrScanner {
  String? next = boardingQr;
  int scans = 0;

  @override
  Future<String?> scan(_) async {
    scans++;
    return next;
  }
}

class FakeLauncher implements DriverLauncher {
  final List<Place> navigations = [];
  final List<String> calls = [];

  @override
  Future<bool> navigateTo(Place place) async {
    navigations.add(place);
    return true;
  }

  @override
  Future<bool> call(String phone) async {
    calls.add(phone);
    return true;
  }
}

// ── Profil (écran 13) ─────────────────────────────────────────────────────

const leaProfile = UserProfile(id: 'p1', email: 'lea@exemple.fr', firstName: 'Léa', lastName: 'Roux');

class FakeAccountService extends AccountService {
  FakeAccountService() : super(Dio());

  UserProfile profile = leaProfile;
  List<SavedCard> savedCards = const [
    SavedCard(id: 'pm_visa', brand: 'visa', last4: '4242', expMonth: 4, expYear: 2028),
  ];
  final List<String> calls = [];
  ApiException? nextError;

  Future<void> _act(String call) async {
    calls.add(call);
    final e = nextError;
    nextError = null;
    if (e != null) throw e;
  }

  @override
  Future<UserProfile> me() async => profile;

  @override
  Future<UserProfile> updateName({required String firstName, required String lastName}) async {
    await _act('name:$firstName $lastName');
    profile = UserProfile(id: profile.id, email: profile.email, firstName: firstName, lastName: lastName);
    return profile;
  }

  @override
  Future<void> deleteAccount(String password) => _act('delete:$password');

  @override
  Future<List<SavedCard>> cards() async => savedCards;

  @override
  Future<SetupSheetParams> startAddCard() async {
    await _act('setup');
    return const SetupSheetParams(setupIntentClientSecret: 'seti_secret', customerId: 'cus_1', ephemeralKeySecret: 'ek_1');
  }

  @override
  Future<void> deleteCard(String id) async {
    await _act('deleteCard:$id');
    savedCards = savedCards.where((c) => c.id != id).toList();
  }
}

class FakeLocationService extends LocationService {
  ({double lat, double lng})? position;

  @override
  Future<({double lat, double lng})?> currentPosition() async => position;
}

// ── Colis (écrans 11, 12 et checklist chauffeur) ──────────────────────────

const parcelId = '6c6c0000-0000-4000-8000-000000000001';
const parcelQr = '6c6c0000-0000-4000-8000-0000000000a1';

ParcelTask taskFor({ParcelStatus status = ParcelStatus.pending, bool onReturnLeg = false, String id = parcelId}) => ParcelTask(
      id: id,
      status: status,
      description: 'Carton de livres',
      weightKg: 5,
      isFragile: true,
      onReturnLeg: onReturnLeg,
      pickup: onReturnLeg ? rouen : paris,
      delivery: onReturnLeg ? paris : rouen,
      senderFirstName: 'Léa',
      senderPhone: '+33611111111',
      recipientName: 'Marc Petit',
      recipientPhone: '0612345678',
    );

const graftedOption = ParcelOption(
  available: true,
  price: ParcelPrice(priceCents: 800, vatCents: 160, totalCents: 960),
);
const dedicatedOption = ParcelOption(
  available: true,
  price: ParcelPrice(priceCents: 12986, vatCents: 2597, totalCents: 15583),
);

ParcelDetail parcelDetailFor({ParcelStatus status = ParcelStatus.pending, bool onReturnLeg = false, bool cancellable = true}) => ParcelDetail(
      id: parcelId,
      tripId: 'trip-parcel',
      status: status,
      mode: ParcelMode.grafted,
      onReturnLeg: onReturnLeg,
      pickupAddress: paris.address,
      deliveryAddress: rouen.address,
      departureAt: DateTime(2026, 10, 12, 14, 30),
      description: 'Carton de livres',
      weightKg: 5,
      isFragile: false,
      hasPhoto: false,
      recipientName: 'Marc Petit',
      recipientPhone: '0612345678',
      totalCents: 960,
      createdAt: DateTime(2026, 10, 10, 9),
      pickedUpAt: status == ParcelStatus.pending ? null : DateTime(2026, 10, 12, 14, 20),
      inTransitAt: status == ParcelStatus.inTransit || status == ParcelStatus.delivered ? DateTime(2026, 10, 12, 14, 32) : null,
      deliveredAt: status == ParcelStatus.delivered ? DateTime(2026, 10, 12, 16, 10) : null,
      cancelledAt: null,
      failureReason: status == ParcelStatus.failed ? 'Destinataire absent ou injoignable' : null,
      driverFirstName: 'Nadia',
      vehicleLabel: 'Renault · Trafic · Gris · AB-123-CD',
      qrCode: parcelQr,
      deliveryCode: '4821',
      cancellable: cancellable,
    );

class FakeParcelService extends ParcelService {
  FakeParcelService() : super(Dio());

  ParcelQuote quoteResult = const ParcelQuote(grafted: graftedOption, dedicated: dedicatedOption);
  ParcelDetail detailResult = parcelDetailFor();
  final List<String> calls = [];
  ParcelRequest? lastRequest;
  ApiException? nextError;

  Future<void> _act(String call) async {
    calls.add(call);
    final e = nextError;
    nextError = null;
    if (e != null) throw e;
  }

  @override
  Future<ParcelQuote> quote(ParcelRequest request) async {
    lastRequest = request;
    await _act('quote');
    return quoteResult;
  }

  @override
  Future<ParcelBooking> book(ParcelRequest request, ParcelMode mode) async {
    await _act('book:${mode.apiValue}');
    return ParcelBooking(parcelId: parcelId, tripId: 'trip-parcel', payment: sheetFor(tripId: 'trip-parcel', amountCents: 960));
  }

  @override
  Future<ParcelDetail> detail(String parcelId) async => detailResult;

  @override
  Future<void> uploadPhoto(String parcelId, PickedDocument photo) => _act('photo');

  @override
  Future<void> pickup(String parcelId, String qrCode) => _act('pickup:$parcelId:$qrCode');

  @override
  Future<void> deliver(String parcelId, String code, PickedDocument photo) => _act('deliver:$parcelId:$code');

  @override
  Future<void> fail(String parcelId, String reason) => _act('fail:$parcelId:$reason');
}
