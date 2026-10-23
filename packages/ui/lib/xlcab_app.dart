import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/services/push_service.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/providers/locale_provider.dart';
import 'package:xlcab_core/providers/theme_provider.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_ui/theme/app_theme.dart';

/// Widget racine des applications XLCAB (passager et chauffeur). Branche le
/// routeur de l'application ([router]), les thèmes
/// clair/sombre/système et la langue (fr/en) sur les providers Riverpod.
class XlcabApp extends ConsumerStatefulWidget {
  const XlcabApp({super.key, required this.router, this.title = 'XLCAB', this.pushApp, this.pushTarget});

  /// Routeur de l'application (chaque appli n'enregistre que ses écrans).
  final ProviderListenable<RouterConfig<Object>> router;

  /// Nom affiché par le système (liste des applis récentes).
  final String title;

  /// Notifications push : `passenger` ou `driver` (null : pas de push).
  final String? pushApp;

  /// Écran à ouvrir quand on touche une notification (données du push, dont `type`).
  final String? Function(Map<String, String> data)? pushTarget;

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
    final router = ref.watch(widget.router);
    final themeMode = ref.watch(themeModeProvider);
    final chosen = ref.watch(localeProvider);
    // Thème et langue mémorisés sur l'appareil à chaque changement.
    ref.listen(themeModeProvider, (_, next) => ref.read(preferencesStoreProvider).writeTheme(next));
    ref.listen(localeProvider, (_, next) => ref.read(preferencesStoreProvider).writeLanguage(next?.languageCode));
    // Notifications push : ce téléphone est enregistré pour le compte dès la connexion.
    ref.listen(authProvider.select((s) => s.isAuthenticated), (_, signedIn) {
      final app = widget.pushApp;
      if (!signedIn || app == null) return;
      ref.read(pushControllerProvider).start(
        app: app,
        onOpen: (data) {
          final target = widget.pushTarget?.call(data);
          final config = ref.read(widget.router);
          if (target != null && config is GoRouter) config.push(target);
        },
      );
    });

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
      onGenerateTitle: (_) => widget.title,
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
