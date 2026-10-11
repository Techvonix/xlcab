import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_service.dart';
import 'token_storage.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Version des CGU / politique de confidentialité affichée par cette
/// version de l'app. Doit correspondre à TERMS_VERSION du backend : si les
/// textes changent, le serveur refuse l'inscription tant que l'app n'est
/// pas mise à jour.
const String termsVersion = '2026-10-01';

/// Client HTTP SANS intercepteur d'authentification : login, inscription
/// et rafraîchissement ne doivent jamais déclencher eux-mêmes un
/// rafraîchissement (boucle infinie).
final plainDioProvider = Provider<Dio>((ref) {
  return Dio(BaseOptions(
    baseUrl: apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Accept': 'application/json'},
  ))
    // Messages d'erreur (« Email ou mot de passe incorrect »…) dans la langue de l'app.
    ..interceptors.add(localeHeaderInterceptor);
});

class AuthTokens {
  const AuthTokens(this.accessToken, this.refreshToken);
  final String accessToken;
  final String refreshToken;

  factory AuthTokens.fromJson(Object? data) {
    if (data is Map && data['accessToken'] is String && data['refreshToken'] is String) {
      return AuthTokens(data['accessToken'] as String, data['refreshToken'] as String);
    }
    throw ApiException(l10n.reponseInattendueDuServeurReessayez);
  }
}

/// Endpoints /api/v1/auth du Module 2 (backend).
class AuthService {
  AuthService(this._dio);

  final Dio _dio;

  Future<AuthTokens> login(String email, String password) async {
    try {
      final res = await _dio.post<Object?>('/api/v1/auth/login', data: {'email': email.trim(), 'password': password});
      return AuthTokens.fromJson(res.data);
    } on DioException catch (e) {
      // Message générique : on ne révèle pas si l'email existe.
      if (e.response?.statusCode == 401) throw ApiException(l10n.emailOuMotDePasse);
      throw ApiException.fromDio(e);
    }
  }

  /// Inscription : le serveur crée toujours un compte passager.
  /// N'est appelée qu'après la case de consentement cochée (écran 3) ;
  /// le serveur enregistre la version des CGU acceptée (preuve RGPD).
  Future<AuthTokens> signup(String email, String password) async {
    try {
      final res = await _dio.post<Object?>('/api/v1/auth/signup', data: {
        'email': email.trim(),
        'password': password,
        'acceptTerms': true,
        'termsVersion': termsVersion,
      });
      return AuthTokens.fromJson(res.data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Ne révoque que la session de cet appareil (Module 2).
  Future<void> logout(String accessToken) async {
    try {
      await _dio.post<void>(
        '/api/v1/auth/logout',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
    } on DioException {
      // Hors ligne ou jeton déjà expiré : la session locale est effacée quand même.
    }
  }
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService(ref.watch(plainDioProvider)));

enum RefreshResult {
  /// Nouveaux jetons enregistrés.
  ok,

  /// Refresh token refusé (révoqué, expiré) : la session est terminée.
  invalid,

  /// Serveur injoignable : on ne déconnecte pas pour une coupure réseau.
  offline,
}

/// Rotation du refresh token (Module 2 : un refresh token ne sert qu'une
/// fois). Une seule rotation à la fois : des requêtes simultanées qui
/// reçoivent toutes un 401 attendent la même rotation, sinon la deuxième
/// utiliserait un refresh token déjà consommé et serait déconnectée.
class TokenRefresher {
  TokenRefresher(this._dio, this._tokens);

  final Dio _dio;
  final TokenStorage _tokens;
  Future<RefreshResult>? _inFlight;

  Future<RefreshResult> refresh() => _inFlight ??= _doRefresh().whenComplete(() => _inFlight = null);

  Future<RefreshResult> _doRefresh() async {
    final refreshToken = await _tokens.readRefreshToken();
    if (refreshToken == null) return RefreshResult.invalid;
    try {
      final res = await _dio.post<Object?>('/api/v1/auth/refresh', data: {'refreshToken': refreshToken});
      final t = AuthTokens.fromJson(res.data);
      await _tokens.saveTokens(access: t.accessToken, refresh: t.refreshToken);
      return RefreshResult.ok;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 400) {
        await _tokens.clear();
        return RefreshResult.invalid;
      }
      return RefreshResult.offline;
    } on ApiException {
      return RefreshResult.offline;
    }
  }
}

final tokenRefresherProvider = Provider<TokenRefresher>(
  (ref) => TokenRefresher(ref.watch(plainDioProvider), ref.watch(tokenStorageProvider)),
);
