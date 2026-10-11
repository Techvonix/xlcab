import 'place.dart';
import 'shuttle.dart';
import 'trip.dart';
import 'package:xlcab_core/l10n/l10n.dart';

double? _toDouble(Object? v) => v is num ? v.toDouble() : null;

/// Position du chauffeur, reçue par WebSocket ("position") ou par le
/// polling (GET /trips/:id/tracking → lastPosition).
class LivePosition {
  const LivePosition({
    required this.lat,
    required this.lng,
    this.heading,
    this.speedKmh,
    required this.at,
  });

  final double lat;
  final double lng;
  final double? heading;
  final double? speedKmh;
  final DateTime at;

  /// Événement WebSocket du Module 3 :
  /// { tripId, driverId, lat, lng, heading, speed, eta, timestamp }.
  static LivePosition? fromSocket(Object? data) {
    if (data is! Map) return null;
    final lat = _toDouble(data['lat']);
    final lng = _toDouble(data['lng']);
    if (lat == null || lng == null) return null;
    final ts = data['timestamp'];
    return LivePosition(
      lat: lat,
      lng: lng,
      heading: _toDouble(data['heading']),
      speedKmh: _toDouble(data['speed']),
      at: ts is int ? DateTime.fromMillisecondsSinceEpoch(ts) : DateTime.now(),
    );
  }

  static LivePosition? fromSnapshot(Object? data) {
    if (data is! Map) return null;
    final lat = _toDouble(data['lat']);
    final lng = _toDouble(data['lng']);
    if (lat == null || lng == null) return null;
    final at = data['recordedAt'];
    return LivePosition(
      lat: lat,
      lng: lng,
      heading: _toDouble(data['heading']),
      speedKmh: _toDouble(data['speed']),
      at: (at is String ? DateTime.tryParse(at)?.toLocal() : null) ?? DateTime.now(),
    );
  }
}

class DriverVehicle {
  const DriverVehicle({
    this.brand,
    this.model,
    this.color,
    required this.plate,
    required this.dashcamActive,
    required this.pmrEquipped,
  });

  final String? brand;
  final String? model;
  final String? color;
  final String plate;
  final bool dashcamActive;
  final bool pmrEquipped;

  /// "Renault Trafic · Gris".
  String get description {
    final name = [brand, model].whereType<String>().join(' ');
    return [if (name.isNotEmpty) name, if (color != null) color!].join(' · ');
  }
}

class TrackedDriver {
  const TrackedDriver({this.firstName, this.rating, this.phone, this.vehicle});

  final String? firstName;
  final double? rating;

  /// Donné par le serveur uniquement au passager, pendant la course.
  final String? phone;
  final DriverVehicle? vehicle;

  String get displayName => firstName ?? l10n.votreChauffeur;
}

/// Réponse de GET /api/v1/trips/:id/tracking.
class TrackingSnapshot {
  const TrackingSnapshot({
    required this.tripId,
    required this.status,
    required this.shuttleType,
    required this.origin,
    required this.destination,
    this.driver,
    this.lastPosition,
  });

  final String tripId;
  final TripStatus status;
  final ShuttleType? shuttleType;
  final Place origin;
  final Place destination;
  final TrackedDriver? driver;
  final LivePosition? lastPosition;

  factory TrackingSnapshot.fromJson(Map<String, dynamic> json) {
    Place? place(Object? p) {
      if (p is! Map) return null;
      final lat = _toDouble(p['lat']);
      final lng = _toDouble(p['lng']);
      final address = p['address'];
      if (lat == null || lng == null || address is! String) return null;
      return Place(address: address, lat: lat, lng: lng);
    }

    final id = json['tripId'];
    final origin = place(json['origin']);
    final destination = place(json['destination']);
    if (id is! String || origin == null || destination == null) {
      throw const FormatException('Suivi incomplet dans la réponse du serveur');
    }

    TrackedDriver? driver;
    final d = json['driver'];
    if (d is Map) {
      final v = d['vehicle'];
      driver = TrackedDriver(
        firstName: d['firstName'] is String ? d['firstName'] as String : null,
        rating: _toDouble(d['rating']),
        phone: d['phone'] is String ? d['phone'] as String : null,
        vehicle: v is Map && v['plate'] is String
            ? DriverVehicle(
                brand: v['brand'] is String ? v['brand'] as String : null,
                model: v['model'] is String ? v['model'] as String : null,
                color: v['color'] is String ? v['color'] as String : null,
                plate: v['plate'] as String,
                dashcamActive: v['dashcamActive'] == true,
                pmrEquipped: v['pmrEquipped'] == true,
              )
            : null,
      );
    }

    final status = json['status'];
    final shuttle = json['shuttleType'];
    return TrackingSnapshot(
      tripId: id,
      status: TripStatus.fromApi(status is String ? status : null),
      shuttleType: ShuttleType.fromApi(shuttle is String ? shuttle : null),
      origin: origin,
      destination: destination,
      driver: driver,
      lastPosition: LivePosition.fromSnapshot(json['lastPosition']),
    );
  }
}

/// Message du chat passager ↔ chauffeur (événement WebSocket "message").
class ChatMessage {
  const ChatMessage({
    required this.fromId,
    required this.fromRole,
    required this.text,
    required this.at,
  });

  final String fromId;
  final String fromRole;
  final String text;
  final DateTime at;

  /// { tripId, from: { id, role }, text, timestamp } — "from" est fixé
  /// par le serveur, jamais par l'expéditeur.
  static ChatMessage? fromSocket(Object? data) {
    if (data is! Map) return null;
    final from = data['from'];
    final text = data['text'];
    if (from is! Map || from['id'] is! String || text is! String) return null;
    final ts = data['timestamp'];
    return ChatMessage(
      fromId: from['id'] as String,
      fromRole: from['role'] is String ? from['role'] as String : '',
      text: text,
      at: ts is int ? DateTime.fromMillisecondsSinceEpoch(ts) : DateTime.now(),
    );
  }
}
