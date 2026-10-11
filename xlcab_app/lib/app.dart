import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/providers/locale_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'router.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

/// Widget racine de XLCAB. Branche le routeur (go_router), les thèmes
/// clair/sombre/système et la langue (fr/en) sur les providers Riverpod.
class XlcabApp extends ConsumerStatefulWidget {
  const XlcabApp({super.key});

  @override
  ConsumerState<XlcabApp> createState() => _XlcabAppState();
}

class _XlcabAppState extends ConsumerState<XlcabApp> with WidgetsBindingObserver {
  String? _shownLanguage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Langue du téléphone modifiée pendant que l'app est ouverte.
  @override
  void didChangeLocales(List<Locale>? locales) => setState(() {});

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final chosen = ref.watch(localeProvider);
    // Thème et langue mémorisés sur l'appareil à chaque changement.
    ref.listen(themeModeProvider, (_, next) => ref.read(preferencesStoreProvider).writeTheme(next));
    ref.listen(localeProvider, (_, next) => ref.read(preferencesStoreProvider).writeLanguage(next?.languageCode));

    // Langue affichée : choix du profil, sinon langue du téléphone (fr → fr,
    // sinon en). Fixée AVANT de construire les écrans, pour que les textes lus
    // hors widgets (l10n global : services, modèles) soient déjà dans la bonne langue.
    final locale = resolveAppLocale(chosen ?? WidgetsBinding.instance.platformDispatcher.locale);
    setAppLocale(locale);
    if (_shownLanguage != null && _shownLanguage != locale.languageCode) {
      // Le routeur conserve ses écrans (clé globale du Navigator) : un widget
      // qui ne dépend d'aucun InheritedWidget (ex. barre de navigation const)
      // garderait son ancien texte. On redessine donc TOUS les éléments.
      WidgetsBinding.instance.addPostFrameCallback((_) => _rebuildAll(context));
    }
    _shownLanguage = locale.languageCode;

    return MaterialApp.router(
      onGenerateTitle: (_) => 'XLCAB',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      locale: locale,
      supportedLocales: appLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}

/// Marque chaque élément de l'arbre à reconstruire (changement de langue).
void _rebuildAll(BuildContext context) {
  if (!context.mounted) return;
  void visit(Element element) {
    element.markNeedsBuild();
    element.visitChildren(visit);
  }

  (context as Element).visitChildren(visit);
}
