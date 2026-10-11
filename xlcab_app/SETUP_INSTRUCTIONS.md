# XLCAB — Module 1 : mise en place

Ces fichiers ont été générés dans un environnement sans SDK Flutter.
Pour les intégrer dans votre vrai projet (local ou via Claude Code CLI) :

## 1. Créer le projet Flutter (à lancer dans VOTRE terminal)

```bash
flutter create xlcab_app --org com.xlcab --platforms ios,android
cd xlcab_app
```

## 2. Copier les fichiers fournis

Remplacez/ajoutez dans votre projet fraîchement créé :

- `pubspec.yaml` (remplace celui généré par `flutter create`)
- `lib/` entier (theme/, config/, providers/, screens/, router.dart,
  app.dart, main.dart)

## 3. Installer les dépendances

```bash
flutter pub get
```

## 4. Polices

Le thème référence Poppins et Inter en polices locales
(`assets/fonts/...`). Téléchargez-les (Google Fonts) et placez les
fichiers `.ttf` aux emplacements déclarés dans `pubspec.yaml`, ou
remplacez temporairement par `google_fonts` si vous préférez ne pas
embarquer les fichiers.

## 4 bis. Clés Google (Maps + Places)

Deux clés distinctes, créées dans la console Google Cloud (projet avec
facturation activée) :

| Clé | APIs à activer | Restriction | Où la mettre |
|---|---|---|---|
| **Mobile** | Maps SDK for Android, Maps SDK for iOS, Places API (New) | Applications Android `com.xlcab.xlcab_app` (+ empreinte SHA-1) et iOS (bundle ID) | voir ci-dessous |
| **Serveur** | Routes API | Adresse IP du serveur | `GOOGLE_MAPS_API_KEY` dans `xlcab_backend/.env` |

Clé mobile, trois emplacements (aucun n'est versionné) :

- Android : `android/local.properties` → `MAPS_API_KEY=...`
- iOS : créer `ios/Flutter/Secrets.xcconfig` → `GOOGLE_MAPS_API_KEY=...`
- Autocomplétion d'adresses (code Dart) :
  `flutter run --dart-define=GOOGLE_MAPS_API_KEY=... --dart-define=API_BASE_URL=http://10.0.2.2:3000`

## 4 ter. Paiement Stripe

Compte Stripe à créer par XLCAB (mode test d'abord). Trois clés :

| Clé | Où |
|---|---|
| Publiable `pk_test_…` | app : `--dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...` |
| Secrète `sk_test_…` | `xlcab_backend/.env` → `STRIPE_SECRET_KEY` (jamais dans l'app) |
| Webhook `whsec_…` | `xlcab_backend/.env` → `STRIPE_WEBHOOK_SECRET` |

Webhook à déclarer dans le tableau de bord Stripe :
`https://api.xlcab.com/api/v1/webhooks/stripe`, événements
`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
En local : `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe`.

Apple Pay : identifiant marchand (`--dart-define=APPLE_MERCHANT_ID=merchant.com.xlcab`)
et capacité « Apple Pay » dans Xcode. Google Pay : activé côté Stripe.

## 5. Firebase

```bash
dart pub global activate flutterfire_cli
flutterfire configure
```

Puis décommentez les lignes Firebase dans `lib/main.dart`.

## 6. Vérifier que tout compile

```bash
flutter analyze
flutter run
```

Vous devriez atterrir sur l'écran Splash, qui redirige vers Login
(aucune session stockée) — comportement attendu à ce stade, avant
implémentation du Module 2 (Auth backend) et du Module 5 (écran Home).

## Statut des écrans

Tous les écrans listés dans la Partie 7 sont routés (go_router) mais
encore en placeholder, à l'exception de ceux qui seront construits
dans les modules suivants dans cet ordre (Partie 9) :

- Module 5 → Home
- Module 6 → Réservation passager
- Module 7 → Suivi temps réel
- Module 8 → Onboarding chauffeur

## Prochaine étape

Dites-moi si ce Module 1 vous convient (structure, thème, config des
juridictions, routing) — je passe ensuite au **Module 2 : Backend
Auth NestJS** (Partie 10), qui est du code serveur et peut donc être
généré et testé intégralement dans cet environnement, contrairement
au Flutter.
