import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/models/tracking.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/models/account.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/services/parcel_service.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/trip_detail.dart';
import 'package:xlcab_passenger/services/payment_service.dart';
import 'package:xlcab_passenger/services/booking_service.dart';
import 'package:xlcab_core/services/document_picker.dart';
import 'package:xlcab_core/services/location_service.dart';
import 'package:xlcab_core/services/places_service.dart';
import 'package:xlcab_passenger/services/tracking_channel.dart';
import 'package:xlcab_core/services/trip_service.dart';

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
