import 'place.dart';

// Espace opérateur (bourse de transport, étapes 1 et 2) : profil, lignes
// régulières, départs, réserves, reprises, annulations. Contrats JSON de
// xlcab_backend/src/operators et src/line-bookings.

String? _str(Object? v) => v is String ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
double? _double(Object? v) => v is num ? v.toDouble() : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
List<String> _strings(Object? v) => v is List ? v.whereType<String>().toList() : const [];

Map<String, dynamic> _map(Object? v) {
  if (v is! Map) throw const FormatException('Réponse incomplète du serveur');
  return v.cast<String, dynamic>();
}

Place _place(Object? v) {
  final m = v is Map ? v : const {};
  return Place(address: _str(m['address']) ?? '', lat: _double(m['lat']) ?? 0, lng: _double(m['lng']) ?? 0);
}

/// Statut de vérification de l'opérateur par XLCAB.
enum OperatorStatus {
  pending,
  verified,
  suspended;

  static OperatorStatus fromApi(String? v) => switch (v) {
        'verified' => OperatorStatus.verified,
        'suspended' => OperatorStatus.suspended,
        _ => OperatorStatus.pending,
      };
}

/// Types d'opérateur (Partie « profils spécialisés » du cahier des charges).
const operatorKinds = ['independent', 'vtc_company', 'fleet', 'collective'];

/// Prestations proposées.
const operatorServices = ['airport', 'station', 'intercity', 'group', 'business', 'tourism', 'disposal'];

class OperatorProfile {
  const OperatorProfile({
    required this.kind,
    required this.status,
    required this.perSeatAllowed,
    required this.termsAccepted,
    required this.termsVersion,
    this.legalName,
    this.siret,
    this.transportLicense,
    this.cities = const [],
    this.services = const [],
    this.description,
  });

  final String kind;
  final OperatorStatus status;
  /// Vente à la place : licence de transport collectif vérifiée par XLCAB.
  final bool perSeatAllowed;
  /// Conditions générales opérateur acceptées dans leur version en vigueur.
  final bool termsAccepted;
  final String termsVersion;
  final String? legalName;
  final String? siret;
  final String? transportLicense;
  final List<String> cities;
  final List<String> services;
  final String? description;

  factory OperatorProfile.fromJson(Object? json) {
    final m = _map(json);
    return OperatorProfile(
      kind: _str(m['kind']) ?? 'independent',
      status: OperatorStatus.fromApi(_str(m['status'])),
      perSeatAllowed: m['perSeatAllowed'] == true,
      termsAccepted: m['termsAccepted'] == true,
      termsVersion: _str(m['termsVersion']) ?? '',
      legalName: _str(m['legalName']),
      siret: _str(m['siret']),
      transportLicense: _str(m['transportLicense']),
      cities: _strings(m['cities']),
      services: _strings(m['services']),
      description: _str(m['description']),
    );
  }
}

class OperatorVehicle {
  const OperatorVehicle({required this.id, required this.capacity, this.brand, this.model, this.plate, this.accessible = false});

  final String id;
  final String? brand;
  final String? model;
  final String? plate;
  /// Places passagers homologuées, conducteur non compris.
  final int capacity;
  final bool accessible;

  String get label => [brand, model].whereType<String>().join(' ');

  static OperatorVehicle? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    return OperatorVehicle(
      id: json['id'] as String,
      brand: _str(json['brand']),
      model: _str(json['model']),
      plate: _str(json['plate']),
      capacity: _int(json['capacity']) ?? 0,
      accessible: json['accessible'] == true,
    );
  }
}

enum LineStatus {
  active,
  paused,
  closed;

  static LineStatus fromApi(String? v) => switch (v) {
        'paused' => LineStatus.paused,
        'closed' => LineStatus.closed,
        _ => LineStatus.active,
      };
}

class LineException {
  const LineException({required this.date, this.seats, this.reason});

  final String date; // AAAA-MM-JJ
  /// Places ce jour-là ; null = pas de départ.
  final int? seats;
  final String? reason;
}

class RecurringLine {
  const RecurringLine({
    required this.id,
    required this.vehicleId,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.daysOfWeek,
    required this.startDate,
    required this.seats,
    required this.luggage,
    required this.perSeat,
    required this.priceCents,
    required this.status,
    this.returnTime,
    this.endDate,
    this.durationMin,
    this.conditions,
    this.exceptions = const [],
    this.departuresToConfirm = 0,
  });

