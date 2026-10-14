import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/account.dart';
import 'api_service.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Compte de l'utilisateur connecté (xlcab_backend/src/users) et cartes
/// enregistrées (src/payments).
class AccountService {
  AccountService(this._dio);

  final Dio _dio;

  Future<UserProfile> me() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/users/me');
        return UserProfile.fromJson(res.data ?? const {});
      });

  Future<UserProfile> updateName({required String firstName, required String lastName}) => _guard(() async {
        final res = await _dio.patch<Map<String, dynamic>>('/api/v1/users/me', data: {'firstName': firstName, 'lastName': lastName});
        return UserProfile.fromJson(res.data ?? const {});
      });

  /// Langue du compte (fr, en, ga) : e-mails et notifications envoyés par le serveur.
  Future<void> updateLocale(String locale) => _guard(() => _dio.patch<void>('/api/v1/users/me', data: {'locale': locale}));

  /// Droit à l'effacement : anonymisation, toutes les sessions révoquées.
  Future<void> deleteAccount(String password) =>
      _guard(() => _dio.delete<void>('/api/v1/users/me', data: {'password': password}));

  /// Droit d'accès : lien de téléchargement de l'export (5 minutes, usage unique), à ouvrir dans le navigateur.
  Future<Uri> exportLink() => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/users/me/export/link');
        final url = Uri.tryParse(res.data?['url'] is String ? res.data!['url'] as String : '');
        // Jamais autre chose qu'une adresse web, quoi que réponde le serveur.
        if (url == null || !const {'https', 'http'}.contains(url.scheme) || url.host.isEmpty) throw const FormatException('lien');
        return url;
      });

  Future<List<SavedCard>> cards() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('/api/v1/payments/methods');
        return (res.data ?? const []).map(SavedCard.fromJson).whereType<SavedCard>().toList();
      });

  Future<SetupSheetParams> startAddCard() => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/payments/methods');
        return SetupSheetParams.fromJson(res.data);
      });

  Future<void> deleteCard(String id) =>
      _guard(() => _dio.delete<void>('/api/v1/payments/methods/${Uri.encodeComponent(id)}'));

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final data = e.response?.data;
      // 403 / 404 portent un message destiné à l'utilisateur ("Mot de passe
      // incorrect", "Annulez d'abord vos réservations…").
      if (const {403, 404}.contains(e.response?.statusCode) && data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final accountServiceProvider = Provider<AccountService>((ref) => AccountService(ref.watch(dioProvider)));
