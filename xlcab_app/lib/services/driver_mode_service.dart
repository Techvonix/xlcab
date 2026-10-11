import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/driver_mode.dart';
import 'api_service.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Endpoints du mode chauffeur (xlcab_backend/src/driver-mode) et actions
/// sur les missions (src/matching : accept/refuse ; src/trips : start,
/// complete, cancel).
class DriverModeService {
  DriverModeService(this._dio);

  final Dio _dio;

  String _trip(String id) => '/api/v1/trips/${Uri.encodeComponent(id)}';

  Future<DriverStatus> status() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/drivers/me/status');
        return DriverStatus.fromJson(res.data ?? const {});
      });

  /// POST /drivers/me/online. Un refus (403) porte la raison à afficher
  /// (document expiré, dashcam…).
  Future<bool> setOnline(bool online) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/drivers/me/online', data: {'online': online});
        return res.data?['online'] == true;
      });

  Future<MissionList> missions() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/drivers/me/trips');
        return MissionList.fromJson(res.data ?? const {});
      });

  Future<Earnings> earnings() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/drivers/me/earnings');
        return Earnings.fromJson(res.data ?? const {});
      });

  Future<void> accept(String tripId) => _guard(() => _dio.post<void>('${_trip(tripId)}/accept'));

  Future<void> refuse(String tripId) => _guard(() => _dio.post<void>('${_trip(tripId)}/refuse'));

  /// Démarrage, avec le QR du passager s'il a été scanné (preuve d'embarquement).
  Future<void> start(String tripId, {String? qrCode}) =>
      _guard(() => _dio.post<void>('${_trip(tripId)}/start', data: qrCode == null ? {} : {'qrCode': qrCode}));

  Future<void> complete(String tripId) => _guard(() => _dio.post<void>('${_trip(tripId)}/complete'));

  /// Désistement avant le départ : la course repart en recherche, sans frais pour le passager.
  Future<void> withdraw(String tripId, String reason) =>
      _guard(() => _dio.post<void>('${_trip(tripId)}/cancel', data: {'reason': reason}));

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final data = e.response?.data;
      if (e.response?.statusCode == 403 && data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final driverModeServiceProvider = Provider<DriverModeService>((ref) => DriverModeService(ref.watch(dioProvider)));