  final String id;
  final String vehicleId;
  final Place origin;
  final Place destination;
  final String departureTime; // HH:MM, heure locale
  final String? returnTime;
  /// 1 = lundi … 7 = dimanche.
  final List<int> daysOfWeek;
  final String startDate;
  final String? endDate;
  final int seats;
  final int luggage;
  /// Prix par place (sinon pour le véhicule entier).
  final bool perSeat;
  final int priceCents;
  final int? durationMin;
  final String? conditions;
  final LineStatus status;
  final List<LineException> exceptions;
  final int departuresToConfirm;

  static RecurringLine? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final m = json.cast<String, dynamic>();
    return RecurringLine(
      id: m['id'] as String,
      vehicleId: _str(m['vehicleId']) ?? '',
      origin: _place(m['origin']),
      destination: _place(m['destination']),
      departureTime: _str(m['departureTime']) ?? '',
      returnTime: _str(m['returnTime']),
      daysOfWeek: m['daysOfWeek'] is List ? (m['daysOfWeek'] as List).whereType<num>().map((d) => d.toInt()).toList() : const [],
      startDate: _str(m['startDate']) ?? '',
      endDate: _str(m['endDate']),
      seats: _int(m['seats']) ?? 0,
      luggage: _int(m['luggage']) ?? 0,
      perSeat: m['pricingMode'] == 'per_seat',
      priceCents: _int(m['priceCents']) ?? 0,
      durationMin: _int(m['durationMin']),
      conditions: _str(m['conditions']),
      status: LineStatus.fromApi(_str(m['status'])),
      exceptions: m['exceptions'] is List
          ? (m['exceptions'] as List)
              .whereType<Map>()
              .where((e) => e['date'] is String)
              .map((e) => LineException(date: e['date'] as String, seats: _int(e['seats']), reason: _str(e['reason'])))
              .toList()
          : const [],
      departuresToConfirm: _int(m['departuresToConfirm']) ?? 0,
    );
  }
}

/// Saisie d'une nouvelle ligne (POST /operators/me/lines).
class LineDraft {
  const LineDraft({
    required this.vehicleId,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.daysOfWeek,
    required this.startDate,
    required this.seats,
    required this.luggage,
    required this.perSeat,
    required this.priceCents,
    this.returnTime,
    this.durationMin,
    this.conditions,
  });

  final String vehicleId;
  final Place origin;
  final Place destination;
  final String departureTime;
  final String? returnTime;
  final List<int> daysOfWeek;
  final String startDate;
  final int seats;
  final int luggage;
  final bool perSeat;
  final int priceCents;
  final int? durationMin;
  final String? conditions;

  Map<String, dynamic> toJson() => {
        'vehicleId': vehicleId,
        'originAddress': origin.address,
        'originLat': origin.lat,
        'originLng': origin.lng,
        'destinationAddress': destination.address,
        'destinationLat': destination.lat,
        'destinationLng': destination.lng,
        'departureTime': departureTime,
        if (returnTime != null) 'returnTime': returnTime,
        'daysOfWeek': daysOfWeek,
        'startDate': startDate,
        'seats': seats,
        'luggage': luggage,
        'pricingMode': perSeat ? 'per_seat' : 'per_vehicle',
        'priceCents': priceCents,
        if (durationMin != null) 'durationMin': durationMin,
        if (conditions != null && conditions!.isNotEmpty) 'conditions': conditions,
      };
}

enum DepartureStatus {
  toConfirm,
  open,
  closed;

  static DepartureStatus fromApi(String? v) => switch (v) {
        'open' => DepartureStatus.open,
        'closed' => DepartureStatus.closed,
        _ => DepartureStatus.toConfirm,
      };
}

class LineDeparture {
  const LineDeparture({
    required this.id,
    required this.lineId,
    required this.isReturn,
    required this.departureAt,
    required this.seatsTotal,
    required this.seatsBooked,
    required this.status,
  });

  final String id;
  final String lineId;
  final bool isReturn;
  final DateTime departureAt;
  final int seatsTotal;
  final int seatsBooked;
  final DepartureStatus status;

  static LineDeparture? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final at = _date(json['departureAt']);
    if (at == null) return null;
    return LineDeparture(
      id: json['id'] as String,
      lineId: _str(json['lineId']) ?? '',
      isReturn: json['direction'] == 'return',
      departureAt: at,
      seatsTotal: _int(json['seatsTotal']) ?? 0,
      seatsBooked: _int(json['seatsBooked']) ?? 0,
      status: DepartureStatus.fromApi(_str(json['status'])),
    );
  }
}

