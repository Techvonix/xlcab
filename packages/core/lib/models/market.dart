import 'departure_guarantee.dart';
import 'meeting_point.dart';
import 'place.dart';

// Bourse de transport (xlcab_backend/src/market) : demandes publiées par les
// clients, propositions des opérateurs, messagerie avant confirmation.

String? _str(Object? v) => v is String ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
double? _double(Object? v) => v is num ? v.toDouble() : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

/// Demande vue par un opérateur : zone approximative, jamais l'identité du client.
class MarketFeedItem {
  const MarketFeedItem({
    required this.id,
    required this.originArea,
    required this.destinationArea,
    required this.distanceKm,
    required this.departureAt,
    required this.flexMin,
    required this.passengers,
    required this.luggage,
    required this.accessible,
    required this.recurring,
    required this.expiresAt,
    this.returnAt,
    this.frequency,
    this.budgetCents,
    this.needs,
    this.myOfferId,
    this.myOfferStatus,
    this.myOfferPriceCents,
  });

  final String id;
  final String originArea;
  final String destinationArea;
  final int distanceKm;
  final DateTime departureAt;
  final int flexMin;
  final DateTime? returnAt;
  final int passengers;
  final int luggage;
  final bool accessible;
  final bool recurring;
  final String? frequency;
  final int? budgetCents;
  final String? needs;
  final DateTime expiresAt;
  final String? myOfferId;
  final OfferStatus? myOfferStatus;
  final int? myOfferPriceCents;

  static MarketFeedItem? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final at = _date(json['departureAt']);
    if (at == null) return null;
    final o = json['origin'];
    final d = json['destination'];
    final mine = json['myOffer'];
    return MarketFeedItem(
      id: json['id'] as String,
      originArea: o is Map ? _str(o['area']) ?? '' : '',
      destinationArea: d is Map ? _str(d['area']) ?? '' : '',
      distanceKm: _int(json['distanceKm']) ?? 0,
      departureAt: at,
      flexMin: _int(json['flexMin']) ?? 0,
      returnAt: _date(json['returnAt']),
      passengers: _int(json['passengers']) ?? 0,
      luggage: _int(json['luggage']) ?? 0,
      accessible: json['accessible'] == true,
      recurring: json['recurring'] == true,
      frequency: _str(json['frequency']),
      budgetCents: _int(json['budgetCents']),
      needs: _str(json['needs']),
      expiresAt: _date(json['expiresAt']) ?? at,
      myOfferId: mine is Map ? _str(mine['id']) : null,
      myOfferStatus: mine is Map ? OfferStatus.fromApi(_str(mine['status'])) : null,
      myOfferPriceCents: mine is Map ? _int(mine['priceCents']) : null,
    );
  }
}

enum OfferStatus {
  pending,
  /// Choisie par le client, carte à valider (empreinte) : l'opérateur n'est pas encore prévenu.
  authorizing,
  /// Choisie par le client : l'opérateur doit reconfirmer.
  accepted,
  confirmed,
  declined,
  withdrawn,
  rejected,
  expired;

  static OfferStatus fromApi(String? v) => OfferStatus.values.firstWhere((s) => s.name == v, orElse: () => OfferStatus.expired);
}

class MarketOffer {
  const MarketOffer({
    required this.id,
    required this.requestId,
    required this.priceCents,
    required this.pickupAt,
    required this.includesReturn,
    required this.status,
    required this.validUntil,
    required this.operatorVerified,
    required this.operatorRatingCount,
    this.conditions,
    this.confirmDeadline,
    this.operatorName,
    this.operatorRating,
    this.vehicleLabel,
    this.vehicleCapacity,
    this.vehicleAccessible = false,
    this.originArea,
    this.destinationArea,
    this.passengers,
  });

  final String id;
  final String requestId;
  final int priceCents;
  final DateTime pickupAt;
  final bool includesReturn;
  final String? conditions;
  final OfferStatus status;
  final DateTime validUntil;
  final DateTime? confirmDeadline;
  final String? operatorName;
  final bool operatorVerified;
  final double? operatorRating;
  final int operatorRatingCount;
  final String? vehicleLabel;
  final int? vehicleCapacity;
  final bool vehicleAccessible;

  /// Rappel de la demande (zones approximatives).
  final String? originArea;
  final String? destinationArea;
  final int? passengers;

