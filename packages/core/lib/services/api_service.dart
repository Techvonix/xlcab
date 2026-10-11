import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import 'auth_service.dart';
import 'token_storage.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// URL de l'API, fournie à la compilation :
///   flutter run --dart-define=API_BASE_URL=https://api.xlcab.com
/// Par défaut : backend local vu depuis l'émulateur Android.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

/// Erreur réseau traduite en message affichable à l'utilisateur.
class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  factory ApiException.fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return ApiException(l10n.pasDeConnexionInternetVerifiez);
      default:
        break;
    }
    final status = e.response?.statusCode;
    if (status == 401) {
      return ApiException(l10n.votreSessionAExpireReconnectez);
    }
    // Les erreurs métier du backend sont rédigées en français pour
    // l'utilisateur (ex. "Distance minimale : 60 km") : on les affiche
    // telles quelles. Les erreurs de validation (tableau de messages
    // techniques) restent génériques.
    final serverMessage = _serverMessage(e.response?.data);
    if (serverMessage != null && const {400, 409, 429, 503}.contains(status)) {
      return ApiException(serverMessage);
    }
    return ApiException(l10n.serviceMomentanementIndisponibleReessayezPlus);
  }

  static String? _serverMessage(Object? data) {
    if (data is Map && data['message'] is String) {
      final message = (data['message'] as String).trim();
      return message.isEmpty ? null : message;
    }
    return null;
  }

  @override
  String toString() => message;
}

/// Langue de l'interface envoyée au serveur (en-tête X-Locale) : les messages
/// d'erreur reviennent dans cette langue (xlcab_backend/src/i18n).
final localeHeaderInterceptor = InterceptorsWrapper(
  onRequest: (options, handler) {
    options.headers['X-Locale'] = l10n.localeName;
    handler.next(options);
  },
);

final dioProvider = Provider<Dio>((ref) {
  // Partie 8 : "TLS 1.3 + HSTS". Une version publiée ne doit jamais
  // parler à l'API en clair : on refuse de démarrer plutôt que de fuiter
  // des jetons et des positions.
  if (kReleaseMode && !apiBaseUrl.startsWith('https://')) {
    throw StateError('API_BASE_URL doit être en https:// en production');
  }

  final tokens = ref.watch(tokenStorageProvider);
  final refresher = ref.watch(tokenRefresherProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Accept': 'application/json'},
    ),
  );

  dio.interceptors.add(localeHeaderInterceptor);
  dio.interceptors.add(
    InterceptorsWrapper(
      // Jeton d'accès sur chaque requête.
      onRequest: (options, handler) async {
        final token = await tokens.readAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      // Jeton expiré (15 min) : une rotation, puis la requête est rejouée
      // une seule fois. Si le refresh token est refusé, la session est
      // terminée et l'app revient à l'écran de connexion.
      onError: (error, handler) async {
        final request = error.requestOptions;
        if (error.response?.statusCode != 401 || request.extra['retried'] == true) {
          return handler.next(error);
        }
        final result = await refresher.refresh();
        if (result == RefreshResult.ok) {
          final token = await tokens.readAccessToken();
          request.headers['Authorization'] = 'Bearer $token';
          request.extra['retried'] = true;
          // Un FormData (envoi de document) ne se relit pas : on le clone.
          if (request.data is FormData) request.data = (request.data as FormData).clone();
          try {
            return handler.resolve(await dio.fetch<dynamic>(request));
          } on DioException catch (e) {
            return handler.next(e);
          }
        }
        if (result == RefreshResult.invalid) {
          // Lecture différée : authProvider dépend des services, pas de ce client.
          await ref.read(authProvider.notifier).sessionExpired();
        }
        handler.next(error);
      },
    ),
  );
  return dio;
});

/// Erreurs serveur → message affichable : 403 / 404 portent un message
/// destiné à l'utilisateur (compte non validé, ligne introuvable…).
Future<T> guardOperatorCall<T>(Future<T> Function() call) async {
  try {
    return await call();
  } on DioException catch (e) {
    final data = e.response?.data;
    if (const {403, 404}.contains(e.response?.statusCode) && data is Map && data['message'] is String) {
      throw ApiException(data['message'] as String);
    }
    throw ApiException.fromDio(e);
  } on FormatException {
    throw ApiException(l10n.reponseInattendueDuServeurReessayez);
  }
}
