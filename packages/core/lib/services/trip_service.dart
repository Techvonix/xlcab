import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/payment.dart';
import '../models/tracking.dart';
import '../models/trip_detail.dart';
import 'api_service.dart';
import 'package:xlcab_core/l10n/l10n.dart';

class TripService {
  TripService(this._dio);

  final Dio _dio;

  /// Partie 6 : GET /trips/:id/tracking — chargement de l'écran de suivi
  /// et fallback polling 10 s quand le WebSocket est coupé.
  Future<TrackingSnapshot> tracking(String tripId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/trips/${Uri.encodeComponent(tripId)}/tracking',
      );
      final data = response.data;
      if (data == null) throw const FormatException('Réponse vide');
      return TrackingSnapshot.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        throw ApiException(l10n.trajetIntrouvable);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// GET /trips/:id (écran 8 : confirmation, QR d'embarquement).
  Future<TripDetail> detail(String tripId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/v1/trips/${Uri.encodeComponent(tripId)}');
      final data = res.data;
      if (data == null) throw const FormatException('Réponse vide');
      return TripDetail.fromJson(data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) throw ApiException(l10n.trajetIntrouvable);
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// Lien de téléchargement de la facture (PDF), valable 5 minutes : ouvert
  /// dans le navigateur du téléphone, qui gère l'enregistrement du fichier.
  Future<Uri> invoiceLink(String invoiceId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/v1/invoices/${Uri.encodeComponent(invoiceId)}/link');
      final url = res.data?['url'];
      if (url is! String) throw const FormatException('Lien absent');
      return Uri.parse(url);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) throw ApiException(l10n.factureIntrouvable);
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }

  /// POST /trips/:id/cancel : frais selon les CGV, remboursement automatique.
  Future<CancelResult> cancel(String tripId, String reason) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/v1/trips/${Uri.encodeComponent(tripId)}/cancel',
        data: {'reason': reason},
      );
      return CancelResult.fromJson(res.data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final tripServiceProvider = Provider<TripService>((ref) => TripService(ref.watch(dioProvider)));