  static MarketOffer? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final pickup = _date(json['pickupAt']);
    if (pickup == null) return null;
    final op = json['operator'];
    final v = json['vehicle'];
    return MarketOffer(
      id: json['id'] as String,
      requestId: _str(json['requestId']) ?? '',
      priceCents: _int(json['priceCents']) ?? 0,
      pickupAt: pickup,
      includesReturn: json['includesReturn'] == true,
      conditions: _str(json['conditions']),
      status: OfferStatus.fromApi(_str(json['status'])),
      validUntil: _date(json['validUntil']) ?? pickup,
      confirmDeadline: _date(json['confirmDeadline']),
      operatorName: op is Map ? _str(op['name']) : null,
      operatorVerified: op is Map && op['verified'] == true,
      operatorRating: op is Map ? _double(op['rating']) : null,
      operatorRatingCount: op is Map ? _int(op['ratingCount']) ?? 0 : 0,
      vehicleLabel: v is Map ? [_str(v['brand']), _str(v['model'])].whereType<String>().join(' ') : null,
      vehicleCapacity: v is Map ? _int(v['capacity']) : null,
      vehicleAccessible: v is Map && v['accessible'] == true,
      originArea: json['request'] is Map ? _str((json['request'] as Map)['originArea']) : null,
      destinationArea: json['request'] is Map ? _str((json['request'] as Map)['destinationArea']) : null,
      passengers: json['request'] is Map ? _int((json['request'] as Map)['passengers']) : null,
    );
  }
}

class OfferMessage {
  const OfferMessage({required this.id, required this.mine, required this.body, required this.createdAt});

  final String id;
  final bool mine;
  final String body;
  final DateTime createdAt;

  static OfferMessage? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    return OfferMessage(
      id: json['id'] as String,
      mine: json['mine'] == true,
      body: _str(json['body']) ?? '',
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
    );
  }
}

/// Statut d'une demande, vu par le client.
enum RequestStatus {
  draft,
  published,
  offersReceived,
  accepted,
  confirmed,
  inProgress,
  completed,
  cancelled,
  expired;

  static RequestStatus fromApi(String? v) => switch (v) {
        'draft' => RequestStatus.draft,
        'published' => RequestStatus.published,
        'offers_received' => RequestStatus.offersReceived,
        'accepted' => RequestStatus.accepted,
        'confirmed' => RequestStatus.confirmed,
        'in_progress' => RequestStatus.inProgress,
        'completed' => RequestStatus.completed,
        'cancelled' => RequestStatus.cancelled,
        _ => RequestStatus.expired,
      };
}

/// Demande vue par son auteur (étape 4, écrans passager).
class MarketRequest {
  const MarketRequest({
    required this.id,
    required this.status,
    required this.origin,
    required this.destination,
    required this.departureAt,
    required this.flexMin,
    required this.passengers,
    required this.luggage,
    required this.openOffers,
    this.returnAt,
    this.accessible = false,
    this.needs,
    this.tripId,
    this.returnTripId,
  });

  final String id;
  final RequestStatus status;
  final Place origin;
  final Place destination;
  final DateTime departureAt;
  final int flexMin;
  final DateTime? returnAt;
  final int passengers;
  final int luggage;
  final bool accessible;
  final String? needs;
  final int openOffers;
  final String? tripId;
  final String? returnTripId;

  static Place _place(Object? v) {
    final m = v is Map ? v : const {};
    return Place(address: _str(m['address']) ?? '', lat: _double(m['lat']) ?? 0, lng: _double(m['lng']) ?? 0);
  }

  static MarketRequest? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final at = _date(json['departureAt']);
    if (at == null) return null;
    return MarketRequest(
      id: json['id'] as String,
      status: RequestStatus.fromApi(_str(json['status'])),
      origin: _place(json['origin']),
      destination: _place(json['destination']),
      departureAt: at,
      flexMin: _int(json['flexMin']) ?? 0,
      returnAt: _date(json['returnAt']),
      passengers: _int(json['passengers']) ?? 0,
      luggage: _int(json['luggage']) ?? 0,
      accessible: json['accessible'] == true,
      needs: _str(json['needs']),
      openOffers: _int(json['openOffers']) ?? 0,
      tripId: _str(json['tripId']),
      returnTripId: _str(json['returnTripId']),
    );
  }
}

/// Raison du classement d'un départ (codes du serveur, traduits par l'app).
class MatchReason {
  const MatchReason(this.code, this.value);

  /// pickup | dropoff | time | seats_left | private_vehicle | verified_operator
  final String code;
  final num? value;
}

/// Départ de ligne régulière réservable, résultat d'une recherche.
class LineSearchResult {
  const LineSearchResult({
    required this.departureId,
    required this.departureAt,
    required this.localTime,
    required this.origin,
    required this.destination,
    required this.perSeat,
    required this.unitPriceCents,
    required this.totalPriceCents,
    required this.seatsLeft,
    required this.luggage,
    required this.operatorRatingCount,
    this.durationMin,
    this.conditions,
    this.operatorName,
    this.operatorRating,
    this.vehicleLabel,
    this.reasons = const [],
    this.guarantee,
    this.board,
    this.alight,
    this.fullTrip = true,
  });

