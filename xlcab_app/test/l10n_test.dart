import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/l10n/l10n.dart';
import 'package:xlcab_app/models/shuttle.dart';
import 'package:xlcab_app/screens/onboarding/onboarding_screen.dart';
import 'package:xlcab_app/services/preferences_store.dart';
import 'package:xlcab_app/theme/app_theme.dart';

// Traductions : fichiers ARB complets et cohérents, choix de la langue,
// interface réellement affichée en anglais.

Map<String, dynamic> arb(String locale) => jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync()) as Map<String, dynamic>;

Set<String> placeholders(String message) => RegExp(r'\{(\w+)\}').allMatches(message).map((m) => m.group(1)!).toSet();

void main() {
  tearDown(() => setAppLocale(const Locale('fr')));

  test('chaque texte français a sa traduction anglaise, sans paramètre inconnu', () {
    final fr = arb('fr'), en = arb('en');
    final keys = fr.keys.where((k) => !k.startsWith('@'));
    for (final key in keys) {
      expect(en.containsKey(key), isTrue, reason: 'Traduction anglaise manquante : $key');
      // Une traduction peut omettre un paramètre (accord français), jamais en inventer un.
      expect(placeholders(fr[key] as String).containsAll(placeholders(en[key] as String)), isTrue, reason: 'Paramètre inconnu : $key');
      expect((en[key] as String).trim(), isNotEmpty, reason: 'Traduction vide : $key');
    }
    expect(en.keys.where((k) => !k.startsWith('@') && !fr.containsKey(k)), isEmpty, reason: 'Clés anglaises orphelines');
  });

  test('langue affichée : français pour le français, anglais pour toute autre langue (irlandais compris)', () {
    expect(resolveAppLocale(const Locale('fr', 'BE')), const Locale('fr'));
    expect(resolveAppLocale(const Locale('en', 'IE')), const Locale('en'));
    expect(resolveAppLocale(const Locale('ga')), const Locale('en'));
    expect(resolveAppLocale(const Locale('de')), const Locale('en'));
    expect(resolveAppLocale(null), const Locale('en'));
  });

  test('textes hors écran (modèles, services) : suivent la langue courante', () {
    expect(ShuttleType.rose.label, 'Navette Rose');
    setAppLocale(const Locale('en'));
    expect(ShuttleType.rose.label, 'Pink Shuttle');
    expect(l10n.passager(2, 's'), '2 passengers');
    setAppLocale(const Locale('fr'));
    expect(l10n.passager(2, 's'), '2 passagers');
  });

  testWidgets('écran en anglais de bout en bout (onboarding)', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(ProviderScope(
      overrides: [preferencesStoreProvider.overrideWithValue(MemoryPreferencesStore())],
      child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('en'),
        supportedLocales: appLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        // Même branchement que app.dart.
        builder: (context, child) {
          setAppLocale(Localizations.localeOf(context));
          return child!;
        },
        home: const OnboardingScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('7+ seat shuttles'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
    expect(find.text('Navettes 7+ places'), findsNothing);
  });
}
