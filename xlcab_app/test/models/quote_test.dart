import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/models/quote.dart';
import 'package:xlcab_app/services/api_service.dart';

DioException _httpError(int status, Object? body) {
  final options = RequestOptions(path: '/x');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

void main() {
  group('PassengerQuote.fromJson', () {
    test('lit la réponse du backend (TVA ventilée)', () {
      final quote = PassengerQuote.fromJson({
        'distanceKm': 135.4,
        'durationMin': 60,
        'priceCents': 12986,
        'vatCents': 160,
        'totalCents': 13146,
        'currency': 'EUR',
        'vatLines': [
          {'regime': 'passenger', 'baseCents': 12186, 'ratePercent': 0, 'vatCents': 0},
          {'regime': 'parcel', 'baseCents': 800, 'ratePercent': 20, 'vatCents': 160},
        ],
      });
      expect(quote.totalCents, 13146);
      expect(quote.vatLines.last.isParcel, isTrue);
      expect(quote.vatLines.last.ratePercent, 20.0);
    });

    test('rejette une réponse incomplète', () {
      expect(() => PassengerQuote.fromJson({'totalCents': 1}), throwsFormatException);
    });
  });

  group('ApiException.fromDio', () {
    test('affiche le message métier du serveur (400)', () {
      final e = ApiException.fromDio(_httpError(400, {'statusCode': 400, 'message': 'Distance minimale : 60 km'}));
      expect(e.message, 'Distance minimale : 60 km');
    });

    test('reste générique pour les erreurs de validation (tableau de messages techniques)', () {
      final e = ApiException.fromDio(_httpError(400, {'message': ['seats must not be greater than 7']}));
      expect(e.message, isNot(contains('seats')));
    });

    test("ne relaie pas le message d'une erreur 500", () {
      final e = ApiException.fromDio(_httpError(500, {'message': 'TypeError at line 42'}));
      expect(e.message, 'Service momentanément indisponible. Réessayez plus tard.');
    });

    test('session expirée (401)', () {
      expect(ApiException.fromDio(_httpError(401, null)).message, contains('session a expiré'));
    });
  });
}