enum BackupStatus {
  invited,
  accepted,
  declined;

  static BackupStatus fromApi(String? v) => switch (v) {
        'accepted' => BackupStatus.accepted,
        'declined' => BackupStatus.declined,
        _ => BackupStatus.invited,
      };
}

/// Réserve d'une de mes lignes (vue du titulaire).
class LineBackup {
  const LineBackup({required this.id, required this.rank, required this.status, this.firstName, this.vehicleLabel});

  final String id;
  final int rank;
  final BackupStatus status;
  final String? firstName;
  final String? vehicleLabel;

  static LineBackup? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final v = json['vehicle'];
    return LineBackup(
      id: json['id'] as String,
      rank: _int(json['rank']) ?? 2,
      status: BackupStatus.fromApi(_str(json['status'])),
      firstName: _str(json['firstName']),
      vehicleLabel: v is Map ? [_str(v['brand']), _str(v['model'])].whereType<String>().join(' ') : null,
    );
  }
}

/// Rôle de réserve qu'on me propose (ou que j'ai accepté) sur la ligne d'un autre.
class BackupRole {
  const BackupRole({
    required this.id,
    required this.rank,
    required this.status,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.daysOfWeek,
    required this.seats,
  });

  final String id;
  final int rank;
  final BackupStatus status;
  final String origin;
  final String destination;
  final String departureTime;
  final List<int> daysOfWeek;
  final int seats;

  static BackupRole? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String || json['line'] is! Map) return null;
    final l = json['line'] as Map;
    return BackupRole(
      id: json['id'] as String,
      rank: _int(json['rank']) ?? 2,
      status: BackupStatus.fromApi(_str(json['status'])),
      origin: _str(l['origin']) ?? '',
      destination: _str(l['destination']) ?? '',
      departureTime: _str(l['departureTime']) ?? '',
      daysOfWeek: l['daysOfWeek'] is List ? (l['daysOfWeek'] as List).whereType<num>().map((d) => d.toInt()).toList() : const [],
      seats: _int(l['seats']) ?? 0,
    );
  }
}

/// Départ réservé que j'assure (ma ligne ou une reprise).
class Assignment {
  const Assignment({
    required this.departureId,
    required this.departureAt,
    required this.origin,
    required this.destination,
    required this.passengers,
    required this.bookings,
    required this.started,
    required this.ready,
    required this.rescued,
  });

  final String departureId;
  final DateTime departureAt;
  final String origin;
  final String destination;
  final int passengers;
  final int bookings;
  final bool started;
  /// « Je suis en route » confirmé.
  final bool ready;
  /// Départ repris en secours.
  final bool rescued;

  static Assignment? fromJson(Object? json) {
    if (json is! Map || json['departureId'] is! String) return null;
    final at = _date(json['departureAt']);
    if (at == null) return null;
    return Assignment(
      departureId: json['departureId'] as String,
      departureAt: at,
      origin: _str(json['origin']) ?? '',
      destination: _str(json['destination']) ?? '',
      passengers: _int(json['passengers']) ?? 0,
      bookings: _int(json['bookings']) ?? 0,
      started: json['started'] == true,
      ready: json['ready'] == true,
      rescued: json['rescued'] == true,
    );
  }
}

class ManifestPassenger {
  const ManifestPassenger({
    required this.tripId,
    required this.seats,
    required this.childSeats,
    required this.checkedIn,
    required this.started,
    this.firstName,
    this.phone,
    this.notes,
  });

  final String tripId;
  final String? firstName;
  /// Visible seulement dans l'heure qui précède le départ.
  final String? phone;
  final int seats;
  final int childSeats;
  final bool checkedIn;
  final bool started;
  final String? notes;
}

/// Liste d'embarquement d'un départ.
class Manifest {
  const Manifest({
    required this.departureId,
    required this.departureAt,
    required this.origin,
    required this.destination,
    required this.ready,
    required this.seatsBooked,
    required this.passengers,
  });

  final String departureId;
  final DateTime departureAt;
  final String origin;
  final String destination;
  final bool ready;
  final int seatsBooked;
  final List<ManifestPassenger> passengers;

  bool get started => passengers.isNotEmpty && passengers.every((p) => p.started);

