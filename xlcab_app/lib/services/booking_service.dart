import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/quote.dart';
import '../models/shuttle.dart';
import '../models/trip.dart';
import 'api_service.dart';
import 'location_service.dart';
import 'package:xlcab_app/l10n/l10n.dart';

class BookingService {
  BookingService(this._dio);

  final Dio _dio;

  /// Derniers trajets passager (Partie 6 : GET /bookings/passenger/history).
  Future<List<TripSummary>> recentPassengerTrips({int limit = 3}) => history(limit: limit);

  /// Historique complet, du plus récent au plus ancien, page par page (écran 13).
  Future<List<TripSummary>> history({int limit = 20, int page = 1}) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '/api/v1/bookings/passenger/history',
        queryParameters: {'limit': limit, 'page': page},
      );
      final items = response.data ?? const [];
      return items
          .whereType<Map<String, dynamic>>()
          .map(TripSummary.fromJson)
          .take(limit)
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// Navettes de l'écran 5 (GET /api/v1/shuttles).
  Future<ShuttleOverview> shuttles({double? lat, double? lng}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/shuttles',
        queryParameters: {if (lat != null && lng != null) ...{'lat': lat, 'lng': lng}},
      );
      return ShuttleOverview.fromJson(response.data ?? const {});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// Devis passager (Partie 6 : POST /bookings/passenger/quote).
  /// [cancelToken] : annule la requête si le formulaire change entre-temps.
  Future<PassengerQuote> quotePassenger(
    PassengerQuoteRequest request, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/bookings/passenger/quote',
        data: request.toJson(),
        cancelToken: cancelToken,
      );
      final data = response.data;
      if (data == null) throw const FormatException('Réponse vide');
      return PassengerQuote.fromJson(data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final bookingServiceProvider = Provider<BookingService>(
  (ref) => BookingService(ref.watch(dioProvider)),
);

/// Écran 5 : navettes, prix « à partir de » et disponibilité (si la position
/// est déjà autorisée : l'écran ne demande jamais la localisation).
final shuttleOverviewProvider = FutureProvider.autoDispose<ShuttleOverview>((ref) async {
  final position = await ref.watch(locationServiceProvider).currentPositionIfAllowed();
  return ref.watch(bookingServiceProvider).shuttles(lat: position?.lat, lng: position?.lng);
});
