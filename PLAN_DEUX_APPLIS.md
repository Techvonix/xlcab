# XLCAB — passage à deux applications (plan à valider)

Rédigé le 11 octobre 2026. **Rien n'est déplacé tant que ce plan n'est pas approuvé.**
Sources : la demande de restructuration (monorepo, deux applis) et la maquette « XLCAB — App design »
(10 écrans). Aucune fonction existante n'est supprimée : tout est déplacé.

## 1. Arborescence cible

```
C:\xlcab
├─ pubspec.yaml            espace de travail Dart (workspace) : une seule résolution de paquets
├─ apps/
│  ├─ passenger/           « XLCAB »         com.xlcab.passenger
│  └─ driver/              « XLCAB Driver »  com.xlcab.driver
├─ packages/
│  ├─ core/                client API, connexion, modèles, traductions, cartes, notifications
│  └─ ui/                  design system : couleurs, typographie, boutons, cartes, logo
├─ xlcab_backend/          inchangé
├─ xlcab_admin/            inchangé
└─ xlcab_corporate/        inchangé
```

`xlcab_app/` disparaît à la fin de la migration, une fois les deux applis vérifiées.

## 2. Où va chaque fichier de `xlcab_app/lib`

### packages/ui
| Aujourd'hui | Remarque |
|---|---|
| `theme/app_colors.dart`, `app_spacing.dart`, `app_theme.dart`, `app_typography.dart` | une seule palette pour les deux applis |
| `widgets/xlcab_logo.dart`, `primary_button.dart`, `price_display.dart`, `shuttle_card.dart`, `date_field.dart`, `driver_avatar.dart`, `eta_progress.dart` | |
| `screens/operator/widgets.dart` (`AsyncBody`, `SectionTitle`, `StatusPill`, `OpCard`, dialogues) | déjà utilisé des deux côtés |
| `screens/accessibility/accessibility_sheet.dart` | |
| `assets/fonts/` | |

### packages/core
| Aujourd'hui | Remarque |
|---|---|
| `services/api_service.dart`, `auth_service.dart`, `token_storage.dart`, `preferences_store.dart` | client API, jetons, rafraîchissement |
| `services/location_service.dart`, `places_service.dart` | position « pendant l'utilisation » seulement |
| `services/trip_service.dart`, `account_service.dart`, `market_service.dart` | appelés par les deux applis |
| `models/*` (14 fichiers) | |
| `providers/auth_provider.dart`, `locale_provider.dart`, `theme_provider.dart`, `jurisdiction_provider.dart` | |
| `l10n/` (ARB français et anglais, classes générées), `config/`, `utils/` | un seul catalogue de textes |
| `screens/auth/login_screen.dart`, `screens/splash/splash_screen.dart` | même écran, titre et rôle attendu en paramètre |

### apps/passenger
| Aujourd'hui | Onglet |
|---|---|
| `screens/home/*`, `screens/onboarding/*` | Accueil |
| `screens/booking/shuttle_selection_screen.dart`, `passenger_booking_screen.dart`, `address_search_screen.dart`, `payment_screen.dart`, `confirmation_screen.dart`, `driver_profile_screen.dart`, `widgets/*` | Accueil → réservation |
| `screens/market/*` (lignes régulières, devis) | Accueil → « Prochaines navettes » |
| `screens/tracking/*` | Trajets → trajet en direct |
| `screens/profile/trip_history_screen.dart` | Trajets |
| `screens/booking/parcel_creation_screen.dart`, `parcel_tracking_screen.dart` | Colis |
| `screens/profile/profile_screen.dart`, `payment_methods_screen.dart`, `saved_addresses_screen.dart`, `notification_preferences_screen.dart` | Compte |
| `screens/corporate/corporate_portal_screen.dart` | Compte |
| `services/booking_service.dart`, `parcel_service.dart`, `payment_service.dart`, `feedback_service.dart`, `tracking_channel.dart` | |
| `providers/booking_provider.dart`, `home_provider.dart`, `tracking_provider.dart` | |
| *(nouveau)* onglet Impact | à créer |

### apps/driver
| Aujourd'hui | Onglet |
|---|---|
| `screens/driver/driver_mode_screen.dart` (découpé), `widgets/offer_card.dart`, `mission_card.dart` | Aujourd'hui |
| `screens/operator/operator_section.dart`, `market_feed_screen.dart`, `offer_messages_sheet.dart` | Aujourd'hui |
| `screens/operator/departure_screen.dart`, `screens/driver/widgets/parcel_checklist.dart` | Départ |
| `screens/operator/my_lines_screen.dart`, `line_form_screen.dart`, `line_detail_screen.dart` | Départ → mes lignes |
| revenus de `driver_mode_screen.dart`, `screens/operator/cancellations_screen.dart` | Revenus |
| `screens/driver/driver_onboarding_screen.dart`, `widgets/document_upload_tile.dart`, `screens/operator/operator_profile_screen.dart` | Profil / inscription |
| `services/driver_channel.dart`, `driver_device.dart`, `driver_mode_service.dart`, `driver_service.dart`, `operator_service.dart`, `document_picker.dart` | |
| `providers/driver_mode_provider.dart`, `driver_onboarding_provider.dart`, `operator_provider.dart` | |
| *(nouveau)* écran « Dossier en cours de validation » | à créer |

