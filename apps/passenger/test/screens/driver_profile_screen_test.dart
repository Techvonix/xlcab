import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/models/driver_public_profile.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_passenger/screens/booking/driver_profile_screen.dart';
import 'package:xlcab_ui/screens/address_search_screen.dart' show addressPickerProvider;
import 'package:xlcab_passenger/screens/profile/notification_preferences_screen.dart';
import 'package:xlcab_passenger/screens/profile/saved_addresses_screen.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_ui/theme/app_theme.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

// Écran 10 (profil chauffeur, note, signalement) et écran 13 (adresses
// favorites, notifications). Serveur simulé.

class FakeFeedbackService extends FeedbackService {
  FakeFeedbackService() : super(Dio());

  DriverPublicProfile profile = const DriverPublicProfile(
    firstName: 'Nadia',
    rating: 4.5,
    ratingCount: 12,
    totalTrips: 42,
    languages: ['fr', 'en'],
    pmrTrained: true,
    vehicle: PublicVehicle(brand: 'Renault', model: 'Trafic', color: 'Blanc', plate: 'AB-123-CD', shuttleType: ShuttleType.rose, capacity: 8, dashcamActive: true),
    canRate: true,
  );
  Object? profileError;
  final List<(int, String?)> ratings = [];
  List<String> ratedTags = const [];
  final List<(ReportReason, String?)> reports = [];
  final List<SavedAddress> saved = [];
  final List<Map<String, bool>> preferenceChanges = [];
  NotificationPreferences prefs = const NotificationPreferences();

  @override
  Future<DriverPublicProfile> driverProfile(String tripId) async {
    if (profileError != null) throw profileError!;
    return profile;
  }

  @override
  Future<void> rate(String tripId, int stars, {String? comment, List<String> tags = const []}) async {
    ratings.add((stars, comment));
    ratedTags = tags;
    profile = profile.copyWith(myRating: stars, canRate: false);
  }

  @override
  Future<void> report(String tripId, ReportReason reason, {String? details}) async => reports.add((reason, details));

  @override
  Future<List<SavedAddress>> addresses() async => List.of(saved);

  @override
  Future<SavedAddress> saveAddress({required String label, required String address, required double lat, required double lng}) async {
    final a = SavedAddress(id: 'a${saved.length}', label: label, address: address, lat: lat, lng: lng);
    saved.add(a);
    return a;
  }

  @override
  Future<void> deleteAddress(String id) async => saved.removeWhere((a) => a.id == id);

  @override
  Future<NotificationPreferences> preferences() async => prefs;

  @override
  Future<NotificationPreferences> updatePreferences(Map<String, bool> changes) async {
    preferenceChanges.add(changes);
    prefs = NotificationPreferences(
      push: changes['notifyPush'] ?? prefs.push,
      email: changes['notifyEmail'] ?? prefs.email,
      sms: changes['notifySms'] ?? prefs.sms,
      marketing: changes['marketing'] ?? prefs.marketing,
    );
    return prefs;
  }
}

late FakeFeedbackService service;