  factory Manifest.fromJson(Object? json) {
    final m = _map(json);
    final at = _date(m['departureAt']);
    if (at == null || m['departureId'] is! String) throw const FormatException('Liste d’embarquement incomplète');
    return Manifest(
      departureId: m['departureId'] as String,
      departureAt: at,
      origin: _str(m['origin']) ?? '',
      destination: _str(m['destination']) ?? '',
      ready: m['ready'] == true,
      seatsBooked: _int(m['seatsBooked']) ?? 0,
      passengers: m['passengers'] is List
          ? (m['passengers'] as List)
              .whereType<Map>()
              .where((p) => p['tripId'] is String)
              .map((p) => ManifestPassenger(
                    tripId: p['tripId'] as String,
                    firstName: _str(p['firstName']),
                    phone: _str(p['phone']),
                    seats: _int(p['seats']) ?? 0,
                    childSeats: _int(p['childSeats']) ?? 0,
                    checkedIn: p['checkedIn'] == true,
                    started: p['status'] == 'started',
                    notes: _str(p['notes']),
                  ))
              .toList()
          : const [],
    );
  }
}

/// Départ à reprendre en urgence (protocole d'annulation).
class RescueOffer {
  const RescueOffer({
    required this.id,
    required this.expiresAt,
    required this.departureAt,
    required this.localTime,
    required this.origin,
    required this.destination,
    required this.passengers,
    required this.totalPriceCents,
    required this.fromBackupRole,
  });

  final String id;
  final DateTime expiresAt;
  final DateTime departureAt;
  final String localTime;
  final String origin;
  final String destination;
  final int passengers;
  final int totalPriceCents;
  /// Sollicité comme réserve n° 2 / n° 3 (sinon alerte générale).
  final bool fromBackupRole;

  static RescueOffer? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final expires = _date(json['expiresAt']);
    final at = _date(json['departureAt']);
    if (expires == null || at == null) return null;
    return RescueOffer(
      id: json['id'] as String,
      expiresAt: expires,
      departureAt: at,
      localTime: _str(json['localTime']) ?? '',
      origin: _str(json['origin']) ?? '',
      destination: _str(json['destination']) ?? '',
      passengers: _int(json['passengers']) ?? 0,
      totalPriceCents: _int(json['totalPriceCents']) ?? 0,
      fromBackupRole: json['stage'] != 'open',
    );
  }
}

enum CancellationStatus {
  counted,
  notCounted,
  justificationPending,
  justified,
  waived;

  static CancellationStatus fromApi(String? v) => switch (v) {
        'not_counted' => CancellationStatus.notCounted,
        'justification_pending' => CancellationStatus.justificationPending,
        'justified' => CancellationStatus.justified,
        'waived' => CancellationStatus.waived,
        _ => CancellationStatus.counted,
      };
}

enum PenaltyStatus {
  pending,
  contested,
  applied,
  cancelled;

  static PenaltyStatus fromApi(String? v) => switch (v) {
        'contested' => PenaltyStatus.contested,
        'applied' => PenaltyStatus.applied,
        'cancelled' => PenaltyStatus.cancelled,
        _ => PenaltyStatus.pending,
      };
}

class DriverPenalty {
  const DriverPenalty({required this.id, required this.amountCents, required this.status, required this.contestUntil});

  final String id;
  final int amountCents;
  final PenaltyStatus status;
  final DateTime? contestUntil;
}

class DriverCancellation {
  const DriverCancellation({
    required this.id,
    required this.trigger,
    required this.minutesBefore,
    required this.status,
    required this.createdAt,
    this.penalty,
  });

  final String id;
  /// driver_cancel | not_ready | no_position
  final String trigger;
  final int minutesBefore;
  final CancellationStatus status;
  final DateTime createdAt;
  final DriverPenalty? penalty;

  static DriverCancellation? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final p = json['penalty'];
    return DriverCancellation(
      id: json['id'] as String,
      trigger: _str(json['trigger']) ?? 'driver_cancel',
      minutesBefore: _int(json['minutesBefore']) ?? 0,
      status: CancellationStatus.fromApi(_str(json['status'])),
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
      penalty: p is Map && p['id'] is String
          ? DriverPenalty(
              id: p['id'] as String,
              amountCents: _int(p['amountCents']) ?? 0,
              status: PenaltyStatus.fromApi(_str(p['status'])),
              contestUntil: _date(p['contestUntil']),
            )
          : null,
    );
  }
}
