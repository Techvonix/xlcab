import 'parcel.dart';
import 'place.dart';
import 'shuttle.dart';
import 'trip.dart';

// Modèles du mode chauffeur (Partie 7, écran 15). Contrats :
// xlcab_backend/src/driver-mode et l'événement WebSocket "mission:offer"
// (src/matching/dispatch.service.ts).

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
double? _double(Object? v) => v is num ? v.toDouble() : null;

/// Offre de mission reçue par WebSocket : 30 s pour répondre.
/// Aucune donnée d'identité du passager avant acceptation.
class MissionOffer {
  const MissionOffer({
    required this.tripId,
    required this.shuttleType,
    required this.originAddress,
    required this.destinationAddress,
    required this.distanceKm,
    required this.scheduledAt,
    required this.seats,
    required this.totalPriceCents,
    required this.pickupDistanceKm,
    required this.expiresAt,
  });

  final String tripId;
  final ShuttleType? shuttleType;
  final String originAddress;
  final String destinationAddress;
  final double? distanceKm;
  final DateTime? scheduledAt;
  final int seats;
  final int? totalPriceCents;

  /// Distance entre le chauffeur et le point de départ.
  final double? pickupDistanceKm;
  final DateTime expiresAt;

  /// null si l'offre est inexploitable (champ manquant) : elle est ignorée.
  static MissionOffer? fromJson(Object? data) {
    if (data is! Map) return null;
    final tripId = data['tripId'];
    final expires = data['expiresAt'];
    if (tripId is! String || expires is! num) return null;
    final shuttle = data['shuttleType'];
    return MissionOffer(
      tripId: tripId,
      shuttleType: ShuttleType.fromApi(shuttle is String ? shuttle : null),
      originAddress: data['originAddress'] is String ? data['originAddress'] as String : '',
      destinationAddress: data['destinationAddress'] is String ? data['destinationAddress'] as String : '',
      distanceKm: _double(data['distanceKm']),
      scheduledAt: _date(data['scheduledAt']),
      seats: _int(data['seats']) ?? 0,
      totalPriceCents: _int(data['totalPriceCents']),
      pickupDistanceKm: _double(data['pickupDistanceKm']),
      // Horodatage du serveur (ms epoch). Un décalage d'horloge du
      // téléphone fausserait le compte à rebours : borné à 30 s.
      expiresAt: _clampExpiry(DateTime.fromMillisecondsSinceEpoch(expires.toInt())),
    );
  }

  static DateTime _clampExpiry(DateTime serverExpiry) {
    final max = DateTime.now().add(const Duration(seconds: 30));
    return serverExpiry.isAfter(max) ? max : serverExpiry;
  }

  Duration remaining([DateTime? now]) {
    final left = expiresAt.difference(now ?? DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }
}

/// Course attribuée au chauffeur (GET /drivers/me/trips).
class Mission {
  const Mission({
    required this.id,
    required this.status,
    required this.shuttleType,
    required this.origin,
    required this.destination,
    required this.scheduledAt,
    required this.distanceKm,
    required this.durationMin,
    required this.seats,
    required this.childSeats,
    required this.checkedIn,
    required this.totalPriceCents,
    required this.passengerFirstName,
    required this.passengerPhone,
    this.type = 'passenger',
    this.parcels = const [],
    this.lineDepartureId,
  });

  final String id;
  final TripStatus status;
  final ShuttleType? shuttleType;
  final Place origin;
  final Place destination;
  final DateTime? scheduledAt;
  final double? distanceKm;
  final int? durationMin;
  final int seats;
  final int childSeats;
  final bool checkedIn;
  final int? totalPriceCents;
  final String? passengerFirstName;

  /// Fourni par le serveur seulement à l'approche (T − 60 min) ou en course.
  final String? passengerPhone;

  /// passenger | mixed | parcel (navette colis dédiée).
  final String type;

  /// Checklist colis : à l'aller, au retour, ou colis de la navette dédiée.
  final List<ParcelTask> parcels;

  /// Réservation sur un départ de ligne régulière : affichée avec son départ
  /// (embarquement en bloc), pas comme une mission isolée.
  final String? lineDepartureId;

  bool get isParcelTrip => type == 'parcel';

  /// Course aller terminée, colis du retour encore à traiter.
  bool get isReturnStep => status == TripStatus.completed;

  /// Colis de cette étape : ceux du retour une fois arrivé, sinon ceux de l'aller.
  List<ParcelTask> get currentParcels => parcels.where((p) => p.onReturnLeg == isReturnStep).toList();

  /// Colis du retour annoncés pendant l'aller.
  List<ParcelTask> get returnParcels => parcels.where((p) => p.onReturnLeg && !p.closed).toList();

  /// Le serveur refuse le démarrage plus d'1 h avant l'heure prévue.
  bool canStart([DateTime? now]) =>
      status == TripStatus.accepted &&
      (scheduledAt == null || scheduledAt!.difference(now ?? DateTime.now()) <= const Duration(hours: 1));

