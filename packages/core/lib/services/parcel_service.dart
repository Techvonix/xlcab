import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/parcel.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'document_picker.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Endpoints "Bookings colis" (xlcab_backend/src/parcels).
class ParcelService {
  ParcelService(this._dio);

  final Dio _dio;

  String _parcel(String id) => '/api/v1/bookings/parcel/${Uri.encodeComponent(id)}';

  Future<ParcelQuote> quote(ParcelRequest request) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/bookings/parcel/quote', data: request.toQuoteJson());
        return ParcelQuote.fromJson(res.data ?? const {});
      });

  /// Réservation au prix recalculé par le serveur + feuille de paiement.
  Future<ParcelBooking> book(ParcelRequest request, ParcelMode mode) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/bookings/parcel', data: request.toBookingJson(mode));
        return ParcelBooking.fromJson(res.data ?? const {});
      });

  Future<ParcelDetail> detail(String parcelId) => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>(_parcel(parcelId));
        return ParcelDetail.fromJson(res.data ?? const {});
      });

  Future<void> uploadPhoto(String parcelId, PickedDocument photo) => _guard(() => _dio.post<void>(
        '${_parcel(parcelId)}/photo',
        data: FormData.fromMap({'photo': MultipartFile.fromBytes(photo.bytes, filename: photo.filename)}),
        options: Options(sendTimeout: const Duration(seconds: 60)),
      ));

  // ── Chauffeur ───────────────────────────────────────────────────────

  Future<void> pickup(String parcelId, String qrCode) =>
      _guard(() => _dio.post<void>('${_parcel(parcelId)}/pickup', data: {'qrCode': qrCode}));

  /// Remise : code donné par le destinataire + photo du colis remis.
  Future<void> deliver(String parcelId, String code, PickedDocument photo) => _guard(() => _dio.post<void>(
        '${_parcel(parcelId)}/deliver',
        data: FormData.fromMap({'code': code, 'photo': MultipartFile.fromBytes(photo.bytes, filename: photo.filename)}),
        options: Options(sendTimeout: const Duration(seconds: 60)),
      ));

  Future<void> fail(String parcelId, String reason) =>
      _guard(() => _dio.post<void>('${_parcel(parcelId)}/fail', data: {'reason': reason}));

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final data = e.response?.data;
      if (e.response?.statusCode == 404) throw ApiException(l10n.colisIntrouvable);
      if (e.response?.statusCode == 403 && data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final parcelServiceProvider = Provider<ParcelService>((ref) => ParcelService(ref.watch(dioProvider)));
