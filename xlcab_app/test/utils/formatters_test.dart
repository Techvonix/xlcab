import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_app/utils/formatters.dart';

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  test('formatPrice : centimes → euros au format français', () {
    final text = formatPrice(12150);
    // On ne teste pas l'espace exacte : intl utilise une espace insécable.
    expect(text, contains('121,50'));
    expect(text, contains('€'));
  });

  test('formatPrice : pas d\'erreur d\'arrondi sur les centimes', () {
    expect(formatPrice(1999), contains('19,99'));
    expect(formatPrice(5), contains('0,05'));
  });

  test('formatTripDate : jour abrégé et heure 24 h', () {
    final text = formatTripDate(DateTime(2026, 10, 1, 14, 30));
    expect(text, contains('14:30'));
    expect(text, contains('oct.'));
  });
}
