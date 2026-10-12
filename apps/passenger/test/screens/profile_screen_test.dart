import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/models/trip.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'package:xlcab_passenger/router.dart';
import 'package:xlcab_passenger/screens/profile/payment_methods_screen.dart';
import 'package:xlcab_passenger/screens/profile/profile_screen.dart';
import 'package:xlcab_passenger/screens/profile/trip_history_screen.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/auth_service.dart';
import 'package:xlcab_passenger/services/booking_service.dart';
import 'package:xlcab_passenger/services/payment_service.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_core/services/token_storage.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

import '../support/auth_fakes.dart';
import '../support/fakes.dart';

// Écran 13 — profil, historique, moyens de paiement, préférences et
// suppression du compte. Serveur, Stripe et liens externes simulés.

late FakeAccountService account;
late FakePresenter presenter;
late FakeHistoryService bookings;
late MemoryTokenStorage storage;
late List<Uri> opened;
late ProviderContainer container;

class FakeHistoryService extends BookingService {
  FakeHistoryService() : super(Dio());

  /// 25 courses : deux pages (20 + 5).
  final List<TripSummary> all = List.generate(
    25,
    (i) => TripSummary(
      id: 'trip-$i',
      shuttleType: ShuttleType.bleue,
      originAddress: 'Paris $i',
      destinationAddress: 'Rouen',
      scheduledAt: DateTime(2026, 9, 30).subtract(Duration(days: i)),
      status: TripStatus.completed,
      totalPriceCents: 12186,
      paidByCompany: i == 1,
    ),
  );
  final List<int> pages = [];

  @override
  Future<List<TripSummary>> history({int limit = 20, int page = 1}) async {
    pages.add(page);
    return all.skip((page - 1) * limit).take(limit).toList();
  }
}

