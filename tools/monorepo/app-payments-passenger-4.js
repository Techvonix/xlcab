// Ajuste les tests du paiement en ligne côté passager aux constructeurs réels.
const fs = require('fs');
const R = 'C:/xlcab/apps/passenger/test/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}
edit('screens/market_payments_test.dart', [
  ["      seatsLeft: 5,\n      durationMin: 75,\n      operatorName: 'Djamel Navettes',\n      operatorVerified: true,\n      vehicleLabel: 'Renault Trafic',\n      reasons: const [],", "      seatsLeft: 5,\n      luggage: 10,\n      operatorRatingCount: 0,\n      durationMin: 75,\n      operatorName: 'Djamel Navettes',\n      vehicleLabel: 'Renault Trafic',"],
  ["      market.failOn = 'authorizeOffer';\n      market.nextError = const ApiException('Proposition expirée ou déjà traitée');", "      market.authorizeError = const ApiException('Proposition expirée ou déjà traitée');"],
]);
edit('support/operator_fakes.dart', [
  ["  Future<void> authorizeOffer(String offerId) async => _act('authorizeOffer:$offerId');", "  Future<void> authorizeOffer(String offerId) async {\n    if (authorizeError != null) throw authorizeError!;\n    _act('authorizeOffer:$offerId');\n  }\n\n  /// Refus du serveur à la validation de l'empreinte (proposition expirée…).\n  ApiException? authorizeError;"],
]);
console.log('ok');
