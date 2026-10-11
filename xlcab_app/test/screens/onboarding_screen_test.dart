import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/router.dart';
import 'package:xlcab_app/services/auth_service.dart';
import 'package:xlcab_app/services/preferences_store.dart';
import 'package:xlcab_app/services/token_storage.dart';
import 'package:xlcab_app/theme/app_theme.dart';
import 'package:xlcab_app/widgets/primary_button.dart';
import 'package:xlcab_app/widgets/xlcab_logo.dart';

import '../support/auth_fakes.dart';

// Écran 2 — Onboarding : premier lancement seulement, puis connexion.

late MemoryTokenStorage storage;
late MemoryPreferencesStore prefs;

Future<void> pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tokenStorageProvider.overrideWithValue(storage),
        authServiceProvider.overrideWithValue(FakeAuthService()),
        tokenRefresherProvider.overrideWithValue(FakeTokenRefresher(storage)),
        preferencesStoreProvider.overrideWithValue(prefs),
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
    prefs = MemoryPreferencesStore();
  });

  testWidgets('premier lancement : les 3 pages, puis la connexion ; mémorisé', (tester) async {
    await pumpApp(tester);
    expect(find.text('Navettes 7+ places'), findsOneWidget);
    expect(find.byType(XlcabLogo), findsOneWidget);

    await tester.tap(find.widgetWithText(PrimaryButton, 'Suivant'));
    await tester.pumpAndSettle();
    expect(find.text('Trajets 60 km+'), findsOneWidget);

    await tester.tap(find.widgetWithText(PrimaryButton, 'Suivant'));
    await tester.pumpAndSettle();
    expect(find.text('Colis inclus'), findsOneWidget);
    expect(find.text('Passer'), findsNothing);

    await tester.tap(find.widgetWithText(PrimaryButton, 'Commencer'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(PrimaryButton, 'Se connecter'), findsOneWidget);
    expect(prefs.onboardingSeen, isTrue);
  });

  testWidgets('« Passer » mène directement à la connexion', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('Passer'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(PrimaryButton, 'Se connecter'), findsOneWidget);
    expect(prefs.onboardingSeen, isTrue);
  });

  testWidgets('déjà vu : la connexion directement', (tester) async {
    prefs = MemoryPreferencesStore(onboardingSeen: true);
    await pumpApp(tester);
    expect(find.widgetWithText(PrimaryButton, 'Se connecter'), findsOneWidget);
  });

  testWidgets('accessibilité (Partie 5)', (tester) async {
    final handle = tester.ensureSemantics();
    await pumpApp(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    handle.dispose();
  });
}
