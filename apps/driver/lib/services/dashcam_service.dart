import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/services/api_service.dart';

// Caméra embarquée, niveau 2 (CHARTE_CAMERA_EMBARQUEE.md) : charte acceptée par
// version avant de passer en ligne ; demandes de conservation de l'enregistrement
// après un incident (xlcab_backend/src/dashcam).

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

class DashcamCharter {
  const DashcamCharter({required this.version, required this.accepted, this.acceptedAt});

  final String version;
  final bool accepted;
  final DateTime? acceptedAt;

  factory DashcamCharter.fromJson(Object? json) {
    final m = json is Map ? json : const {};
    return DashcamCharter(
      version: m['version'] is String ? m['version'] as String : '',
      accepted: m['accepted'] == true,
      acceptedAt: _date(m['acceptedAt']),
    );
  }
}

/// Demande de l'équipe : conserver l'enregistrement d'un trajet (jamais le motif du signalement).
class FootageRequest {
  const FootageRequest({required this.incidentId, required this.requestedAt, this.tripAt, this.origin, this.destination, this.acknowledgedAt});

  final String incidentId;
  final DateTime? tripAt;
  final String? origin;
  final String? destination;
  final DateTime? requestedAt;
  final DateTime? acknowledgedAt;

  bool get pending => acknowledgedAt == null;

  static FootageRequest? fromJson(Object? json) {
    if (json is! Map || json['incidentId'] is! String) return null;
    return FootageRequest(
      incidentId: json['incidentId'] as String,
      tripAt: _date(json['tripAt']),
      origin: json['origin'] is String ? json['origin'] as String : null,
      destination: json['destination'] is String ? json['destination'] as String : null,
      requestedAt: _date(json['requestedAt']),
      acknowledgedAt: _date(json['acknowledgedAt']),
    );
  }
}

class DashcamService {
  DashcamService(this._dio);

  final Dio _dio;
  static const _me = '/api/v1/drivers/me';

  Future<DashcamCharter> charter() => guardOperatorCall(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/dashcam-charter');
        return DashcamCharter.fromJson(res.data);
      });

  Future<DashcamCharter> accept(String version) => guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_me/dashcam-charter', data: {'version': version});
        return DashcamCharter.fromJson(res.data);
      });

  Future<List<FootageRequest>> footageRequests() => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_me/footage-requests');
        return (res.data ?? const []).map(FootageRequest.fromJson).whereType<FootageRequest>().toList();
      });

  Future<void> acknowledge(String incidentId) =>
      guardOperatorCall(() => _dio.post<void>('$_me/footage-requests/${Uri.encodeComponent(incidentId)}/acknowledge'));
}

final dashcamServiceProvider = Provider<DashcamService>((ref) => DashcamService(ref.watch(dioProvider)));
final dashcamCharterProvider = FutureProvider.autoDispose<DashcamCharter>((ref) => ref.watch(dashcamServiceProvider).charter());
final footageRequestsProvider = FutureProvider.autoDispose<List<FootageRequest>>((ref) => ref.watch(dashcamServiceProvider).footageRequests());
