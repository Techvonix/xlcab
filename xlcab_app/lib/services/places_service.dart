import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/place.dart';
import '../providers/jurisdiction_provider.dart';
import 'api_service.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Clé Google MOBILE (Places API New + Maps SDK), fournie à la compilation :
///   --dart-define=GOOGLE_MAPS_API_KEY=...
/// À restreindre dans la console Google aux applications signées
/// com.xlcab.* : une clé embarquée dans une app peut être extraite.
const String googleMapsApiKey = String.fromEnvironment('GOOGLE_MAPS_API_KEY');

const _autocompleteUrl = 'https://places.googleapis.com/v1/places:autocomplete';
const _detailsUrl = 'https://places.googleapis.com/v1/places';

/// Jeton de session Places : regroupe les frappes d'une même recherche et
/// le détail final en une seule session facturée par Google.
String newPlacesSessionToken() {
  final random = Random.secure();
  return List.generate(32, (_) => random.nextInt(16).toRadixString(16)).join();
}

class PlacesService {
  PlacesService(this._dio, this._apiKey, this._regionCode);

  final Dio _dio;
  final String _apiKey;
  final String _regionCode;

  Options get _options => Options(headers: {'X-Goog-Api-Key': _apiKey});

  void _ensureKey() {
    if (_apiKey.isEmpty) {
      throw ApiException(l10n.rechercheDAdresseIndisponibleCle);
    }
  }

  /// Suggestions pour une saisie partielle, limitées au pays de la
  /// juridiction active (FR au lancement).
  Future<List<PlaceSuggestion>> autocomplete(
    String input, {
    required String sessionToken,
    CancelToken? cancelToken,
  }) async {
    _ensureKey();
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        _autocompleteUrl,
        data: {
          'input': input,
          'sessionToken': sessionToken,
          'languageCode': 'fr',
          'includedRegionCodes': [_regionCode],
        },
        options: _options,
        cancelToken: cancelToken,
      );
      final suggestions = response.data?['suggestions'];
      if (suggestions is! List) return const [];
      return suggestions
          .whereType<Map<String, dynamic>>()
          .map((s) => s['placePrediction'])
          .whereType<Map<String, dynamic>>()
          .map(_toSuggestion)
          .whereType<PlaceSuggestion>()
          .toList();
    } on DioException catch (e) {
      throw _placesError(e);
    }
  }

  /// Coordonnées et adresse complète d'une suggestion choisie.
  Future<Place> details(String placeId, {required String sessionToken}) async {
    _ensureKey();
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_detailsUrl/${Uri.encodeComponent(placeId)}',
        queryParameters: {'sessionToken': sessionToken, 'languageCode': 'fr'},
        options: Options(headers: {
          'X-Goog-Api-Key': _apiKey,
          // Ne demander que les champs utiles (facturation Google au champ).
          'X-Goog-FieldMask': 'id,formattedAddress,location',
        }),
      );
      final data = response.data;
      final location = data?['location'];
      final address = data?['formattedAddress'];
      if (location is! Map || location['latitude'] is! num || location['longitude'] is! num || address is! String) {
        throw ApiException(l10n.adresseIntrouvableEssayezUneAutre);
      }
      return Place(
        address: address,
        lat: (location['latitude'] as num).toDouble(),
        lng: (location['longitude'] as num).toDouble(),
        placeId: placeId,
      );
    } on DioException catch (e) {
      throw _placesError(e);
    }
  }

  PlaceSuggestion? _toSuggestion(Map<String, dynamic> prediction) {
    final placeId = prediction['placeId'];
    final format = prediction['structuredFormat'];
    final fullText = prediction['text'] is Map ? prediction['text']['text'] : null;
    if (placeId is! String) return null;
    final main = format is Map && format['mainText'] is Map ? format['mainText']['text'] : null;
    final secondary = format is Map && format['secondaryText'] is Map ? format['secondaryText']['text'] : null;
    final mainText = main is String ? main : (fullText is String ? fullText : null);
    if (mainText == null) return null;
    return PlaceSuggestion(
      placeId: placeId,
      mainText: mainText,
      secondaryText: secondary is String ? secondary : '',
    );
  }

  ApiException _placesError(DioException e) {
    final network = e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout;
    return ApiException(network
        ? l10n.pasDeConnexionInternetVerifiez
        : l10n.rechercheDAdresseMomentanementIndisponible);
  }
}

final placesServiceProvider = Provider<PlacesService>((ref) {
  // Client HTTP DISTINCT de dioProvider : celui-ci ajoute le jeton JWT
  // XLCAB à chaque requête, qui ne doit jamais partir chez Google.
  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
  ));
  final region = ref.watch(jurisdictionCodeProvider).toLowerCase();
  return PlacesService(dio, googleMapsApiKey, region);
});
