// Appli passager : imports, widget des propositions et doubles de test du paiement en ligne.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

edit('apps/passenger/lib/screens/market/line_search_screen.dart', [
  ["import 'package:xlcab_core/models/market.dart';", "import 'package:xlcab_core/models/market.dart';\nimport 'package:xlcab_core/models/payment.dart';"],
  ["import 'package:xlcab_core/services/market_service.dart';", "import 'package:xlcab_core/services/market_service.dart';\nimport 'package:xlcab_core/services/trip_service.dart';"],
  ["import '../../models/return_trip.dart';", "import '../../models/return_trip.dart';\nimport '../../services/payment_service.dart';"],
]);

edit('apps/passenger/lib/screens/market/request_detail_screen.dart', [
  ["import 'package:xlcab_core/models/market.dart';", "import 'package:xlcab_core/models/market.dart';\nimport 'package:xlcab_core/models/payment.dart';"],
  ["import 'package:xlcab_core/services/market_service.dart';", "import 'package:xlcab_core/services/api_service.dart';\nimport 'package:xlcab_core/services/market_service.dart';"],
  ["import 'line_search_screen.dart' show LineResultCard;", "import '../../services/payment_service.dart';\nimport 'line_search_screen.dart' show LineResultCard;"],
  [
    "  const _Offers({required this.requestId, required this.canChoose, required this.onChoose});\n\n  final String requestId;\n  final bool canChoose;\n  final ValueChanged<MarketOffer> onChoose;",
    "  const _Offers({required this.requestId, required this.canChoose, required this.onChoose, required this.onAuthorize});\n\n  final String requestId;\n  final bool canChoose;\n  final ValueChanged<MarketOffer> onChoose;\n\n  /// Rouvre la feuille de paiement d'une proposition dont la carte reste à valider (null : action en cours).\n  final ValueChanged<MarketOffer>? onAuthorize;",
  ],
]);

// Doubles de test (les deux applis partagent MarketService).
for (const app of ['passenger', 'driver']) {
  const f = `apps/${app}/test/support/operator_fakes.dart`;
  let s = fs.readFileSync(R + f, 'utf8');
  if (!s.includes("models/payment.dart")) {
    s = s.replace("import 'package:xlcab_core/models/market.dart';", "import 'package:xlcab_core/models/market.dart';\nimport 'package:xlcab_core/models/payment.dart';");
    if (!s.includes("models/payment.dart")) throw new Error(`${f} : import`);
  }
  const accept = "  Future<void> acceptOffer(String offerId) async => _act('acceptOffer:$offerId');";
  if (!s.includes(accept)) throw new Error(`${f} : acceptOffer`);
  s = s.replace(accept, () => `  Future<OfferChoice> acceptOffer(String offerId) async {
    _act('acceptOffer:$offerId');
    return OfferChoice(payment: choicePayment);
  }

  @override
  Future<void> authorizeOffer(String offerId) async => _act('authorizeOffer:$offerId');

  /// Paiement en ligne activé : feuille de paiement renvoyée au choix d'une proposition / à la réservation.
  PaymentSheetParams? choicePayment;
  PaymentSheetParams? bookingPayment;`);
  if (!s.includes('  Future<String> bookLine(')) throw new Error(`${f} : bookLine`);
  s = s.replace('  Future<String> bookLine(', '  Future<LineBooking> bookLine(');
  if (!s.includes("    return 'trip-1';")) throw new Error(`${f} : retour bookLine`);
  s = s.replace("    return 'trip-1';", "    return LineBooking(tripId: 'trip-1', payment: bookingPayment);");
  fs.writeFileSync(R + f, s);
}
console.log('ok');
