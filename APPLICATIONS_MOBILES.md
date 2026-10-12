# XLCAB — les deux applications mobiles

Guide de prise en main pour un développeur. Les règles du projet et l'historique des décisions sont
dans `CLAUDE.md` ; le plan de la séparation en deux applis est dans `PLAN_DEUX_APPLIS.md`.

## Organisation

```
C:\xlcab
├─ pubspec.yaml         espace de travail Dart : une seule résolution de paquets
├─ apps/passenger/      « XLCAB »         com.xlcab.passenger   (paquet xlcab_passenger)
├─ apps/driver/         « XLCAB Driver »  com.xlcab.driver      (paquet xlcab_driver)
├─ packages/core/       client API, connexion, modèles, traductions (paquet xlcab_core)
├─ packages/ui/         thème, widgets, écrans communs, polices (paquet xlcab_ui)
└─ xlcab_backend/       API NestJS commune aux deux applis
```

Règles de dépendance : `core` ne dépend de rien d'autre ; `ui` dépend de `core` ; chaque appli dépend de
`core` et `ui` ; les deux applis ne s'importent jamais l'une l'autre.

| | XLCAB (passager) | XLCAB Driver |
|---|---|---|
| Barre du bas | Accueil, Trajets, Colis, Impact, Compte | Aujourd'hui, Départ, Revenus, Profil |
| Qui se connecte | tout compte (un chauffeur peut voyager) | compte chauffeur ; sinon candidature seulement |
| Position en arrière-plan | non | oui (chauffeur en ligne) |
| Permission caméra, lecteur de QR | non | oui |
| Stripe, carte Google | oui | non |

## Prérequis

- Flutter ≥ 3.27 (le projet est développé avec 3.47), JDK 17, SDK Android.
- L'API locale : voir `demo/start-demo.ps1` (PostgreSQL, Redis, `npm run start:dev` dans `xlcab_backend`).

## Commandes

```bash
# À la racine : résout les paquets des quatre membres
flutter pub get

# Analyse (à lancer dans chaque paquet)
cd packages/core   && flutter analyze .
cd packages/ui     && flutter analyze .
cd apps/passenger  && flutter analyze .
cd apps/driver     && flutter analyze .

# Tests (dans le paquet concerné)
flutter test

# APK de test, API locale via `adb reverse tcp:3000 tcp:3000`
cd apps/passenger && flutter build apk --debug --dart-define=API_BASE_URL=http://localhost:3000
cd apps/driver    && flutter build apk --debug --dart-define=API_BASE_URL=http://localhost:3000
```

En version publiée, `API_BASE_URL` doit être en https.

## Traductions

Un seul catalogue pour les deux applis : `packages/core/lib/l10n/app_fr.arb` (référence) et `app_en.arb`.
Toute nouvelle clé va dans LES DEUX fichiers, puis `flutter gen-l10n` dans `packages/core`.
Aucun texte affiché en dur dans le code : `l10n.maCle`.

## Clés et secrets (jamais dans Git)

| Clé | Appli | Où la mettre |
|---|---|---|
| Google Maps (mobile) | passager | `apps/passenger/android/local.properties` → `MAPS_API_KEY=…` ; iOS : `ios/Flutter/Secrets.xcconfig` → `GOOGLE_MAPS_API_KEY=…` |
| Google Places (recherche d'adresse) | les deux | `--dart-define=GOOGLE_MAPS_API_KEY=…` à la compilation |
| Stripe publiable `pk_test_…` | passager | `--dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_…` |
| Stripe secrète, webhook, Google Routes | serveur | `xlcab_backend/.env.local` |

Restrictions de la clé Google mobile : applications Android `com.xlcab.passenger` et `com.xlcab.driver`
(avec leur empreinte SHA-1) et leurs identifiants iOS.

Sans clé Google, la carte reste vide et la recherche d'adresse ne propose que les adresses favorites.

Firebase (notifications push) n'est pas encore branché : `flutterfire configure` sera à lancer dans chaque appli.

## Où ajouter du code

- Un écran passager : `apps/passenger/lib/screens/…`, route dans `apps/passenger/lib/router.dart`.
- Un écran chauffeur : `apps/driver/lib/screens/…`, route dans `apps/driver/lib/router.dart`.
- Les chemins de routes sont des constantes de `packages/core/lib/routes.dart`.
- Un modèle, un appel d'API utilisé par les deux applis : `packages/core`.
- Un widget ou un écran commun, une couleur : `packages/ui`.
- Aller à un onglet : `context.go(...)`, jamais `context.push(...)`.

## Côté serveur

Toute route réservée aux chauffeurs porte `@Roles('driver')`. Le test
`xlcab_backend/src/security/role-separation.spec.ts` échoue si une route chauffeur perd cette restriction
ou si une nouvelle route chauffeur n'est pas déclarée dans sa liste.
