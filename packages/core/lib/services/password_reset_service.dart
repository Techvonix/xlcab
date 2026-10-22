import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_service.dart';
import 'auth_service.dart';

/// Mot de passe oublié (serveur : `src/account-recovery`) : un code à 6 chiffres
/// arrive par e-mail, puis il sert à choisir un nouveau mot de passe. Sans
/// connexion : passe par le Dio SANS jeton, comme la connexion elle-même.
class PasswordResetService {
  PasswordResetService(this._dio);

  final Dio _dio;

  /// Demande de code. Le serveur répond de la même façon que le compte existe ou non.
  Future<void> requestCode(String email) async {
    try {
      await _dio.post<Object?>('/api/v1/auth/password/forgot', data: {'email': email.trim()});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Nouveau mot de passe ; toutes les sessions du compte sont fermées par le serveur.
  Future<void> reset({required String email, required String code, required String password}) async {
    try {
      await _dio.post<Object?>('/api/v1/auth/password/reset', data: {'email': email.trim(), 'code': code.trim(), 'password': password});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final passwordResetServiceProvider = Provider<PasswordResetService>((ref) => PasswordResetService(ref.watch(plainDioProvider)));
