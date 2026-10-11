import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/router.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/auth_service.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_core/services/token_storage.dart';
import 'package:xlcab_ui/theme/app_theme.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';

import '../support/auth_fakes.dart';

// Parcours de connexion avec le VRAI routeur de l'app : splash →
// connexion → accueil, selon l'état d'authentification.

late MemoryTokenStorage storage;
late FakeAuthService service;
late FakeTokenRefresher refresher;

Future<void> pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 4200);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(storage),
        authServiceProvider.overrideWithValue(service),
        tokenRefresherProvider.overrideWithValue(refresher),
        // Onboarding déjà vu : ces tests portent sur la connexion.
        preferencesStoreProvider.overrideWithValue(MemoryPreferencesStore(onboardingSeen: true)),
      ],
      child: Consumer(
        builder: (context, ref, _) => MaterialApp.router(
          theme: AppTheme.light,
          locale: const Locale('fr'),
          supportedLocales: const [Locale('fr')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: ref.watch(routerProvider),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    storage = MemoryTokenStorage();
    service = FakeAuthService();
    refresher = FakeTokenRefresher(storage);
  });

  testWidgets('non connecté : le splash mène à la connexion (plus de blocage)', (tester) async {
    await pumpApp(tester);
    expect(find.widgetWithText(PrimaryButton, 'Se connecter'), findsOneWidget);
  });

  testWidgets('validation : email invalide, mot de passe vide', (tester) async {
    await pumpApp(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'pas-un-email');
    await tester.tap(find.widgetWithText(PrimaryButton, 'Se connecter'));
    await tester.pumpAndSettle();
    expect(find.text('Adresse email invalide'), findsOneWidget);
    expect(find.text('Mot de passe requis'), findsOneWidget);
    expect(service.calls, isEmpty);
  });

  testWidgets('identifiants refusés : message générique', (tester) async {
    service.error = const ApiException('Email ou mot de passe incorrect.');
    await pumpApp(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'lea@x.fr');
    await tester.enterText(find.widgetWithText(TextFormField, 'Mot de passe'), 'mauvais');
    await tester.tap(find.widgetWithText(PrimaryButton, 'Se connecter'));
    await tester.pumpAndSettle();
    expect(find.text('Email ou mot de passe incorrect.'), findsOneWidget);
  });

  testWidgets('connexion réussie : redirection vers l’accueil', (tester) async {
    service.next = AuthTokens(fakeJwt({'sub': 'u1', 'role': 'passenger'}), 'r');
    await pumpApp(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'lea@x.fr');
    await tester.enterText(find.widgetWithText(TextFormField, 'Mot de passe'), 'secret123');
    await tester.tap(find.widgetWithText(PrimaryButton, 'Se connecter'));
    await tester.pumpAndSettle();

    expect(find.text('Bonjour'), findsOneWidget); // écran d'accueil
    expect(storage.refresh, 'r');
  });

  testWidgets('inscription : 8 caractères minimum et consentement obligatoire (non pré-coché)', (tester) async {
    service.next = AuthTokens(fakeJwt({'sub': 'u2', 'role': 'passenger'}), 'r');
    await pumpApp(tester);
    await tester.tap(find.text('Créer un compte'));
    await tester.pumpAndSettle();

    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value, isFalse);
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'new@x.fr');
    await tester.enterText(find.widgetWithText(TextFormField, 'Mot de passe'), 'court');
    await tester.tap(find.widgetWithText(PrimaryButton, 'Créer mon compte'));
    await tester.pumpAndSettle();
    expect(find.text('Le mot de passe doit contenir au moins 8 caractères'), findsOneWidget);
    expect(find.text('Vous devez accepter les conditions pour créer un compte.'), findsOneWidget);
    expect(service.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'Mot de passe'), 'secret123');
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.widgetWithText(PrimaryButton, 'Créer mon compte'));
    await tester.pumpAndSettle();
    expect(service.calls, ['signup:new@x.fr']);
    expect(find.text('Bonjour'), findsOneWidget);
  });

  testWidgets('afficher / masquer le mot de passe', (tester) async {
    await pumpApp(tester);
    final field = find.descendant(of: find.widgetWithText(TextFormField, 'Mot de passe'), matching: find.byType(EditableText));
    expect(tester.widget<EditableText>(field).obscureText, isTrue);
    await tester.tap(find.byTooltip('Afficher le mot de passe'));
    await tester.pump();
    expect(tester.widget<EditableText>(field).obscureText, isFalse);
  });

  testWidgets('déconnexion depuis le profil : retour à l’écran de connexion', (tester) async {
    storage
      ..access = fakeJwt({'sub': 'u1', 'role': 'passenger'})
      ..refresh = 'r';
    refresher.result = RefreshResult.offline;
    await pumpApp(tester);
    expect(find.text('Bonjour'), findsOneWidget);

    await tester.tap(find.byTooltip('Mon profil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Se déconnecter'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(PrimaryButton, 'Se connecter'), findsOneWidget);
    expect(storage.refresh, isNull);
  });

  testWidgets('accessibilité : zones tactiles, libellés, contraste', (tester) async {
    await pumpApp(tester);
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