  /// Montée et descente du passager (point de rencontre, ou extrémités de la ligne).
  final RoutePointView? board;
  final RoutePointView? alight;

  /// Trajet complet ; sinon un tronçon, au prix du tronçon.
  final bool fullTrip;

  /// Seuil de départ garanti : « départ confirmé » ou « encore N passagers ».
  final DepartureGuarantee? guarantee;
  final String departureId;
  final DateTime departureAt;
  final String localTime;
  final int? durationMin;
  final String origin;
  final String destination;
  final bool perSeat;
  final int unitPriceCents;
  final int totalPriceCents;
  final int seatsLeft;
  final int luggage;
  final String? conditions;
  final String? operatorName;
  final double? operatorRating;
  final int operatorRatingCount;
  final String? vehicleLabel;
  final List<MatchReason> reasons;

  static LineSearchResult? fromJson(Object? json) {
    if (json is! Map || json['departureId'] is! String) return null;
    final at = _date(json['departureAt']);
    if (at == null) return null;
    final op = json['operator'];
    final v = json['vehicle'];
    return LineSearchResult(
      departureId: json['departureId'] as String,
      departureAt: at,
      localTime: _str(json['localTime']) ?? '',
      durationMin: _int(json['durationMin']),
      origin: _str(json['origin']) ?? '',
      destination: _str(json['destination']) ?? '',
      perSeat: json['pricingMode'] == 'per_seat',
      unitPriceCents: _int(json['unitPriceCents']) ?? 0,
      totalPriceCents: _int(json['totalPriceCents']) ?? 0,
      seatsLeft: _int(json['seatsLeft']) ?? 0,
      luggage: _int(json['luggage']) ?? 0,
      conditions: _str(json['conditions']),
      operatorName: op is Map ? _str(op['name']) : null,
      operatorRating: op is Map ? _double(op['rating']) : null,
      operatorRatingCount: op is Map ? _int(op['ratingCount']) ?? 0 : 0,
      vehicleLabel: v is Map ? [_str(v['brand']), _str(v['model'])].whereType<String>().join(' ') : null,
      guarantee: DepartureGuarantee.fromJson(json['guarantee']),
      board: RoutePointView.fromJson(json['board']),
      alight: RoutePointView.fromJson(json['alight']),
      fullTrip: json['fullTrip'] != false,
      reasons: json['reasons'] is List
          ? (json['reasons'] as List).whereType<Map>().where((r) => r['code'] is String).map((r) {
              final value = r['km'] ?? r['diffMin'] ?? r['count'];
              return MatchReason(r['code'] as String, value is num ? value : null);
            }).toList()
          : const [],
    );
  }
}

/// Saisie d'une demande de transport (POST /market/requests, publiée aussitôt).
class RequestDraft {
  const RequestDraft({
    required this.origin,
    required this.destination,
    required this.departureAt,
    required this.passengers,
    this.flexMin = 0,
    this.returnAt,
    this.luggage = 0,
    this.accessible = false,
    this.budgetCents,
    this.needs,
  });

  final Place origin;
  final Place destination;
  final DateTime departureAt;
  final int flexMin;
  final DateTime? returnAt;
  final int passengers;
  final int luggage;
  final bool accessible;
  final int? budgetCents;
  final String? needs;

  Map<String, dynamic> toJson() => {
        'originAddress': origin.address,
        'originLat': origin.lat,
        'originLng': origin.lng,
        'destinationAddress': destination.address,
        'destinationLat': destination.lat,
        'destinationLng': destination.lng,
        'departureAt': departureAt.toUtc().toIso8601String(),
        'flexMin': flexMin,
        if (returnAt != null) 'returnAt': returnAt!.toUtc().toIso8601String(),
        'passengers': passengers,
        'luggage': luggage,
        'accessible': accessible,
        if (budgetCents != null) 'budgetCents': budgetCents,
        if (needs != null && needs!.isNotEmpty) 'needs': needs,
        'publish': true,
      };
}

/// Plan des sièges d'un départ de ligne : numéros de 1 à [seatsTotal], dont
/// ceux déjà pris. Aucune identité : on ne sait pas qui occupe quoi.
class SeatMap {
  const SeatMap({required this.seatsTotal, required this.taken, required this.choosable});

  final int seatsTotal;
  final Set<int> taken;

  /// false pour un départ privatisé (prix au véhicule) : pas de choix de siège.
  final bool choosable;

  factory SeatMap.fromJson(Map<String, dynamic>? json) {
    final total = json?['seatsTotal'];
    final taken = json?['taken'];
    if (total is! int || taken is! List) throw const FormatException('plan des sièges');
    return SeatMap(seatsTotal: total, taken: taken.whereType<num>().map((n) => n.toInt()).toSet(), choosable: json?['choosable'] == true);
  }
}