Future<void> pump(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1170, 3600);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      feedbackServiceProvider.overrideWithValue(service),
      addressPickerProvider.overrideWithValue((context, title) async => const Place(address: '12 rue de la Paix, Paris', lat: 48.869, lng: 2.331)),
    ],
    child: MaterialApp(
      theme: AppTheme.light,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: screen,
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => service = FakeFeedbackService());

  group('Écran 10 — profil chauffeur', () {
    testWidgets('note, trajets, badges, langues, véhicule et plaque', (tester) async {
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      expect(find.text('Nadia'), findsOneWidget);
      expect(find.text('★ 4,5 / 5 · 12 avis'), findsOneWidget);
      expect(find.text('42 trajets réalisés'), findsOneWidget);
      expect(find.text('Dashcam active'), findsOneWidget);
      expect(find.text('Formé à l’accueil PMR'), findsOneWidget);
      expect(find.text('Français, Anglais'), findsOneWidget);
      expect(find.text('Navette Rose'), findsOneWidget);
      expect(find.text('AB-123-CD'), findsOneWidget);
    });

    testWidgets('chauffeur jamais noté : « Nouveau chauffeur », pas de fausse note', (tester) async {
      service.profile = const DriverPublicProfile(firstName: 'Paul');
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      expect(find.text('Nouveau chauffeur'), findsOneWidget);
      expect(find.textContaining('★'), findsNothing);
    });

    testWidgets('notation : bouton inactif sans étoile, puis note envoyée et remerciement', (tester) async {
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      final submit = find.widgetWithText(PrimaryButton, 'Envoyer ma note');
      expect(tester.widget<PrimaryButton>(submit).onPressed, isNull);

      await tester.tap(find.byTooltip('4 étoiles'));
      await tester.pump();
      expect(find.text('Bien'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'Un commentaire ? (facultatif)'), 'Très ponctuelle');
      await tester.tap(submit);
      await tester.pumpAndSettle();

      expect(service.ratings, [(4, 'Très ponctuelle')]);
      expect(find.text('Vous avez donné 4 / 5'), findsOneWidget);
    });

    testWidgets('étiquettes rapides : proposées à partir de 4 étoiles, envoyées avec la note', (tester) async {
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

    testWidgets('signalement : motif obligatoire, envoi confirmé', (tester) async {
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      await tester.tap(find.text('Signaler un problème'));
      await tester.pumpAndSettle();
      expect(find.text('En cas de danger immédiat, appelez le 112.'), findsOneWidget);
      final send = find.widgetWithText(FilledButton, 'Envoyer');
      expect(tester.widget<FilledButton>(send).onPressed, isNull);

      await tester.tap(find.text('Conduite dangereuse'));
      await tester.pump();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(service.reports.single.$1, ReportReason.conduite);
      expect(find.textContaining('Signalement envoyé'), findsOneWidget);
    });

    testWidgets('course d’un autre ou sans chauffeur : message du serveur et « Réessayer »', (tester) async {
      service.profileError = const ApiException('Chauffeur introuvable pour cette course');
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      expect(find.text('Chauffeur introuvable pour cette course'), findsOneWidget);
      expect(find.text('Réessayer'), findsOneWidget);
    });

    testWidgets('accessibilité (Partie 5)', (tester) async {
      final handle = tester.ensureSemantics();
      await pump(tester, const DriverProfileScreen(tripId: 't1'));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });

  group('Écran 13 — adresses favorites', () {
    testWidgets('ajout (recherche puis nom), liste, suppression confirmée', (tester) async {
      await pump(tester, const SavedAddressesScreen());
      expect(find.textContaining('Enregistrez vos adresses habituelles'), findsOneWidget);

      await tester.tap(find.widgetWithText(PrimaryButton, 'Ajouter une adresse'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ActionChip, 'Maison'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Enregistrer'));
      await tester.pumpAndSettle();
      expect(service.saved.single.label, 'Maison');
      expect(find.text('12 rue de la Paix, Paris'), findsOneWidget);

      await tester.tap(find.byTooltip('Supprimer Maison'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Supprimer'));
      await tester.pumpAndSettle();
      expect(service.saved, isEmpty);
    });

    testWidgets('10 adresses : plus d’ajout possible', (tester) async {
      for (var i = 0; i < 10; i++) {
        service.saved.add(SavedAddress(id: 'a$i', label: 'Adresse $i', address: 'Rue $i', lat: 48, lng: 2));
      }
      await pump(tester, const SavedAddressesScreen());
      expect(find.widgetWithText(PrimaryButton, 'Ajouter une adresse'), findsNothing);
      expect(find.textContaining('10 adresses au maximum'), findsOneWidget);
    });
  });

  group('Écran 13 — notifications', () {
    testWidgets('prospection désactivée par défaut ; activation enregistrée', (tester) async {
      await pump(tester, const NotificationPreferencesScreen());
      final marketing = find.widgetWithText(SwitchListTile, 'Offres et nouveautés XLCAB');
      expect(tester.widget<SwitchListTile>(marketing).value, isFalse);

      await tester.tap(marketing);
      await tester.pumpAndSettle();
      expect(service.preferenceChanges, [
        {'marketing': true},
      ]);
      expect(tester.widget<SwitchListTile>(marketing).value, isTrue);
    });

    testWidgets('accessibilité (Partie 5)', (tester) async {
      final handle = tester.ensureSemantics();
      await pump(tester, const NotificationPreferencesScreen());
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });
}
