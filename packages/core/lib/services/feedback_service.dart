import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/driver_public_profile.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Profil du chauffeur, note et signalement (écran 10), adresses favorites et
/// préférences de notification (écran 13). Contrats : xlcab_backend/src/feedback
/// et src/users/user-settings.ts.
class FeedbackService {
  FeedbackService(this._dio);

  final Dio _dio;

  String _trip(String id) => '/api/v1/trips/${Uri.encodeComponent(id)}';

  Future<DriverPublicProfile> driverProfile(String tripId) => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('${_trip(tripId)}/driver');
        return DriverPublicProfile.fromJson(res.data ?? const {});
      });

  Future<void> rate(String tripId, int stars, {String? comment}) => _guard(() => _dio.post<void>(
        '${_trip(tripId)}/rating',
        data: {'stars': stars, if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim()},
      ));

  Future<void> report(String tripId, ReportReason reason, {String? details}) => _guard(() => _dio.post<void>(
        '${_trip(tripId)}/report',
        data: {'reason': reason.name, if (details != null && details.trim().isNotEmpty) 'details': details.trim()},
      ));

  Future<List<SavedAddress>> addresses() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('/api/v1/users/me/addresses');
        return (res.data ?? const []).map(SavedAddress.fromJson).toList();
      });

  Future<SavedAddress> saveAddress({required String label, required String address, required double lat, required double lng}) =>
      _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/users/me/addresses', data: {'label': label, 'address': address, 'lat': lat, 'lng': lng});
        return SavedAddress.fromJson(res.data);
      });

  Future<void> deleteAddress(String id) => _guard(() => _dio.delete<void>('/api/v1/users/me/addresses/${Uri.encodeComponent(id)}'));

  Future<NotificationPreferences> preferences() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/users/me/preferences');
        return NotificationPreferences.fromJson(res.data ?? const {});
      });

  Future<NotificationPreferences> updatePreferences(Map<String, bool> changes) => _guard(() async {
        final res = await _dio.patch<Map<String, dynamic>>('/api/v1/users/me/preferences', data: changes);
        return NotificationPreferences.fromJson(res.data ?? const {});
      });

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final data = e.response?.data;
      // 403 / 404 : messages destinés à l'utilisateur (« La note doit être
      // donnée dans les 7 jours… », « Chauffeur introuvable… »).
      if (const {403, 404}.contains(e.response?.statusCode) && data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final feedbackServiceProvider = Provider<FeedbackService>((ref) => FeedbackService(ref.watch(dioProvider)));

/// Profil du chauffeur d'une course (écran 10).
final driverPublicProfileProvider = FutureProvider.autoDispose.family<DriverPublicProfile, String>(
  (ref, tripId) => ref.watch(feedbackServiceProvider).driverProfile(tripId),
);

final savedAddressesProvider = FutureProvider.autoDispose<List<SavedAddress>>(
  (ref) => ref.watch(feedbackServiceProvider).addresses(),
);

final notificationPreferencesProvider = FutureProvider.autoDispose<NotificationPreferences>(
  (ref) => ref.watch(feedbackServiceProvider).preferences(),
);