Les tests de `xlcab_app/test` suivent leurs fichiers ; `router.dart`, `app.dart`, `main.dart` sont réécrits
dans chaque appli (barre à 5 onglets côté passager, à 4 onglets côté chauffeur).

## 3. Permissions et dépendances par appli

| | XLCAB (passager) | XLCAB Driver |
|---|---|---|
| Position en arrière-plan (`FOREGROUND_SERVICE_LOCATION`, `UIBackgroundModes location`) | non | oui |
| Position pendant l'utilisation | oui | oui |
| Caméra | non | oui (QR, photo de remise, documents) |
| Stripe (`flutter_stripe`) | oui | non |
| Lecteur de QR (`mobile_scanner`), `image_picker` | non | oui |

Écart assumé avec la demande : le paiement par carte reste dans l'appli passager plutôt que dans `core`,
pour ne pas embarquer Stripe dans l'appli chauffeur. Les versements chauffeur (Stripe Connect) passeront
par le serveur.

## 4. Serveur : séparation des rôles

- Déjà en place : tout `/drivers/me/*` et `/operators/me/*` exige le rôle `driver`.
- À ajouter : un test qui parcourt chaque route chauffeur avec un jeton passager (et l'inverse) et exige
  un refus 403.
- À décider : un chauffeur peut-il aussi voyager comme passager avec le même compte ? (voir questions)
- Les cinq rôles actuels sont conservés (`passenger`, `driver`, `corporate_admin`, `corporate_member`,
  `admin`) ; un collaborateur d'entreprise utilise l'appli passager.

## 5. Ce que la maquette ajoute par rapport à l'existant

| Élément de la maquette | État | Ce qu'il faut |
|---|---|---|
| Barre à 5 onglets, barre chauffeur à 4 onglets | à faire | réorganisation d'écrans existants |
| Accueil avec carte et « Prochaines navettes » | partiel | les départs de lignes existent ; liste à brancher |
| Choix du trajet (place partagée / Women+ / van entier) | existe sous un autre nom | navettes Rose, Bleue… et lignes à la place ou au véhicule |
| Colis qui voyage avec moi | existe | — |
| **Choix du siège** | nouveau | numéros de siège côté serveur (migration), lignes à la place seulement |
| Trajet en direct, SOS, statut caméra, message | existe | regroupement en « Espace sécurité » |
| **Partage automatique, contacts de confiance** | nouveau | modèle + lien de suivi public à durée limitée |
| Fin de trajet : note, étiquettes rapides | existe (note, commentaire) | étiquettes à ajouter |
| **Pourboire 100 % chauffeur** | nouveau | dépend de Stripe Connect |
| « Réserver le retour » en un geste | nouveau, simple | — |
| **Impact CO₂, niveaux, défis** | nouveau | méthode de calcul et barème fournis par XLCAB ([X]) |
| Préférences « conductrice », « siège près d'une femme » | nouveau | formulation à valider par l'avocat |
| **Arabe** | nouveau | 3e langue, écriture de droite à gauche sur tous les écrans |
| Chauffeur : en ligne, revenus, embarquement, scan colis | existe | — |
| Chauffeur : « dossier en attente », blocage hors validation | serveur fait | écran à créer |
| **Batterie, score d'éco-conduite** | nouveau | aucune source de données aujourd'hui (boîtier véhicule) |
| Journal des accès aux enregistrements caméra | hors périmètre actuel | XLCAB ne stocke aucune vidéo aujourd'hui |

## 6. Étapes (une à la fois, validation entre chaque)

0. Dépôt Git local + première sauvegarde : filet de sécurité avant de déplacer 110 fichiers.
1. `packages/ui` puis `packages/core` ; l'appli actuelle les utilise, sans changement visible.
2. `apps/passenger` : 5 onglets, écrans déplacés, compilation et essai sur le téléphone.
3. `apps/driver` : 4 onglets, inscription + écran d'attente, permissions, compilation et essai.
4. Suppression de `xlcab_app/`, test serveur de séparation des rôles, mise à jour de la documentation.
5. Nouvelles fonctions de la maquette, une par une, en français d'abord.

Vérification à chaque étape : `flutter analyze` sur chaque paquet, compilation des deux APK, parcours sur
le téléphone de démo. `flutter test` reste impossible sur ce PC (Smart App Control).
