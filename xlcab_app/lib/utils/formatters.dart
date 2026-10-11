import 'package:intl/intl.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Nombre décimal dans la langue de l'interface : 4,9 en français, 4.9 en
/// anglais. [digits] chiffres après la virgule au plus (0 si entier).
String formatDecimal(double value, {int digits = 1, bool keepDigits = false}) {
  final pattern = keepDigits ? '0.${'0' * digits}' : '0.${'#' * digits}';
  return NumberFormat(pattern, l10n.localeName).format(value);
}

// Nécessite initializeDateFormatting() au démarrage (fait dans main.dart).

/// Montant en centimes → "121,50 €" (format de la langue affichée).
String formatPrice(int cents, {String currency = 'EUR', String locale = 'fr'}) {
  return NumberFormat.simpleCurrency(locale: locale, name: currency).format(cents / 100);
}

/// Distance → "135,4 km".
String formatDistance(double km, {String locale = 'fr'}) {
  return '${NumberFormat('#,##0.#', locale).format(km)} km';
}

/// Durée en minutes → "1 h 37", "45 min".
String formatDuration(int minutes) {
  if (minutes < 60) return '$minutes min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '$h h' : '$h h ${m.toString().padLeft(2, '0')}';
}

/// Date d'un trajet → "jeu. 1 oct. · 14:30".
String formatTripDate(DateTime date, {String locale = 'fr'}) {
  final day = DateFormat.MMMEd(locale).format(date);
  final time = DateFormat.Hm(locale).format(date);
  return '$day · $time';
}
