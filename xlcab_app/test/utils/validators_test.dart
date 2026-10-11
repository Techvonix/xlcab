import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/services/document_picker.dart';
import 'package:xlcab_app/utils/validators.dart';

void main() {
  group('normalizePhone', () {
    test('numéro français national → international', () {
      expect(normalizePhone('06 12 34 56 78'), '+33612345678');
      expect(normalizePhone('06.12.34.56.78'), '+33612345678');
      expect(normalizePhone('0033612345678'), '+33612345678');
      expect(normalizePhone('+353 87 123 4567'), '+353871234567');
    });

    test('rejette les numéros invalides', () {
      expect(normalizePhone('12345'), isNull);
      expect(normalizePhone('06 12 34'), isNull);
      expect(normalizePhone('abc'), isNull);
    });
  });

  group('normalizePlate', () {
    test('formats saisis → AB-123-CD', () {
      expect(normalizePlate('ab123cd'), 'AB-123-CD');
      expect(normalizePlate('AB 123 CD'), 'AB-123-CD');
      expect(normalizePlate('ab-123-cd'), 'AB-123-CD');
    });

    test('rejette l’ancien format FNI et le reste', () {
      expect(normalizePlate('1234 AB 75'), isNull);
      expect(normalizePlate('AB-12-CD'), isNull);
    });
  });

  test('isFutureDate : aujourd’hui ne compte pas comme une échéance valide', () {
    final now = DateTime(2026, 10, 1, 15);
    expect(isFutureDate(DateTime(2026, 10, 1), now), isFalse);
    expect(isFutureDate(DateTime(2026, 10, 2), now), isTrue);
    expect(isFutureDate(null, now), isFalse);
  });

  group('compressUnderLimit (Partie 9 : 2 Mo max)', () {
    Uint8List bytes(int n) => Uint8List(n);

    test('photo déjà légère : un seul passage', () async {
      final calls = <int>[];
      final out = await compressUnderLimit(bytes(5000000), (b, {required quality, required maxSide}) async {
        calls.add(quality);
        return bytes(800000);
      });
      expect(out.lengthInBytes, 800000);
      expect(calls, [85]);
    });

    test('baisse la qualité puis la taille jusqu’à passer sous 2 Mo', () async {
      final calls = <(int, int)>[];
      final out = await compressUnderLimit(bytes(9000000), (b, {required quality, required maxSide}) async {
        calls.add((quality, maxSide));
        return bytes(quality >= 60 ? 2500000 : 1500000);
      });
      expect(out.lengthInBytes, lessThanOrEqualTo(maxDocumentBytes));
      expect(calls, [(85, 2000), (75, 1600), (60, 1600), (50, 1280)]);
    });

    test('impossible de passer sous 2 Mo : message clair, rien n’est envoyé', () async {
      expect(
        () => compressUnderLimit(bytes(9000000), (b, {required quality, required maxSide}) async => bytes(3000000)),
        throwsA(isA<ApiException>()),
      );
    });
  });
}
