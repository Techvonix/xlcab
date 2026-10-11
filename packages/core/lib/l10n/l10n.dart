import 'package:flutter/widgets.dart';
import 'generated/app_localizations.dart';

export 'generated/app_localizations.dart';

/// Langues de l'interface. L'irlandais (ga, Partie 9) n'a pas encore de
/// traduction : un compte en « ga » voit l'anglais.
const appLocales = [Locale('fr'), Locale('en')];

/// Langue réellement affichée pour une langue demandée (appareil ou compte) :
/// français pour le français, anglais pour toute autre langue.
Locale resolveAppLocale(Locale? requested) => requested?.languageCode == 'fr' ? const Locale('fr') : const Locale('en');

AppLocalizations _current = lookupAppLocalizations(const Locale('fr'));

/// Textes de l'interface dans la langue courante. Accessible partout (écrans,
/// services, modèles) ; mis à jour par l'application à chaque changement de
/// langue (app.dart), qui reconstruit alors tout l'arbre des écrans.
AppLocalizations get l10n => _current;

void setAppLocale(Locale locale) => _current = lookupAppLocalizations(resolveAppLocale(locale));
