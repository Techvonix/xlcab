import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/driver_application.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'document_picker.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Endpoints "Drivers" de la Partie 6 (xlcab_backend/src/drivers).
class DriverService {
  DriverService(this._dio);

  final Dio _dio;

  /// GET /drivers/me/profile — état de la candidature.
  Future<DriverApplicationView> application() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/drivers/me/profile');
        return DriverApplicationView.fromJson(res.data ?? const {});
      });

  /// POST /drivers/me/documents — un document par envoi (multipart).
  Future<void> uploadDocument(DriverDocumentType type, PickedDocument doc) => _guard(() async {
        await _dio.post<void>(
          '/api/v1/drivers/me/documents',
          data: FormData.fromMap({
            'type': type.apiValue,
            'file': MultipartFile.fromBytes(doc.bytes, filename: doc.filename),
          }),
          // Envoi plus long qu'une requête JSON (jusqu'à 2 Mo en 3G/4G).
          options: Options(sendTimeout: const Duration(seconds: 60)),
        );
      });

  /// POST /drivers/apply — étape 5 "envoi validation".
  Future<DriverApplicationView> apply(DriverApplicationDraft draft) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/drivers/apply', data: draft.toJson());
        return DriverApplicationView.fromJson(res.data ?? const {});
      });

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      if (e.response?.statusCode == 413) {
        throw ApiException(l10n.fichierTropVolumineux2Mo);
      }
      throw ApiException.fromDio(e);
    }
  }
}

final driverServiceProvider = Provider<DriverService>((ref) => DriverService(ref.watch(dioProvider)));