Future<void> pump(WidgetTester tester, {String initial = AppRoutes.profile, String role = 'passenger'}) async {
  tester.view.physicalSize = const Size(1080, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  storage.access = fakeJwt({'sub': 'p1', 'role': role});
  storage.refresh = 'r';
  final refresher = FakeTokenRefresher(storage)..result = RefreshResult.offline;

  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfileScreen()),
    GoRoute(path: AppRoutes.tripHistory, builder: (_, __) => const TripHistoryScreen()),
    GoRoute(path: AppRoutes.paymentMethods, builder: (_, __) => const PaymentMethodsScreen()),
    GoRoute(path: AppRoutes.confirmation, builder: (_, s) => Scaffold(body: Text('DÉTAIL ${s.pathParameters['tripId']}'))),
    GoRoute(path: AppRoutes.driverMode, builder: (_, __) => const Scaffold(body: Text('MODE CHAUFFEUR'))),
  ]);

  container = ProviderContainer(overrides: [
    tokenStorageProvider.overrideWithValue(storage),
    authServiceProvider.overrideWithValue(FakeAuthService()),
    tokenRefresherProvider.overrideWithValue(refresher),
    accountServiceProvider.overrideWithValue(account),
    bookingServiceProvider.overrideWithValue(bookings),
    paymentSheetPresenterProvider.overrideWithValue(presenter),
    preferencesStoreProvider.overrideWithValue(MemoryPreferencesStore()),
    legalLinkOpenerProvider.overrideWithValue((uri) async {
      opened.add(uri);
      return true;
    }),
  ]);
  addTearDown(container.dispose);

  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp.router(
      theme: AppTheme.light,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    ),
  ));
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> expectAccessible(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  setUp(() {
    account = FakeAccountService();
    presenter = FakePresenter();
    bookings = FakeHistoryService();
    storage = MemoryTokenStorage();
    opened = [];
  });

  group('profil', () {
    testWidgets('identité, liens et version', (tester) async {
      await pump(tester);
      expect(find.text('Léa Roux'), findsOneWidget);
      expect(find.text('lea@exemple.fr'), findsOneWidget);
      expect(find.text('Passager'), findsOneWidget);
      expect(find.text('Devenir chauffeur XLCAB'), findsOneWidget);
      expect(find.textContaining('XLCAB version'), findsOneWidget);

      await tap(tester, find.text('Politique de confidentialité'));
      expect(opened.single.path, contains('confidentialite'));
    });

    testWidgets('modifier son nom', (tester) async {
      await pump(tester);
      await tap(tester, find.byTooltip('Modifier mon nom'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Prénom'), 'Léana');
      await tap(tester, find.text('Enregistrer'));
      expect(account.calls, ['name:Léana Roux']);
      expect(find.text('Léana Roux'), findsOneWidget);
    });

    testWidgets('chauffeur : le mode chauffeur renvoie vers l’application XLCAB Driver', (tester) async {
      await pump(tester, role: 'driver');
      await tap(tester, find.text('Mode chauffeur'));
      expect(find.text('Application XLCAB Driver'), findsOneWidget);
    });

    testWidgets('apparence : le thème choisi est appliqué', (tester) async {
      await pump(tester);
      await tap(tester, find.text('Sombre'));
      expect(container.read(themeModeProvider), ThemeMode.dark);
    });

    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      await pump(tester);
      await expectAccessible(tester);
    });
  });

  group('suppression du compte', () {
    Future<void> openDialog(WidgetTester tester) async {
      await pump(tester);
      await tap(tester, find.text('Supprimer mon compte'));
      expect(find.text('Supprimer votre compte ?'), findsOneWidget);
    }

    testWidgets('mot de passe exigé, puis compte effacé et session fermée', (tester) async {
      await openDialog(tester);
      final confirm = find.widgetWithText(FilledButton, 'Supprimer');
      expect(tester.widget<FilledButton>(confirm).onPressed, isNull, reason: 'bouton inactif sans mot de passe');

      await tester.enterText(find.widgetWithText(TextField, 'Mot de passe'), 'MotDePasse!2026');
      await tester.pump();
      await tap(tester, confirm);

      expect(account.calls, ['delete:MotDePasse!2026']);
      expect(storage.access, isNull);
      expect(container.read(authProvider).isAuthenticated, isFalse);
      expect(container.read(authProvider).notice, contains('compte a été supprimé'));
    });

    testWidgets('refus du serveur (réservation à venir) : message, rien n’est effacé', (tester) async {
      account.nextError = const ApiException('Annulez d’abord vos réservations à venir avant de supprimer le compte');
      await openDialog(tester);
      await tester.enterText(find.widgetWithText(TextField, 'Mot de passe'), 'x');
      await tester.pump();
      await tap(tester, find.widgetWithText(FilledButton, 'Supprimer'));
      expect(find.textContaining('Annulez d’abord vos réservations'), findsOneWidget);
      expect(storage.access, isNotNull);
    });

    testWidgets('« Garder mon compte » ne supprime rien', (tester) async {
      await openDialog(tester);
      await tap(tester, find.text('Garder mon compte'));
      expect(account.calls, isEmpty);
    });

    testWidgets('compte entreprise : pas de suppression depuis l’app', (tester) async {
      await pump(tester, role: 'corporate_admin');
      expect(find.text('Supprimer mon compte'), findsNothing);
    });
  });

  group('historique', () {
    testWidgets('liste paginée, course d’entreprise signalée, détail au toucher', (tester) async {
      await pump(tester, initial: AppRoutes.tripHistory);
      expect(find.text('Paris 0 → Rouen'), findsOneWidget);
      expect(find.textContaining('Payé par l’entreprise'), findsOneWidget);

      // Liste paresseuse : on fait défiler jusqu'au bouton de fin de liste.
      final more = find.text('Voir les trajets plus anciens');
      await tester.scrollUntilVisible(more, 400);
      await tap(tester, more);
      expect(bookings.pages, [1, 2]);

      final last = find.text('Paris 24 → Rouen');
      await tester.scrollUntilVisible(last, 400);
      expect(find.text('Voir les trajets plus anciens'), findsNothing);
      await tap(tester, last);
      expect(find.text('DÉTAIL trip-24'), findsOneWidget);
    });

    testWidgets('aucun trajet : message', (tester) async {
      bookings.all.clear();
      await pump(tester, initial: AppRoutes.tripHistory);
      expect(find.text('Aucun trajet pour le moment.'), findsOneWidget);
    });
  });

  group('moyens de paiement', () {
    testWidgets('carte enregistrée affichée sans numéro complet', (tester) async {
      await pump(tester, initial: AppRoutes.paymentMethods);
      expect(find.text('Visa •••• 4242'), findsOneWidget);
      expect(find.text('Expire fin 04/28'), findsOneWidget);
    });

    testWidgets('ajout d’une carte via la feuille Stripe', (tester) async {
      await pump(tester, initial: AppRoutes.paymentMethods);
      await tap(tester, find.text('Ajouter une carte'));
      expect(account.calls, ['setup']);
      expect(presenter.setups.single.setupIntentClientSecret, 'seti_secret');
      expect(find.text('Carte enregistrée.'), findsOneWidget);
    });

    testWidgets('ajout annulé : aucun message', (tester) async {
      presenter.results.add(const PaymentSheetResult(PaymentSheetOutcome.canceled));
      await pump(tester, initial: AppRoutes.paymentMethods);
      await tap(tester, find.text('Ajouter une carte'));
      expect(find.text('Carte enregistrée.'), findsNothing);
    });

    testWidgets('suppression confirmée', (tester) async {
      await pump(tester, initial: AppRoutes.paymentMethods);
      await tap(tester, find.byTooltip('Supprimer la carte Visa se terminant par 4242'));
      await tap(tester, find.widgetWithText(FilledButton, 'Supprimer'));
      expect(account.calls, ['deleteCard:pm_visa']);
      expect(find.text('Visa •••• 4242'), findsNothing);
    });

    testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
      await pump(tester, initial: AppRoutes.paymentMethods);
      await expectAccessible(tester);
    });
  });

  test('préférences : le thème est relu après redémarrage (Hive)', () async {
    final dir = Directory.systemTemp.createTempSync('xlcab_prefs');
    Hive.init(dir.path);
    final box = await Hive.openBox<dynamic>(prefsBoxName);
    await HivePreferencesStore(box).writeTheme(ThemeMode.dark);
    await box.close();

    final reopened = await Hive.openBox<dynamic>(prefsBoxName);
    expect(HivePreferencesStore(reopened).readTheme(), ThemeMode.dark);
    await reopened.close();
    dir.deleteSync(recursive: true);
  });
}
