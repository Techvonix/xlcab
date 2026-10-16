// Points de rencontre et arrêts des lignes (CLARIFICATION_MODELE.md, section
// 5.3) : catalogue tenu par l'équipe XLCAB, arrêts choisis par les chauffeurs,
// tronçons réservés par les passagers. Contrats de xlcab_backend/src/meeting-points
// et src/operators/line-stops.ts.

String? _str(Object? v) => v is String ? v : null;
double _double(Object? v) => v is num ? v.toDouble() : 0;
int _int(Object? v) => v is num ? v.toInt() : 0;

/// Point du catalogue.
class MeetingPoint {
  const MeetingPoint({
    required this.id,
    required this.city,
    required this.name,
    required this.address,
    required this.lat,
    required this.lng,
    this.instructions,
    this.transit,
  });

  final String id;
  final String city;
  final String name;
  final String address;
  final double lat;
  final double lng;

  /// Où attendre exactement, repère visible.
  final String? instructions;

  /// Métro, bus, tram à proximité.
  final String? transit;

  static MeetingPoint? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    return MeetingPoint(
      id: json['id'] as String,
      city: _str(json['city']) ?? '',
      name: _str(json['name']) ?? '',
      address: _str(json['address']) ?? '',
      lat: _double(json['lat']),
      lng: _double(json['lng']),
      instructions: _str(json['instructions']),
      transit: _str(json['transit']),
    );
  }
}

/// Arrêt d'une de mes lignes (sens aller).
class LineStopView {
  const LineStopView({required this.id, required this.position, required this.offsetMin, required this.fareFromOriginCents, required this.point});

  final String id;
  final int position;

  /// Minutes après l'heure de départ de la ligne.
  final int offsetMin;

  /// Prix par place depuis le départ de la ligne jusqu'à cet arrêt.
  final int fareFromOriginCents;
  final MeetingPoint point;

  static LineStopView? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final point = MeetingPoint.fromJson(json['meetingPoint']);
    if (point == null) return null;
    return LineStopView(
      id: json['id'] as String,
      position: _int(json['position']),
      offsetMin: _int(json['offsetMin']),
      fareFromOriginCents: _int(json['fareFromOriginCents']),
      point: point,
    );
  }
}

/// Arrêt saisi dans le formulaire d'une ligne ou d'un départ ponctuel.
class StopDraft {
  const StopDraft({required this.point, required this.offsetMin, required this.fareFromOriginCents});

  final MeetingPoint point;
  final int offsetMin;
  final int fareFromOriginCents;

  Map<String, dynamic> toJson() => {'meetingPointId': point.id, 'offsetMin': offsetMin, 'fareFromOriginCents': fareFromOriginCents};
}

/// Montée ou descente d'un passager : point de rencontre, ou départ / arrivée de la ligne.
class RoutePointView {
  const RoutePointView({required this.name, required this.address, this.stopId, this.at, this.instructions, this.transit});

  /// null = départ ou arrivée de la ligne (pas un arrêt).
  final String? stopId;
  final String name;
  final String address;
  final DateTime? at;
  final String? instructions;
  final String? transit;

  bool get isMeetingPoint => stopId != null || instructions != null || transit != null;

  static RoutePointView? fromJson(Object? json) {
    if (json is! Map) return null;
    final at = json['at'];
    return RoutePointView(
      stopId: _str(json['stopId']),
      name: _str(json['name']) ?? '',
      address: _str(json['address']) ?? '',
      at: at is String ? DateTime.tryParse(at)?.toLocal() : null,
      instructions: _str(json['instructions']),
      transit: _str(json['transit']),
    );
  }
}