  static Place _place(Object? v) {
    if (v is! Map) throw const FormatException('Adresse manquante');
    return Place(
      address: v['address'] is String ? v['address'] as String : '',
      lat: _double(v['lat']) ?? 0,
      lng: _double(v['lng']) ?? 0,
    );
  }

  factory Mission.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String) throw const FormatException('Mission incomplète dans la réponse du serveur');
    final passenger = json['passenger'];
    final shuttle = json['shuttleType'];
    final status = json['status'];
    return Mission(
      id: id,
      status: TripStatus.fromApi(status is String ? status : null),
      shuttleType: ShuttleType.fromApi(shuttle is String ? shuttle : null),
      origin: _place(json['origin']),
      destination: _place(json['destination']),
      scheduledAt: _date(json['scheduledAt']),
      distanceKm: _double(json['distanceKm']),
      durationMin: _int(json['durationMin']),
      seats: _int(json['seats']) ?? 0,
      childSeats: _int(json['childSeats']) ?? 0,
      checkedIn: json['checkedIn'] == true,
      totalPriceCents: _int(json['totalPriceCents']),
      passengerFirstName: passenger is Map && passenger['firstName'] is String ? passenger['firstName'] as String : null,
      passengerPhone: passenger is Map && passenger['phone'] is String ? passenger['phone'] as String : null,
      type: json['type'] is String ? json['type'] as String : 'passenger',
      parcels: json['parcels'] is List
          ? (json['parcels'] as List).map(ParcelTask.fromJson).whereType<ParcelTask>().toList()
          : const [],
      lineDepartureId: json['lineDepartureId'] is String ? json['lineDepartureId'] as String : null,
    );
  }
}

class MissionList {
  const MissionList({required this.upcoming, required this.recent});

  final List<Mission> upcoming;
  final List<Mission> recent;

  /// Course en cours, sinon colis du retour à traiter, sinon la prochaine
  /// (toutes missions confondues : sert au suivi et à la fréquence GPS).
  Mission? get current => _pick(upcoming);

  /// Missions affichées une par une (hors réservations de ligne, regroupées par départ).
  List<Mission> get standalone => upcoming.where((m) => m.lineDepartureId == null).toList();

  Mission? get currentStandalone => _pick(standalone);

  static Mission? _pick(List<Mission> list) {
    for (final m in list) {
      if (m.status == TripStatus.started) return m;
    }
    for (final m in list) {
      if (m.isReturnStep) return m;
    }
    return list.isEmpty ? null : list.first;
  }

  factory MissionList.fromJson(Map<String, dynamic> json) {
    List<Mission> parse(Object? v) =>
        v is List ? v.whereType<Map<String, dynamic>>().map(Mission.fromJson).toList() : const [];
    return MissionList(upcoming: parse(json['upcoming']), recent: parse(json['recent']));
  }
}

/// État au lancement (GET /drivers/me/status).
class DriverStatus {
  const DriverStatus({required this.online, required this.approved, this.rating, this.totalTrips = 0, this.offer});

  final bool online;
  final bool approved;
  final double? rating;
  final int totalTrips;
  final MissionOffer? offer;

  factory DriverStatus.fromJson(Map<String, dynamic> json) => DriverStatus(
        online: json['online'] == true,
        approved: json['approved'] == true,
        rating: _double(json['rating']),
        totalTrips: _int(json['totalTrips']) ?? 0,
        offer: MissionOffer.fromJson(json['offer']),
      );
}

class EarningsPeriod {
  const EarningsPeriod({required this.trips, required this.grossCents, int? commissionCents, int? netCents})
      : commissionCents = commissionCents ?? 0,
        netCents = netCents ?? grossCents;

  final int trips;

  /// Montant TTC payé par les clients.
  final int grossCents;

  /// Commission XLCAB, calculée sur le HT.
  final int commissionCents;

  /// Revenu du chauffeur : HT − commission.
  final int netCents;

  factory EarningsPeriod.fromJson(Object? v) => v is Map
      ? EarningsPeriod(
          trips: _int(v['trips']) ?? 0,
          grossCents: _int(v['grossCents']) ?? 0,
          commissionCents: _int(v['commissionCents']),
          netCents: _int(v['netCents']),
        )
      : const EarningsPeriod(trips: 0, grossCents: 0);
}

/// Revenus (GET /drivers/me/earnings), commission XLCAB déduite.
class Earnings {
  const Earnings({required this.today, required this.week, required this.month, this.commissionPercent = 10});

  final double commissionPercent;

  final EarningsPeriod today;
  final EarningsPeriod week;
  final EarningsPeriod month;

  factory Earnings.fromJson(Map<String, dynamic> json) => Earnings(
        today: EarningsPeriod.fromJson(json['today']),
        week: EarningsPeriod.fromJson(json['week']),
        month: EarningsPeriod.fromJson(json['month']),
        commissionPercent: _double(json['commissionPercent']) ?? 10,
      );
}
