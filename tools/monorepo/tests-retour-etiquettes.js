// Tests widget : étiquettes de la note et bouton « Réserver le retour ».
const fs = require('fs');
const R = 'C:/xlcab/apps/passenger/test/screens/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('driver_profile_screen_test.dart', [
  [
    "    testWidgets('signalement : motif obligatoire, envoi confirmé', (tester) async {",
    `    testWidgets('étiquettes rapides : proposées à partir de 4 étoiles, envoyées avec la note', (tester) async {
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      await tester.tap(find.byTooltip('3 étoiles'));
      await tester.pump();
      expect(find.text('Conduite sûre'), findsNothing); // note moyenne : pas d'étiquettes

      await tester.tap(find.byTooltip('5 étoiles'));
      await tester.pump();
      await tester.tap(find.text('Conduite sûre'));
      await tester.tap(find.text('Colis bien traité'));
      await tester.tap(find.text('Ponctualité'));
      await tester.tap(find.text('Ponctualité')); // retirée
      await tester.pump();
      await tester.tap(find.widgetWithText(PrimaryButton, 'Envoyer ma note'));
      await tester.pumpAndSettle();
      expect(service.ratings, [(5, '')]);
      expect(service.ratedTags, unorderedEquals(['conduite_sure', 'colis_soigne']));
    });

    testWidgets('étiquettes cochées puis note ramenée à 2 étoiles : aucune étiquette envoyée', (tester) async {
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      await tester.tap(find.byTooltip('5 étoiles'));
      await tester.pump();
      await tester.tap(find.text('Véhicule propre'));
      await tester.tap(find.byTooltip('2 étoiles'));
      await tester.pump();
      await tester.tap(find.widgetWithText(PrimaryButton, 'Envoyer ma note'));
      await tester.pumpAndSettle();
      expect(service.ratedTags, isEmpty);
    });

    testWidgets('signalement : motif obligatoire, envoi confirmé', (tester) async {`,
  ],
]);

edit('payment_screen_test.dart', [
  [
    "    GoRoute(path: AppRoutes.tracking, builder: (_, s) => Scaffold(body: Text('SUIVI ${s.pathParameters['tripId']}'))),\n",
    "    GoRoute(path: AppRoutes.tracking, builder: (_, s) => Scaffold(body: Text('SUIVI ${s.pathParameters['tripId']}'))),\n    // « Réserver le retour » : écrans de destination réduits à ce qu'ils reçoivent.\n    GoRoute(path: AppRoutes.passengerBooking, builder: (_, s) => Scaffold(body: Text(retourRecu('RÉSERVATION ${s.uri.queryParameters['type']}', s.extra)))),\n    GoRoute(path: AppRoutes.lineSearch, builder: (_, s) => Scaffold(body: Text(retourRecu('LIGNES', s.extra)))),\n",
  ],
  [
    "Future<void> pump(WidgetTester tester, {String initial = '/pay'}) async {",
    "String retourRecu(String ecran, Object? extra) =>\n    extra is ReturnTripRequest ? '$ecran : ${extra.origin.address} > ${extra.destination.address} (${extra.seats})' : '$ecran sans retour';\n\n/// Course avec les coordonnées de ses adresses (le retour en a besoin).\nTripDetail locatedTrip(TripStatus status, {String source = 'instant', int? seats = 2}) => TripDetail(\n      id: 'trip-paid',\n      status: status,\n      source: source,\n      shuttleType: ShuttleType.bleue,\n      originAddress: paris.address,\n      originLat: paris.lat,\n      originLng: paris.lng,\n      destinationAddress: rouen.address,\n      destinationLat: rouen.lat,\n      destinationLng: rouen.lng,\n      scheduledAt: DateTime(2026, 10, 12, 14, 30),\n      seats: seats,\n      qrCode: '9b2e0000-0000-4000-8000-0000000000aa',\n      totalCents: 12186,\n    );\n\nFuture<void> pump(WidgetTester tester, {String initial = '/pay'}) async {",
  ],
  [
    "  group('écran 8 — confirmation', () {\n",
    `  group('écran 8 — confirmation', () {
    testWidgets('« Réserver le retour » : adresses inversées, même navette, mêmes passagers', (tester) async {
      trips.tripDetail = locatedTrip(TripStatus.completed);
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      await tester.tap(find.text('Réserver le retour'));
      await tester.pumpAndSettle();
      expect(find.text('RÉSERVATION bleue : \${rouen.address} > \${paris.address} (2)'), findsOneWidget);
    });

    testWidgets('place sur une ligne régulière : le retour ouvre la recherche de lignes', (tester) async {
      trips.tripDetail = locatedTrip(TripStatus.accepted, source: 'line');
      await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
      await tester.tap(find.text('Réserver le retour'));
      await tester.pumpAndSettle();
      expect(find.text('LIGNES : \${rouen.address} > \${paris.address} (2)'), findsOneWidget);
    });

    testWidgets('pas de retour proposé : course annulée, colis, ou sans chauffeur encore', (tester) async {
      for (final trip in [locatedTrip(TripStatus.cancelled), locatedTrip(TripStatus.completed, seats: null), locatedTrip(TripStatus.searching)]) {
        trips.tripDetail = trip;
        await pump(tester, initial: AppRoutes.confirmationFor('trip-paid'));
        expect(find.text('Réserver le retour'), findsNothing);
        await tester.pumpWidget(const SizedBox());
      }
    });

`,
  ],
  ["import 'package:xlcab_passenger/screens/booking/confirmation_screen.dart';", "import 'package:xlcab_passenger/models/return_trip.dart';\nimport 'package:xlcab_passenger/screens/booking/confirmation_screen.dart';"],
]);
console.log('ok');
