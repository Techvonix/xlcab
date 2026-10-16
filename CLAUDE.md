# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

XLCAB : application de transport hybride (passagers + colis) en navettes 7+ places, trajets 60 km+.
**`XLCAB_MASTER_SPEC.md` est la source de vérité** (modèle de données Partie 4, design system Partie 5,
API REST + contrat WebSocket Partie 6, sécurité Partie 8, modules Partie 9, code de départ Partie 10).
Le code de départ de la Partie 10 contient des failles connues : il sert de point de départ, pas de
référence — les exigences de la Partie 8 priment.

## Règles de travail (Partie 0 de la spec)

- Procéder module par module dans l'ordre de la Partie 9 ; montrer le code de chaque module terminé
  avant de passer au suivant.
- Commentaires en français. Messages d'erreur rédigés en français dans le code ; chacun doit avoir sa
  traduction anglaise dans `xlcab_backend/src/i18n/messages.en.ts` (décision du 2026-10-07, test de complétude).
- Poser des questions si une zone d'ombre persiste plutôt que d'inventer.
- **Module 2 (Auth) est validé et figé** : ne pas modifier `src/auth/**`, `src/prisma/**`,
  `src/redis/**` ni leurs tests sans accord explicite. Les nouveaux modules le réutilisent.

## État d'avancement

- `xlcab_backend/` : NestJS 12 (migré depuis 10 : Express 5, multer 2, @nestjs/config 12 ; Node ≥ 20.19,
  CLI ≥ 22.22/24.15). Paquets Nest en ESM chargés par require(esm). Express 5 : joker nommé dans les
  chemins (`forRoutes('{*path}')`, jamais `'*'`), `?` interdit (`{.:ext}`), parseur de query `simple`
  (pas d'objets imbriqués), `req.body` indéfini sans corps. Ne pas réintroduire d'override `body-parser@1`.
  Jest 30 : `npm test` lance node --experimental-vm-modules (indispensable pour charger les paquets
  ESM) — utiliser `npm test -- <fichier>` / `npm test -- -t "nom"` plutôt que `npx jest` nu.
  Module 2 (Auth) terminé, 19 tests. Module 3 (Tracking WebSocket,
  `src/tracking/`) en relecture : Socket.io sur le chemin `/ws/tracking`, auth JWT dans un middleware
  `server.use` (avant l'acceptation de la connexion), ownership des trajets via `prisma.trip`.
- Module 4 (Matching + dispatch, `src/matching/`) en relecture : `MatchingService` (chauffeurs
  éligibles), `PricingService` (TVA ventilée passager/colis), `DispatchService` (offre à un chauffeur à
  la fois, 30 s, puis suivant), endpoints `POST /trips/match`, `/trips/:id/accept`, `/trips/:id/refuse`.
- Statuts de course (`matching.constants.ts`) : `awaiting_payment → pending → searching → accepted →
  started → completed`, `searching → no_driver` (relançable), `cancelled`.
- Recherche différée : `startMatching` ne sollicite personne si le départ est au-delà de
  T − `DISPATCH_LEAD_MIN` (180 min) ; la course reste `pending` et la réponse porte `dispatchAt`.
  `src/scheduler/` (setInterval 60 s, verrou Redis `scheduler:tick:lock`, `SCHEDULER_ENABLED=false`
  pour couper) lance alors `DispatchService.dispatchDue` (pending entrées dans la fenêtre — y compris
  les courses d'entreprise, que rien ne lançait — et no_driver relancées toutes les 10 min via
  `dispatch:retry:{tripId}`, jusqu'à départ + 15 min) et `PaymentsService.expireUnpaid`
  (awaiting_payment > 30 min ; relit Stripe avant d'annuler). Un paiement arrivé sur une course déjà
  annulée est remboursé intégralement (`markPaid`). `SYSTEM_USER` = identité des actions automatiques.
- Clés Redis partagées entre modules : `drivers:online` (GEO), `driver:seen:{id}` (TTL 30 s),
  `driver:trip:{driverId}` (course active : posée par le dispatch / le démarrage, supprimée par Trips
  en fin de course), `driver:offer:{driverId}` (offre en cours ; contenu dans `dispatch:{tripId}:offer`
  pour la reprise par l'app), `sos:queue`.
- Les timers de 30 s du dispatch vivent en mémoire du processus : valable pour une seule instance.
- Mode chauffeur, backend `src/driver-mode/` (`@Roles('driver')`, `/api/v1/drivers/me/...`) :
  `POST online` (refus 403 motivé : compte non validé, permis/VTC/assurance/CT expiré, dashcam ;
  hors ligne refusé pendant une course `started`, libère l'offre en cours), `GET status` (dont l'offre
  en cours), `GET trips` (téléphone passager seulement à T−60 min ou en course, rien sur les courses
  passées), `GET earnings` (brut TTC, commission 10 % `DRIVER_COMMISSION_PERCENT` calculée sur le HT —
  la TVA colis n'est pas un revenu —, net = HT − commission ; jour/semaine/mois en heure locale). Pas de `POST /drivers/me/location` : positions par WebSocket.
- App, écran 15 (`driver_mode_screen.dart`) : `DriverModeController` (session = `DriverChannel`
  Socket.io + `PositionSource` GPS ; position 10 s, 3 s en course ; offre retirée localement à
  l'échéance ; `load()` au retour au premier plan), QR scanné via `QrScanner` (mobile_scanner),
  itinéraire/appel via `DriverLauncher`. Un compte `driver` atterrit sur `/driver-mode`. Android :
  service de premier plan de geolocator (permissions FOREGROUND_SERVICE_LOCATION, CAMERA) ; iOS :
  `UIBackgroundModes` location. Checklist colis non faite (pas de module Colis).
- Users (`src/users/`) : `GET/PATCH /users/me` (prénom, nom, langue fr|en|ga), `GET /users/me/export`
  (RGPD, 5/jour, sans secrets), `DELETE /users/me` (mot de passe redemandé ; mauvais mot de passe = 403,
  jamais 401 qui déclencherait le rafraîchissement de l'app ; refus si course ouverte ; rôles
  corporate_admin/admin → support ; anonymisation, email `supprime-{id}@anonyme.invalid`, sessions
  `refresh:{id}:*` révoquées par SCAN, client Stripe supprimé, courses et justificatifs conservés).
  `DELETE /auth/account` du Module 2 reste un bouchon (figé) : l'app utilise `DELETE /users/me`.
- `GET /bookings/passenger/history?limit≤50&page` : sans les `awaiting_payment`, champ `paidByCompany`.
- App écran 13 : `profile_screen.dart` (nom modifiable, apparence, liens légaux de `config/legal.dart`
  — URLs à confirmer par XLCAB —, version `APP_VERSION`, suppression du compte),
  `trip_history_screen.dart` (paginé, détail = écran 8), `payment_methods_screen.dart` (cartes Stripe,
  ajout via `PaymentSheetPresenter.presentSetup`). Thème mémorisé dans Hive (boîte `prefs`,
  `PreferencesStore`, écrit par `app.dart`). Photo de profil non faite. Export RGPD dans les DEUX applis
  (2026-10-14) : `src/users/export-link.ts` — `POST /users/me/export/link` (quota du jour vérifié AVANT, pour
  que le 429 s'affiche dans l'app) renvoie un lien `GET /users/export/file?token=` de 5 min, À USAGE UNIQUE
  (nonce dans Redis `users:export:link:{nonce}`), jeton `{userId}.{expiration}.{nonce}.{HMAC}` (clé dérivée de
  JWT_SECRET, rien en base), fichier `xlcab-mes-donnees-AAAA-MM-JJ.json` en pièce jointe, no-store ; compte
  supprimé = 401. App : `AccountService.exportLink()`, tuile partagée `xlcab_ui/widgets/data_export.dart`
  (`DataExportTile` : explication, puis navigateur via `legalLinkOpenerProvider`) dans le Compte passager et le
  Profil chauffeur. Clés ARB `exp*`.
- Module Colis (`src/parcels/`, décisions du porteur de projet) : chaque colis a sa propre course
  (`Trip.type = 'parcel'`, expéditeur = `passengerId`, prépaiement Stripe) + `ParcelBooking`
  (QR d'enlèvement, `deliveryCode` à 4 chiffres connu du seul expéditeur, photo de remise obligatoire,
  5 essais de code puis 429). Trois modes : greffé à l'aller sur une course passager (même trajet à
  3 km près, départ dans les 12 h, 3 colis / 60 kg max, pas de navette PMR ni de course d'entreprise,
  forfait 8 € HT `PricingService.graftedParcel`, course en statut `attached`, jamais dispatchée) ;
  au retour (`onReturnLeg`) sur le trajet B → A d'un chauffeur engagé, départ estimé
  `returnDepartureOf` = aller + durée + 30 min, 5 colis / 100 kg, enlèvement après la course aller
  (jusqu'à 6 h) ; dédié (navette Bleue, tarif km, dispatch normal, démarrage refusé tant que le colis
  n'est pas scanné). Limites 30 kg et 120×80×80 cm. Retour : le chauffeur reste « occupé » pendant
  son trajet retour (`MatchingService.busyDrivers`), sauf pour une course qui suit ce même trajet
  (passagers prioritaires) ; à son acceptation `transferReturnParcels` y déplace les colis. Une
  course qui part de l'arrivée d'une autre n'a pas de marge d'approche d'1 h. Hooks dans Trips
  (démarrage : colis à bord → en transit, colis non remis → incident ; fin : refusée avec un colis à
  bord hors retour ; annulation passager → colis greffés remboursés ; désistement → colis retour
  remboursés). Planificateur : `releaseStranded`. Le chauffeur devient `driverId` de la course colis à
  l'enlèvement : elle compte dans ses revenus. Annulation par l'expéditeur via `/trips/:tripId/cancel`
  (avant enlèvement). Pas de PATCH `/bookings/parcel/:id/cancel` (dépendance circulaire évitée).
- App colis : écran 11 `parcel_creation_screen.dart` (adresses via `addressPickerProvider`, date via
  `pickupDateTimePickerProvider`, injectables), écran 12 `parcel_tracking_screen.dart` (timeline,
  QR, code de remise, annulation, photo), checklist chauffeur `parcel_checklist.dart` ; mission
  `completed` avec colis retour = étape « Retour ». Historique : `parcelId` ouvre le suivi colis.
- Tests widget sur de longs formulaires : agrandir la vue (`physicalSize` haute), les `ListView` sont
  paresseux ; ne pas piloter les sélecteurs natifs date/heure (débordent en test), les injecter.
- Tarifs réglables : table `Tariff` versionnée (jamais modifiée ; date d'effet immédiate ou
  programmée ; motif obligatoire), lue par `PricingService.tariffFor` (cache 30 s vidé à la
  publication ; à défaut `DEFAULT_TARIFF` = grille Partie 10). Admin : `src/admin/tariffs.*`
  (`/api/v1/admin/tariffs`, 2FA ; variation > 30 % → `confirmLargeChange`), page « Tarifs » de
  `xlcab_admin`. Prix figé à la réservation. `sharedParcelCents` (colis navette partagée) distinct de
  `parcelFeeCents` (supplément colis course mixte / dédiée).
- Factures légales : `src/invoices/` (pdfkit, `import PDFDocument = require('pdfkit')`). `Invoice`
  jamais modifiée (avoir `credit_note` sinon), numéro `FA-AAAA-000001` / `AV-AAAA-…` via
  `InvoiceCounter` incrémenté dans la transaction (sans trou). Émission : fin de course particulier
  (`TripsService.complete`, colis partagé à la remise), frais d'annulation (hors champ TVA, à valider),
  remboursement admin → avoir au prorata des taux ; entreprises : facture mensuelle due à 30 j
  (planificateur, clé Redis `invoices:monthly:AAAA-MM`, ou `POST /admin/invoices/monthly`). Vendeur
  figé depuis `INVOICE_SELLER_*` (sinon « [à compléter] » + alerte admin). Accès PDF : client,
  admin de l'entreprise, équipe ; app mobile via `POST /invoices/:id/link` (jeton 5 min, clé dérivée
  de JWT_SECRET) puis `GET /invoices/:id/file?token=`. `DocumentStorage` en mémoire quand
  `NODE_ENV=test`. Secrets backend : `.env.local` (NestJS) ; `.env` ne contient que `DATABASE_URL`
  (le client Prisma charge `.env` dans process.env et écraserait les secrets des tests).
- 2FA obligatoire pour `corporate_admin` (Partie 8) : `TwoFactorGuard` sur tout `CorporateController`
  et `CorporateInvoicesController` (PDF entreprise via `/corporate/invoices/issued/:id/pdf` ; la route
  `/invoices/:id/pdf` ne sert plus que les particuliers). Portail : `TwoFactorGate` (copie de l'admin),
  preuve en cookie HttpOnly, retour à l'écran de code sur `TWO_FACTOR_REQUIRED`. Code 2FA erroné =
  403 `INVALID_TWO_FACTOR_CODE` (jamais 401 : le client se déconnecterait). Tests : preuve via
  `src/testing/two-factor-proof.ts` (`mfaProof`).
- Conformité (`src/compliance/`, passe quotidienne du planificateur, clé `compliance:daily:AAAA-MM-JJ`) :
  documents chauffeur (rappels J−30/J−7 dédupliqués en Redis, mise hors ligne à l'expiration),
  purge des `TrackingPoint` > 30 jours (Partie 13), comptes inactifs depuis 3 ans (rappel J−30 puis
  `UsersService.anonymize` ; jamais avec une course ouverte ; corporate_admin/admin exclus). Dernière
  activité dans `UserActivity` (table séparée, modèle User inchangé), écrite par `ActivityInterceptor`
  (APP_INTERCEPTOR global, au plus 1×/jour/utilisateur).
- Revue de sécurité (2026-10-05) : `src/security/` = limitation de débit globale (middleware par IP
  avant authentification + intercepteur par utilisateur, Redis, fenêtre 1 min, 429 `RATE_LIMITED` ;
  laisse passer si Redis tombe) et `validateEnv` (ConfigModule `validate` : en production l'API refuse
  de démarrer avec des secrets faibles/d'exemple, sans CORS https, sans REDIS_PASSWORD…). CORS HTTP
  en liste blanche `CORS_ORIGINS` (comme le WebSocket). Dépendances inutilisées retirées
  (`@nestjs/swagger`, `nestjs-pino`, `pino`), bcrypt 6 (plus de `tar` vulnérable), `overrides` npm
  (lodash, qs). `npm audit` : 0 vulnérabilité depuis la migration NestJS 12. En-têtes Nginx des portails (CSP, HSTS) : `deploy/nginx/security-headers.conf`.
  APK debug : HTTP en clair autorisé seulement vers localhost/127.0.0.1/10.0.2.2
  (`android/app/src/debug/res/xml/network_security_config.xml`) ; la version publiée l'interdit.
- **Smart App Control de Windows est activé (2026-10-05)** : il bloque `flutter_tester.exe` (non
  signé) → `flutter test` impossible sur cette machine ; `flutter analyze` fonctionne. Ne pas
  modifier ce réglage de sécurité : décision du porteur de projet.
- **Environnement de démo local (2026-10-05)**, tout en portable dans `C:\Users\Admin\dev` (aucun
  service Windows) : PostgreSQL 16 (`pgsql`, données `pgdata`, superutilisateur postgres, mot de passe
  dans `xlcab_backend/.env`), Garnet 2.2 (compatible Redis, à la place de Memurai dont l'installateur
  MSI échoue ici ; exige .NET 8 portable `dotnet` et `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`, sinon
  les distances GEOSEARCH sortent avec une virgule), JDK 17 (`jdk17`), SDK Android (`android-sdk`,
  plateforme 36, NDK 28.2). Relance : `demo/start-demo.ps1`. Toujours lancer pg_ctl / Garnet via
  `Start-Process` détaché (une tâche d'arrière-plan qui expire tue le processus). Migration
  `init_xlcab` appliquée. Comptes : `npx ts-node prisma/seed-demo.ts` (refuse une base non locale ;
  mots de passe dans `xlcab_backend/demo-accounts.local.txt`, ignoré par Git ; dates relatives au lancement :
  le relancer avant une démo ; 3 avis réels sur la chauffeure ; il efface la 2FA des admins de démo, à
  réactiver à la connexion suivante). Vidéos de démo : `demo/videos/` (enregistrement `adb shell screenrecord`,
  pilotage `adb shell input` ; sous Git Bash, `MSYS_NO_PATHCONV=1` pour les chemins /sdcard). Téléphone de démo :
  Oukitel C61 (Android 15) en USB, `adb reverse tcp:3000 tcp:3000`, APK debug compilé avec
  `--dart-define=API_BASE_URL=http://localhost:3000`. 8 Go de RAM : arrêter les portails et
  `gradlew --stop` autour des compilations Android (première compilation ≈ 1 h).
- Bourse de transport (2026-10-09, plan `AUDIT_BOURSE_TRANSPORT.md`, ordre validé : lignes → bourse → écrans
  chauffeur → écrans passager → admin → vidéo ; protocole d'annulation chauffeur à valider :
  `PROTOCOLE_ANNULATION_CHAUFFEUR.md`). XLCAB est LOTI. Étape 1 faite, `src/operators/` : `OperatorProfile`
  (id = User.id du chauffeur, `status` pending|verified|suspended et `perSeatAllowed` posés par l'admin seulement,
  `src/admin/operators.ts`, 2FA ; changer de licence retire `perSeatAllowed`), `RecurringLine` (trajet immuable :
  on ferme et on recrée ; `pricingMode` per_vehicle | per_seat, ce dernier exige `perSeatAllowed`), `LineException`
  (jour fermé / capacité réduite), `LineDeparture` (un par jour et par sens, généré à 30 jours par `sync` à chaque
  modification et chaque jour par le planificateur, clé `lines:daily:AAAA-MM-JJ` ; réservable seulement `open` =
  confirmé par l'opérateur ; un départ avec `seatsBooked` > 0 garde heure et prix). `Vehicle.capacity` = places
  passagers hors conducteur. `reserveSeats`/`releaseSeats` (updateMany conditionnel) pour l'étape 2. Recherche
  `GET /api/v1/lines/search` : règles explicites, `reasons` codées (l'app les traduit), aucune plaque / téléphone /
  e-mail. Heures locales : `src/common/local-time.ts` (partagé avec le mode chauffeur). Migration `operator_lines`.
  CG opérateur (`OperatorProfile.termsAcceptedAt/termsVersion`, `OPERATOR_TERMS_VERSION`) exigées pour publier une
  ligne et condition de toute pénalité.
- Bourse étape 2 (backend fait, migrations `line_bookings_rescue`, `line_backup_vehicle`, `market`). Paiement
  « deferred » (`LINE_PAYMENT_MODE`) : réservation sans encaissement en attendant Stripe Connect, **503 en production**
  (lignes et bourse). `Trip.source` instant|line|market, `lineDepartureId`, `commissionCents` (figée).
  2a `src/line-bookings/` : `POST /lines/bookings` (Trip déjà `accepted` par le chauffeur du départ, une par
  passager et par départ) ; le chauffeur opère le départ en bloc (`/operators/me/departures/:id/manifest|ready|checkin|
  start|complete`, via `TripsService` exporté). Annulation passager → `releaseSeats` (TripsService) ; désistement
  chauffeur d'une course de ligne refusé (il annule le départ). Chauffeur du départ = `LineDeparture.driverId ??
  line.operatorId` (`assignedDriver`).
  2b `rescue.service.ts` (protocole, constantes dans `protocol.constants.ts`) : réserves `LineBackup` rang 2/3
  (invitées par e-mail, acceptent avec un véhicule ≥ places de la ligne) ; défaillance (`cancel`, pas « en route » à
  T−60, 2 contrôles sans `driver:seen` dès T−45) → départ `rescueStatus` searching, réservations sans chauffeur,
  incident `departure_at_risk`, `DriverCancellation` ; cascade `RescueOffer` backup2 → backup3 → open (tous les
  opérateurs vérifiés éligibles, 30 max), 15 min pour répondre (5 si départ < 3 h) ; reprise par updateMany
  conditionnel ; échec à T−30 : annulation sans frais, remboursement, avoir 20 % (`PassengerCredit`). Dernière minute
  = jour même ou < 12 h ; 260 € (`DriverPenalty`) à chaque annulation comptée dès la 3e sur 12 mois, contestation /
  justificatif 7 j, appliquée par le planificateur → `DriverBonus` 160 € au secours + 100 € d'avoirs répartis.
  Admin (2FA, contrôleur dans le module line-bookings pour ne pas alourdir AdminModule) : `/admin/departures/at-risk`,
  `/admin/departures/:id/assign`, `/admin/cancellations`, `/admin/penalties`.
  2c `src/market/` : `TransportRequest` (brouillon → published → offers_received → accepted → confirmed ;
  expire 1 h avant le départ), `TransportOffer` (une par opérateur et demande ; choix du client = `accepted`, à
  reconfirmer sous 2 h avec créneau revérifié ; confirmation = Trip `market`, aller-retour = 2 Trips), `OfferMessage`
  (téléphone / e-mail / applis refusés avant confirmation). Fil opérateur sans identité, adresse `coarseAddress`,
  coordonnées à 0,01°. `/market/requests/:id/lines` = départs de lignes compatibles. Admin : `/admin/market/requests`.
  Planificateur : `rescue.tick` et `market.tick` à chaque minute. FakeRedis : `exists`, eval compare-delete multi-valeurs.
- Bourse étape 3 (app chauffeur, 2026-10-10, `flutter analyze` propre, tests écrits mais non exécutables ici) :
  backend `GET /operators/me/vehicles`, `GET /operators/me/assignments` (départs réservés que j'assure : mes
  lignes + reprises), `lineDepartureId` sur les missions de `/drivers/me/trips`. App : modèles `models/operator.dart`
  et `models/market.dart`, `OperatorService` / `MarketService` (`guardOperatorCall` : messages des 403/404),
  providers `providers/operator_provider.dart` (dont `timePickerProvider` / `datePickerProvider` injectables),
  écrans `lib/screens/operator/` : `my_lines_screen` (bannière profil, « J'assure mes départs des 7 prochains
  jours »), `line_form_screen`, `line_detail_screen` (départs, jours fermés, réserves n° 2/3 par e-mail),
  `departure_screen` (liste d'embarquement, « Je suis en route », scan QR, démarrer / terminer, annuler →
  protocole), `operator_profile_screen` (CG opérateur : `operatorTermsFor`, URL à confirmer), `market_feed_screen`
  (demandes + mes propositions, `ProposeSheet`), `offer_messages_sheet`, `cancellations_screen`. Mode chauffeur :
  `OperatorSection` en haut (reprises urgentes, invitations de réserve, mes départs de ligne — seulement s'il y en
  a), accès « Espace opérateur » par le bouton de la barre (`showOperatorMenu`) et en bas de page ; les courses de
  ligne sont exclues des missions isolées (`MissionList.standalone` / `currentStandalone`). Routes `/driver/lines`,
  `/driver/lines/new`, `/driver/lines/:lineId`, `/driver/departures/:departureId`, `/driver/operator`,
  `/driver/market`, `/driver/cancellations` (réservées au rôle driver). Clés ARB préfixées `op*` / `mk*`
  (pluriels ICU) ; ajout par script : spec JSON { clé: { fr, en, p } } fusionnée dans les deux ARB puis
  `flutter gen-l10n`. Ne pas écrire de Dart ou de TS via `node -e` dans Bash (les `$`, backticks et apostrophes
  sont mangés) : outils d'édition. Doubles de test : `test/support/operator_fakes.dart`.
- Bourse étape 4 (app passager, 2026-10-10, vérifiée sur le téléphone avec le compte de Léa) :
  `lib/screens/market/` — `market_home_screen` (route `/market`, depuis la carte de l'accueil et le bouton en bas de
  l'écran 5 ; liste « Mes demandes »), `line_search_screen` (`/market/lines` : `LineResultCard`, `BookLineSheet` →
  écran 8 de la course créée, `SeatStepper`), `request_form_screen` (`/market/requests/new`), `request_detail_screen`
  (`/market/requests/:requestId` : propositions à comparer, choix, questions, lignes compatibles). `MarketService`
  porte aussi le côté client et la recherche / réservation de lignes. Clés ARB `mkc*`. Tests :
  `test/screens/market_screens_test.dart`. La recherche d'adresse dépend de la clé Google Places : en démo, passer par
  les adresses favorites de Léa (créées par le seed).
- Bourse étape 5 (admin, 2026-10-10, vérifiée dans le navigateur) : `xlcab_admin` pages « Opérateurs »
  (`features/operators/OperatorsPage.tsx`, route `/operateurs` : vérifier, suspendre, vente à la place, motif ≥ 5
  car.) et « Bourse et lignes » (`features/market/MarketPage.tsx`, route `/bourse` : départs en danger avec
  affectation manuelle, justificatifs, pénalités, demandes « à surveiller »). Backend : `GET
  /admin/departures/:id/candidates` (chauffeurs éligibles, téléphone pour l'équipe), noms des chauffeurs dans
  `/admin/cancellations`, `/admin/penalties`, `/admin/departures/at-risk`. Incident `departure_at_risk` libellé.
  Clés i18n `bo*` (fr.ts / en.ts). Tests : `src/features/market.test.tsx` (mock d'API séparé de pages.test.tsx).
  `nest start:dev` ne recharge pas toujours après une modification : redémarrer l'API avant de vérifier.
- Identité « Orbite » (2026-10-10, remplace la piste A ; appliquée à l'app, aux portails, aux factures et aux
  icônes) : symbole X dans un anneau avec point satellite, mot-symbole fin de www.xlcab.com (A sans barre, B
  ouvert), nuit #070B1A / carte #111936 / cyan #22D3EE (fond sombre) et #0E7490 (fond clair) / satellite #F0ABFC ;
  couleurs des navettes gardées comme repères de catégorie. Référence : `brand/README.md`.
  App : `AppColors.brand` / `brandDeep` / `onBrand` / `satellite` ; `AppColors.primary` reste le Rose de la NAVETTE
  (plus la marque) ; la couleur de marque passe par `Theme.of(context).colorScheme.primary` (cyan + texte sombre
  la nuit, cyan profond + texte blanc en clair) : ne plus poser de style explicite `primaryButton` + blanc sur un
  FilledButton, le thème s'en charge. `primaryButton` (= `brandDeep`) sert aux bordures et indicateurs. Thème
  SOMBRE par défaut (`HivePreferencesStore.readTheme`), clair au choix dans le profil ; les tests widget
  restent en `AppTheme.light`. Portails : thème clair seulement, `--color-primary` #0e7490, `XlcabWordmark`.
  Démo (`seed-demo.ts`) : Djamel (Paris–Beauvais 5 h, 25 €/place, réserves Chris n° 2 et Nadia n° 3 invitée),
  Chris (Paris–Orléans 19 h, retour 22 h 30, 390 € le véhicule), 3 places réservées par Léa demain, une demande
  de Léa sur la bourse avec une proposition de Djamel.
- Deux applis (plan `PLAN_DEUX_APPLIS.md` approuvé le 2026-10-11, identité Orbite gardée ; une étape à la fois,
  validation du porteur de projet entre chaque). Dépôt Git local à la racine `C:\xlcab` (branche `main`).
  Étape 1 faite : espace de travail Dart (`C:\xlcab\pubspec.yaml`, `resolution: workspace` dans chaque membre,
  un seul `pubspec.lock` à la racine ; `flutter pub get` depuis la racine). `packages/core` (`xlcab_core` : modèles,
  config, utils, l10n — ARB, `l10n.yaml`, `flutter gen-l10n` à lancer DANS packages/core —, services api / auth /
  token / preferences / location / places / trip / account / market, providers auth / locale / theme / jurisdiction).
  `packages/ui` (`xlcab_ui`, dépend de core : theme, widgets, `widgets/async_widgets.dart` = ex
  `screens/operator/widgets.dart`, `screens/login_screen.dart`, `screens/splash_screen.dart`, polices dans
  `lib/fonts/` déclarées par l'appli sous `packages/xlcab_ui/fonts/…`). core ne dépend JAMAIS de ui :
  `ShuttleType.color` est une extension de `xlcab_ui/theme/shuttle_colors.dart` (réexportée par `app_colors.dart`).
  `guardOperatorCall` vit dans `api_service.dart`. Imports entre paquets en `package:xlcab_core/…` /
  `package:xlcab_ui/…`. Outils de déplacement : scripts Node de `tools/monorepo/` (`graph.js` vérifie un
  découpage, `move.js` déplace et réécrit les imports, `add-l10n.js <spec.json>` ajoute des clés aux deux ARB).
  Étape 2 faite (2026-10-11) : `apps/passenger` (`xlcab_passenger`, Android `com.xlcab.passenger`, iOS idem) =
  tous les écrans passager (home, onboarding, booking, market, tracking, profile, corporate, accessibility),
  services booking / payment / tracking_channel, providers booking / home / tracking. Barre à 5 onglets
  (`screens/shell/passenger_shell.dart`, `StatefulShellRoute.indexedStack` dans `router.dart`) : Accueil `/home`,
  Trajets `PassengerTabs.trips` (= `TripHistoryScreen`), Colis `PassengerTabs.parcels` (`screens/parcels/`,
  colis parmi les 50 dernières réservations), Impact `PassengerTabs.impact` (écran d'attente : AUCUN chiffre CO₂
  tant que XLCAB n'a pas fourni sa méthode), Compte `/profile`. Aller à un onglet = `context.go`, jamais `push`.
  Tout rôle peut se connecter à l'appli passager ; « Mode chauffeur » / « Devenir chauffeur » y ouvrent
  `showDriverAppInfo` (renvoi vers XLCAB Driver). Manifest passager : ni FOREGROUND_SERVICE ni CAMERA (la photo
  d'un colis passe par `image_picker`, sans permission) ; iOS sans `UIBackgroundModes`.
  Partagé, donc dans core : `routes.dart` (`AppRoutes`, `PassengerTabs` ; chaque appli n'enregistre que ses
  routes), `providers/clock_provider.dart`, `providers/market_provider.dart` (bourse des deux côtés +
  `timePickerProvider` / `datePickerProvider`), services parcel / document_picker / feedback. Dans ui :
  `xlcab_app.dart` (`XlcabApp(router:, title:)`, widget racine commun), `screens/address_search_screen.dart`
  (+ `addressPickerProvider`), `widgets/offer_messages_sheet.dart`, `widgets/legal_links.dart`.
  Étape 3 faite (2026-10-12) : `apps/driver` (`xlcab_driver`, « XLCAB Driver », `com.xlcab.driver`) = ex
  `xlcab_app` (screens driver + operator, services driver_* / operator, providers driver_* / operator).
  L'ancien dossier de l'appli unique N'EXISTE PLUS. Barre à 4 onglets (`screens/shell/` : `driver_shell.dart`) : Aujourd'hui
  `AppRoutes.driverMode` (= `DriverModeScreen` : en ligne, offres, reprises urgentes, missions), Départ
  `DriverTabs.departure` (`departure_tab.dart` : `AssignmentTile` des départs que j'assure, mes lignes, bourse),
  Revenus `DriverTabs.earnings` (`EarningsCard`, courses récentes, mes annulations), Profil `DriverTabs.profile`
  (documents, profil opérateur, apparence, langue, liens légaux, déconnexion). Un compte non chauffeur n'y voit
  que la candidature `DriverOnboardingScreen` (formulaire, puis « Dossier en cours de vérification » ;
  `SignOutAction` dans sa barre) ; un chauffeur non validé voit le bandeau d'attente et ne peut pas passer en
  ligne (403 du serveur). `ThemeSelector` / `LanguageSelector` / `ChoiceGroup` partagés :
  `xlcab_ui/widgets/display_preferences.dart`. Android chauffeur : `FlutterActivity` et thèmes Android standards
  (les thèmes AppCompat venaient de Stripe, absent ici), ni carte Google ni clé Maps ; position en arrière-plan,
  CAMERA et lecteur de QR seulement dans cette appli. Dépendances inutilisées retirées (lottie, firebase_auth /
  analytics / crashlytics, connectivity_plus, permission_handler, build_runner, générateurs).
  Tests : ceux de core dans `packages/core/test`, doubles `test/support/fakes.dart` scindés par appli (copies
  distinctes).
  Compilation : `flutter build apk --debug --dart-define=API_BASE_URL=http://localhost:3000` DANS le dossier de
  l'appli ; première compilation d'une nouvelle appli ≈ 10 min, lancer en arrière-plan et attendre l'APK.
  Dans les chemins ci-dessous, `lib/…` de l'ancienne appli désigne donc `packages/core/lib/…`,
  `packages/ui/lib/…`, `apps/passenger/lib/…` ou `apps/driver/lib/…`.
- Espace sécurité, partie serveur (2026-10-12, `src/trip-sharing/trip-sharing.ts`, migration `trip_sharing`) :
  `/users/me/contacts` (`TrustedContact`, nom + téléphone nettoyé, 5 max, ownership par deleteMany), préférence
  `autoShareTrips` (`/users/me/preferences`), `GET|POST|DELETE /trips/:id/share` (passager de la course seulement,
  sinon 404 ; le même lien tant qu'il est actif ; 409 si trajet terminé). Lien = `PUBLIC_API_URL/suivi/{id}.{HMAC}`
  (clé dérivée de JWT_SECRET, rien de secret en base ; `TripShare.expiresAt` = départ + 24 h, `revokedAt`).
  Page publique `GET /suivi/:token` (HTML SANS script — CSP de Helmet —, meta refresh 20 s, fr/en selon
  Accept-Language ou `?lang=`, no-store, noindex) et `GET /api/v1/shared-trips/:token` : statut, prénom du
  voyageur, villes (`coarseAddress`, jamais l'adresse), prénom du chauffeur + véhicule + plaque + dernière
  position seulement si `accepted|started`, lien Google Maps (pas de carte intégrée, pas de clé). « Terminé »
  pendant 30 min puis 404 ; lien inconnu / falsifié / coupé / expiré = même 404. Le serveur n'envoie RIEN aux
  contacts (ni SMS ni e-mail branchés) : le passager transmet le lien. Contacts dans l'export RGPD, effacés à
  l'anonymisation avec les partages. Appli passager (vérifiée sur le téléphone) : `services/safety_service.dart`
  (`SafetyService`, `trustedContactsProvider`, `smsComposerProvider` et `clipboardWriterProvider` injectables),
  `screens/profile/trusted_contacts_screen.dart` (route `AppRoutes.trustedContacts`, tuile du Compte, interrupteur
  `autoShareTrips`), `screens/tracking/widgets/share_sheet.dart` (`showShareSheet` : ouvrir la feuille crée le lien ;
  « Envoyer à … » = `sms:` déjà rédigé, jamais envoyé par l'appli ; `AutoSharePrompt` dans le suivi si option activée,
  ≥ 1 contact et aucun partage actif). Tests : `test/screens/safety_screens_test.dart`, `test/support/safety_fakes.dart`.
  Téléphone de démo : `scratchpad/demo/ph.sh` exige `GUARD=<paquet>` et refuse gestes ET captures si cette appli
  n'est pas au premier plan (le porteur de projet se sert du téléphone en même temps). Ne JAMAIS envoyer Retour
  pour fermer la proposition « Enregistrer le mot de passe » de Google : elle disparaît seule et Retour ferme l'appli.
- Choix du siège (2026-10-12, lignes vendues à la place seulement, migration `line_seats`) : `LineSeat`
  (`@@unique([departureId, seatNumber])` = jamais deux fois le même siège). `POST /lines/bookings` accepte
  `seatNumbers` (autant que de places, ≤ `seatsTotal`, sinon 400 ; siège pris = 409 vérifié AVANT de retenir les
  places, la contrainte d'unicité tranchant les demandes simultanées) ; sans `seatNumbers`, les premiers sièges
  libres sont attribués ; départ `per_vehicle` : aucun siège, `seatNumbers` refusé. `GET
  /lines/bookings/seats/:departureId` = `{ seatsTotal, choosable, taken }` (numéros seulement, aucune identité).
  Sièges dans la réponse de réservation, `booking.seatNumbers` de `/trips/:id` et la liste d'embarquement ;
  libérés par `LinesService.releaseSeats(departureId, seats, tripId)` à l'annulation. App passager :
  `screens/market/seat_picker.dart` (`SeatPicker`, `seatMapProvider`) dans `BookLineSheet` — grille NUMÉROTÉE, pas
  un plan du véhicule (on ne connaît pas la disposition des navettes) ; choix facultatif mais jamais partiel ;
  récapitulatif (écran 8) et liste du chauffeur affichent « Sièges 2, 5 » (`l10n.sgNumeros`). Non repris de la
  maquette : « à côté d'une femme » (on ne stocke pas le genre ; formulation à valider par l'avocat).
- Réserver le retour et étiquettes de note (2026-10-12, migration `rating_tags`) : `GET /trips/:id` renvoie `source`
  (instant | line | market) ; app passager `models/return_trip.dart` (`ReturnTripRequest`, `returnTripOf` : course
  passager `accepted|started|completed` avec coordonnées, adresses inversées, mêmes passagers), bouton du
  récapitulatif (écran 8) → `extra` go_router vers `PassengerBookingScreen(initialReturn:)` (même navette) ou
  `LineSearchScreen(initial:)` pour une place de ligne. Étiquettes : `RATING_TAGS` (feedback.service : conduite_sure,
  ponctuel, vehicule_propre, accueil, colis_soigne ; liste fermée, 400 sinon), `TripRating.tags`, `POST
  /trips/:id/rating { tags }` ; app : `ratingTags()` + `FilterChip` proposés à partir de 4 étoiles seulement (jamais
  envoyées pour une note plus basse) ; admin : étiquettes affichées avec la note (`ratingTagLabel`).
- Onglets en mémoire (`StatefulShellRoute.indexedStack`) : un onglet déjà ouvert ne se recharge pas seul. Passager :
  `PassengerShell` incrémente `tripsRefreshProvider` (Trajets) et invalide `myParcelsProvider` (Colis) à chaque
  retour sur l'onglet — sans cela une réservation toute fraîche manquait dans « Trajets ». Tout nouvel onglet à
  données doit prévoir ce rechargement.
- Vidéo de démo des deux applis (2026-10-12, `demo/videos/xlcab-1-passager-reservation.mp4`,
  `xlcab-2-passager-securite-retour-note.mp4`, `xlcab-3-chauffeur.mp4`) : un chapitre = un enregistrement
  `scratchpad/demo/rec.sh start|stop NOM` (170 s max, `GUARD` obligatoire, supprimé si l'appli quitte le premier
  plan) ; connexions TOUJOURS hors enregistrement (`login.sh N paquet`, puis `dismiss.sh` = « Pas maintenant ») ;
  relancer `seed-demo.ts` avant (Thomas a les sièges 1-3 de Paris–Beauvais, Léa a un trajet d'hier à noter, le
  contact « Maman » et le partage automatique). Un balayage `input swipe` de durée différente ne défile pas de la
  même distance : garder 400 ms entre répétition et prise. Pas de ffmpeg sur ce PC : pas de montage, et les
  vidéos ne peuvent pas être relues image par image (vérifier par la base et les écrans de fin).
- Thème « Orbite Jour » (2026-10-12, demande du porteur de projet : plus clair et positif que le fond noir ; EN ATTENTE
  de sa validation sur captures `demo/captures/jour-*.png`) : thème CLAIR par défaut (`HivePreferencesStore.readTheme`),
  fond glacier #F1F7FE, cartes blanches à liseré #CBDDF0, boutons pleins cyan orbite #22D3EE + texte #04202B dans
  les DEUX thèmes (`buttonFill` dans `app_theme.dart`) ; `colorScheme.primary` reste le cyan profond #0E7490 le
  jour (textes, liens, contours : le cyan vif y serait illisible). Thème sombre « Orbite Nuit » inchangé, au choix
  dans le profil. Écran de démarrage et icône gardent la nuit. Ce qui dit « sombre par défaut » plus haut est périmé.
- Vidéos de démo en vigueur (2026-10-12, thème Orbite Jour VALIDÉ par le porteur de projet, remplacent toutes les
  précédentes) : `demo/videos/xlcab-passager-fr.mp4`, `xlcab-chauffeur-fr.mp4`, `xlcab-passenger-en.mp4`,
  `xlcab-driver-en.mp4`. ffmpeg (autorisé) : `C:UsersAdmindevfmpegfmpeg-9.0.2-essentials_buildin` — assemblage
  par `-f concat -c copy`, contrôle par planche d'images (`fps=1/4,scale=180:-1,tile=10x5`). Chapitres :
  `scratchpad/demo/takes.sh p1|p2|d1 <langue>` (en anglais : `CHIP1="225 752" CHIP2="283 1064"` pour p2) ; entre
  deux séries `node demo/reset-video.js` (annule la réservation, la note et le partage de Léa sans régénérer les
  comptes : les applis restent connectées). Langue changée dans le profil de chaque appli, puis remise sur « Téléphone ».
- Décisions du 2026-10-13 : (1) un chauffeur peut voyager — rôle `driver` ajouté aux routes clients
  `/lines/bookings`, `/market/*` (CLIENTS) et `/trips/:id/{driver,rating,report}` ; 403 s'il réserve sur un départ
  qu'il assure ; il ne répond pas à sa propre demande. (2) Impact CO₂ « comme tu veux » : `src/impact/impact.ts`,
  `GET /users/me/impact` = { savedKg, trips, distanceKm, method } sur les courses passager terminées ;
  `savedKg(km, seats, onBoard)` = seats × (0,218 − 0,29 / à bord) × km, jamais négatif (seul à bord = 0) ;
  0,218 kgCO₂e/km = voiture thermique ADEME (Impact CO₂) ; 0,29 = minibus diesel 8 places (CO2 Emissiefactoren,
  pas de fiche ADEME trouvée : À CONFIRMER sur la Base Empreinte) ; `CO2_CAR_KG_PER_KM` / `CO2_SHUTTLE_KG_PER_KM`.
  Lignes : à bord = `LineDeparture.seatsBooked`. Sans `distanceKm` : vol d'oiseau × 1,3. App :
  `screens/impact/impact_screen.dart` (`impactProvider`), chiffre TOUJOURS affiché avec sa méthode ; ni niveaux
  ni défis (barème non défini). (3) Stripe : le porteur de projet a un compte ; Connect À FAIRE dès que les clés
  de test sont dans `.env.local` (jamais dans le chat). (4) Préférence « conductrice » : à traiter comme une
  PRÉFÉRENCE non exclusive ; base technique à décider (on ne stocke pas le genre ; `roseEligible` ?).
- Préférence « conductrice » (2026-10-13, migration `prefer_woman_driver`, appuyée sur l'habilitation Navette Rose par
  décision du porteur de projet) : `UserPreference.preferWomanDriver`, `MatchCriteria.preferRose` (habilitées
  d'abord, tri stable par proximité, AUCUN chauffeur écarté), lue par `DispatchService.prefersWomanDriver` (illisible
  = non) ; app : second interrupteur de `trusted_contacts_screen.dart` sous « Mes préférences de sécurité », texte
  « ce n'est pas une garantie ». Conformité juridique non validée par un conseil.
- Tournage vidéo, leçons du 2026-10-13 : faire activer le MODE AVION par le porteur de projet (vérifiable :
  `settings get global airplane_mode_on` = 1 ; les applis passent par `adb reverse`) — une bannière de notification
  absorbe les touchers et se retrouve dans la vidéo sans faire quitter l'appli du premier plan ; « Ne pas déranger »
  s'est révélé inactif trois fois (`dumpsys notification` → mZenMode). Contrôle de chaque vidéo : bande du haut
  seconde par seconde (`fps=1,crop=iw:200:0:60,scale=240:-1,tile=7x26`). `reset-video.js --garder-reservation`
  pour refaire seulement la 2e partie. Les données du seed vieillissent : relancé la veille, les sièges 1-3 de
  Thomas ne sont plus sur le départ du lendemain (relancer `seed-demo.ts` le jour même, puis se reconnecter).
- Stripe Connect (décisions du 2026-10-13 : le passager paie à la réservation sur la plateforme, la part de
  l'opérateur est REVERSÉE APRÈS LE TRAJET — « separate charges and transfers », le secours qui reprend un départ
  est celui qu'on paie — ; lignes et bourse d'abord, courses instantanées inchangées ; compte de versement EXIGÉ
  pour vendre). `LINE_PAYMENT_MODE` = `deferred` (défaut, tests, 503 en production) | `connect`
  (`src/payouts/payment-mode.ts`, réexporté par line-bookings). Étape 1 faite, `src/payouts/payout-accounts.ts`
  (migration `payout_accounts`) : `PayoutAccount` (userId, `stripeAccountId`, état recopié de Stripe : jamais
  d'identité ni d'IBAN chez XLCAB), compte Stripe Express « transfers » seulement (idempotence
  `payout-account-{userId}`), `GET /operators/me/payout-account` = { required, state none|incomplete|pending|ready,
  ready, requirementsDue } (relu chez Stripe tant que pas prêt), `POST …/onboarding-link` (chauffeur validé + profil
  opérateur, 10/h), `POST …/dashboard-link`, webhook `POST /api/v1/webhooks/stripe-connect` (secret DISTINCT
  `STRIPE_CONNECT_WEBHOOK_SECRET`, `account.updated`), pages de retour publiques `/versements/retour|reprise`.
  `PayoutAccountsService.assertReady` (403 `PAYOUT_ACCOUNT_REQUIRED`, sans effet en `deferred`) dans
  `LinesService.confirm`, réouverture d'un départ, `MarketService.propose` / confirmation. `readyAccountId` pour le
  reversement. Étape 2 faite (2026-10-13) : en `connect`, `POST /lines/bookings` crée la course en `awaiting_payment`
  (places et sièges RETENUS, une seule par passager et départ même non payée) et renvoie `payment` (feuille Stripe,
  `transfer_group` = `transferGroupOf(tripId)` = `trip_{id}`) ; `PaymentsService.markPaid` → `confirmPaidLineBooking` :
  `accepted` auprès du chauffeur qui assure le départ À CET INSTANT (secours compris ; `searching` = sans chauffeur ;
  départ `failed` ou parti = annulée + remboursée), jamais de dispatch ; `expireUnpaid` (30 min) et l'abandon rendent
  places et sièges ; Stripe en panne à la réservation = rien de retenu. `PaymentsService.available()`.
  PaymentsModule importe OperatorsModule (LinesService en 9e paramètre @Optional). Tests :
  `line-bookings/line-payments.integration.spec.ts`. Étape 3 faite (2026-10-13, migration `market_payments`,
  décision : EMPREINTE DE CARTE au choix du client) : en `connect`, `POST /market/offers/:id/accept` → offre
  `authorizing` (15 min, `AUTHORIZE_WINDOW_MIN` ; l'opérateur la voit encore `pending`) + `payment` (PaymentIntent
  `capture_method: manual`, `Payment.offerId`, clé `offer-payment-{offerId}-{tentative}`) ; `POST
  /market/offers/:id/authorize` (ou `market.tick`) vérifie `requires_capture` au montant exact → `accepted`, opérateur
  prévenu, 2 h ; `confirm` de l'opérateur DÉBITE (`captureAuthorization`, clé `offer-capture-{paymentId}`) avant de
  créer les courses — refus = 409, offre `expired`, client invité à rechoisir ; course non créée après débit =
  `refundCapturedOffer`. Empreinte levée (`releaseAuthorization`, ne lève jamais) au refus, au délai, à
  l'annulation ou l'échéance de la demande, à l'abandon (offre de nouveau `pending`). Aller-retour = UN paiement :
  `Payment.tripId` = l'aller, `Trip.paidWithTripId` sur le retour, `PaymentsService.paymentOf` rembourse la part
  de la course annulée seulement. MarketModule importe PaymentsModule. Tests :
  `market/market-payments.integration.spec.ts`. Étape 4 faite (2026-10-13, migration `payouts`,
  `src/payouts/trip-payouts.ts` ; le module est maintenant `src/payouts/payouts.module.ts`) : `Payout` (un par
  course, `tripId` unique ; pending | paid | blocked = compte de versement pas prêt | failed | void).
  `TripsService.complete` → `TripPayoutsService.onTripCompleted` (ne lève jamais) : course `line`/`market` terminée
  ET payée en ligne seulement ; montant = `operatorShareCents` = TTC − TVA − `commissionCents` (comme l'écran
  Revenus), plafonné à ce qui reste encaissé ; bénéficiaire = `trip.driverId` à la fin (donc le SECOURS s'il a
  repris) ; `stripe.transfers.create` avec `source_transaction` = charge du paiement (part même si les fonds ne
  sont pas disponibles), clé `payout-{id}-{compte}`. Reprises par `tick` (planificateur) : blocked chaque heure
  (opérateur prévenu une fois), failed 5 min × 2ⁿ plafonné 6 h, 10 essais (`PAYOUT_MAX_ATTEMPTS`) puis main à
  l'équipe ; filet : courses terminées < 7 j sans Payout. `GET /operators/me/payouts` (failed montré `pending`,
  aucun identifiant Stripe), admin 2FA `GET /admin/payouts`, `POST /admin/payouts/:id/retry`. NON traité : frais
  d'annulation retenus (gardés par XLCAB, à décider), remboursement admin APRÈS reversement (à la charge de
  XLCAB, pas de reprise chez l'opérateur). Tests : `payouts/trip-payouts.integration.spec.ts`. Étape 5 faite
  (2026-10-13, migration `payout_penalties`) : pénalités d'annulation RETENUES sur les reversements. Le Payout naît
  `draft` (jamais viré), `finalize` retient les `DriverPenalty` `applied` non soldées du chauffeur (jamais
  pending / contested / cancelled), les plus anciennes d'abord, par écriture conditionnelle sur `collectedCents` +
  `PayoutDeduction` dans une transaction, puis fixe `grossCents` / `withheldCents` / `amountCents` et le statut
  (pending, `withheld` = tout retenu, void). Plafond `PENALTY_WITHHOLD_PERCENT` (100 par défaut, À VALIDER).
  `DriverPenalty.collectedCents` / `collectedAt` (soldée). Brouillon de plus de 5 min repris par `tick` sans double
  retenue. Notification `payout.withheld` (reste dû). NON fait : paiement Stripe du `DriverBonus` de 160 € au
  secours (ligne en base seulement), facture de pénalité à 30 j faute de reversements. Tests sensibles à
  l'horloge : mesurer depuis `nextAttemptAt`, pas depuis `Date.now()` (suite lente sous charge). Écran chauffeur
  fait (2026-10-13, `flutter analyze` propre, tests écrits non exécutables ici) : `core/models/payouts.dart`
  (`PayoutAccount.blocksSelling`, `Payout`, `PayoutSummary`), `OperatorService.payoutAccount / payoutOnboardingLink /
  payoutDashboardLink` (refuse tout lien non https) `/ payouts`, `payoutAccountProvider`, `payoutsProvider`,
  `externalLinkOpenerProvider` (navigateur, injectable), `screens/operator/payouts_screen.dart` (route
  `AppRoutes.driverPayouts` ; relit l'état au retour au premier plan ; `PayoutAccountBanner` sur « Mes lignes »),
  entrées depuis l'onglet Revenus et le menu opérateur, part déjà retenue affichée dans « Mes annulations ». Clés
  ARB `pay*`. Tests : `test/screens/payouts_screen_test.dart` ; écran vérifié sur le téléphone (sans Stripe : état
  « aucun compte », 503 affiché proprement). Écrans passager faits (2026-10-13, analyse propre, tests écrits non
  exécutables ici) : `MarketService.bookLine` renvoie `LineBooking { tripId, payment? }`, `acceptOffer` renvoie
  `OfferChoice { payment? }` (+ `authorizeOffer`), modèles dans `core/models/payment.dart` (pour une empreinte,
  `PaymentSheetParams.tripId` est vide), `OfferStatus.authorizing`. `BookLineSheet._pay` : feuille Stripe
  (`paymentSheetPresenterProvider`) puis `/payments/confirm` ; abandon / refus / Stripe indisponible sur le
  téléphone = course ANNULÉE tout de suite (`tripServiceProvider.cancel`, places rendues). Bourse :
  `RequestDetailScreen._accept` → feuille → `authorizeOffer` ; feuille fermée = offre « Carte à valider » avec
  bouton « Valider ma carte » (même empreinte, 15 min). Sans `payment` (mode `deferred`), parcours inchangés.
  Clés ARB `mkcPaiementAbandonne`, `mkcCarte*`, `mkcValiderMaCarte`. Tests :
  `apps/passenger/test/screens/market_payments_test.dart` ; réservation d'une ligne revérifiée sur le téléphone en
  mode `deferred`. Admin fait (2026-10-13) : page « Reversements » (`xlcab_admin`,
  `features/payouts/PayoutsPage.tsx`, route `/reversements`, `api.payouts` / `api.retryPayout`, clés i18n `rv*`) :
  par défaut ceux qui ne sont pas partis, « Intervention requise » après 10 échecs, relance manuelle, détail de la
  retenue ; part recouvrée affichée sur les pénalités appliquées de « Bourse et lignes ». Tests :
  `src/features/payouts.test.tsx` (mock d'API séparé) ; page NON vue dans le navigateur (connexion admin + 2FA à
  refaire après le seed). Bonus de reprise fait (2026-10-13, migration `driver_bonus_payout`) : `DriverBonus` a un
  statut de virement (pending | paid | blocked | failed) ; `TripPayoutsService.payBonuses` (dans `tick`) vire les
  160 € au secours dès que la pénalité liée est `applied` ET recouvrée À HAUTEUR DU BONUS (le secours passe avant
  les avoirs passagers — règle À VALIDER) ; virement depuis le solde de la plateforme (pas de `source_transaction`),
  clé `bonus-{id}-{compte}`, mêmes reprises que les reversements. `mine()` renvoie `bonuses`, admin
  `GET /admin/payouts/bonuses`, `POST /admin/payouts/bonuses/:id/retry` (409 si la pénalité n'est pas recouvrée).
  Affiché dans l'écran chauffeur (`RescueBonus`, clés `payBonus*`) et la page admin (`BonusesSection`, `rvBonus*`).
  L'APK chauffeur installé sur le téléphone date d'AVANT l'affichage des bonus : recompiler avant une démo.
  Facture de pénalité faite (2026-10-13, migration `penalty_invoice`) : `RescueService.tick` étape 5 →
  `invoiceOverduePenalties` : pénalité `applied`, non soldée, sans facture, décidée depuis
  `LINE_PENALTY_INVOICE_AFTER_DAYS` (30) → `InvoicesService.issuePenalty` (facture `due` du SOLDE, échéance + 30 j,
  régime `penalty` hors champ TVA — à valider —, acheteur = le chauffeur), `DriverPenalty.invoiceId / invoicedAt`,
  une seule facture par pénalité ; la retenue sur reversements continue ensuite. Paiement par virement enregistré
  par l'équipe : `POST /admin/penalties/:id/payment { amountCents, reference }` (2FA ; ≤ solde, écriture
  conditionnelle, AuditLog `line.penalty.payment`) → alimente `collectedCents`, donc le bonus du secours. La facture
  elle-même n'est jamais modifiée (le solde vit sur la pénalité). Vues : `invoice { number, totalCents, dueDate }`
  dans `/operators/me/cancellations` et `/admin/penalties` ; admin : `PenaltyPayment` dans « Bourse et lignes » ;
  appli chauffeur : ligne dans « Mes annulations » (`payFacturePenalite`). LineBookingsModule importe InvoicesModule
  (`RescueService` : InvoicesService en dernier paramètre @Optional). IBAN du vendeur (2026-10-13) :
  `INVOICE_SELLER_IBAN` / `INVOICE_SELLER_BIC` (à renseigner par le porteur de projet dans `.env.local`),
  `src/invoices/bank-details.ts` (contrôle modulo 97 : un IBAN faux n'est JAMAIS imprimé), figé dans
  `Invoice.seller.bank` pour toute facture `due` (pénalités ET factures mensuelles d'entreprise), mention
  `paymentInstruction` du PDF (IBAN, BIC, numéro de facture à rappeler) ; absent → AuditLog
  `invoice.bank_details_missing` et `sellerComplete` faux (alerte de la page Factures de l'admin). Guide du porteur
  de projet : `GUIDE_STRIPE_CONNECT.md` (mode test, relais `stripe listen` = téléchargement à faire valider, scénario
  d'essai : les formulaires d'identité Stripe et la saisie de carte sont faits PAR LUI). Reste : essai réel avec
  les clés de test
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
  `--dart-define=STRIPE_PUBLISHABLE_KEY`, `LINE_PAYMENT_MODE=connect`).
- Démo, pénalité et bonus (2026-10-13, `seed-demo.ts`) : Chris a 3 annulations comptées et une pénalité de 260 €
  appliquée il y a 31 jours (45 € recouvrés) → le PLANIFICATEUR de l'API émet la facture du solde (215 €) dans la
  minute, par le vrai circuit ; Djamel a un bonus de reprise de 160 € en attente. La pénalité est sur Chris, pas
  sur Djamel, pour ne pas fausser l'essai Stripe (45 € attendus sur le reversement de Djamel). Les factures des
  anciens comptes de démo ne sont pas effacées au reseed (numérotation continue).
- PDF des factures (défaut corrigé le 2026-10-13) : la clé de stockage était `invoice-FA-…pdf`, refusée par
  `LocalDiskStorage` (clés `uuid.ext` seulement) → hors tests, AUCUN PDF n'était archivé et le téléchargement
  échouait. Clé désormais `uuid.pdf` ; `assertStorageKey` appliqué aussi à `MemoryDocumentStorage` pour que les
  tests voient ce genre d'écart. Ne jamais lancer une appli sur le téléphone (`monkey`) sans regarder d'abord ce
  qui est au premier plan : le porteur de projet peut être en train de s'en servir.
- Vidéos chauffeur retournées le 2026-10-13 (65 s chacune, mode Avion) : la prise `d1` passe maintenant par
  Revenus → « Compte de versement et reversements » (tuile en 360 730, mêmes coordonnées en anglais) avec le
  bonus de reprise de démo, puis Profil. Volet de notifications resté ouvert après le mode Avion : le refermer par
  `adb shell cmd statusbar collapse` (jamais la touche Retour).
- Tests automatiques (2026-10-13, `.github/workflows/tests.yml`) : dépôt PRIVÉ `https://github.com/Techvonix/xlcab`
  (remote `origin`, branche `main`). GitHub Actions sur push / PR / lancement manuel : Flutter 3.47.5 (analyse +
  tests de `packages/core`, `packages/ui`, `apps/passenger`, `apps/driver`, journal en artefact
  `journal-flutter-N`), serveur (Node 24 — Jest exige >= 24.9 pour require(esm) —, `npm ci`, `prisma generate`,
  tests, build), portails admin et entreprise. Aucun secret requis. TOUT EST VERT depuis le 3e passage
  (2026-10-13) : 188 tests passager, 92 chauffeur, 606 serveur, 46 admin, 42 entreprise. C'est désormais LE moyen
  de faire tourner les tests Flutter (impossibles sur ce PC).
  `git push` est REFUSÉ à Claude par le garde-fou de l'application (sortie de données) : le porteur de projet le
  lance lui-même (bouton Run ou PowerShell ouvert dans le dossier du projet). Résultats : il colle la page, envoie une capture, ou
  télécharge l'artefact du passage dans `Téléchargements` (`journal-flutter-2*.zip` = passager, `-3` = chauffeur ;
  prendre le plus récent, à décompresser dans un dossier vide du scratchpad). `gh` absent, extension Chrome non
  reliée. Leçons du premier passage (tests jamais exécutés auparavant) : `pump()` entre deux touchers sur le même
  widget (sinon le second voit l'ancien état) ; `scrollUntilVisible` s'arrête dès que le widget existe, même sous
  le bord → enchaîner `ensureVisible` + `pumpAndSettle` avant un toucher ; montants à comparer avec
  `formatPrice(...)` (espace insécable avant « € ») ; formulaire en liste paresseuse plus haut que l'écran de test
  → `pump(..., height:)` ; chemins de fichiers relatifs au dossier de l'appli (`../../packages/...`). `showToast`
  REMPLACE le message affiché (`removeCurrentSnackBar`) au lieu de le mettre en file.
- Clarification du modèle (2026-10-14, `CLARIFICATION_MODELE.md`, demandée AVANT de nouvelles vidéos explicatives) :
  régimes de transport (pro seulement au lancement, covoiturage = second produit, avis juridique), seuil de départ
  garanti, départ ponctuel, points de rencontre / arrêts, colis sur les lignes, dashcam ; décisions D1-D13 TOUTES VALIDÉES
  le 2026-10-14, portée européenne (paramètres par pays dans `JurisdictionConfig`, jamais en dur). Ordre de travail :
  section 10 du dossier (1. seuil de départ garanti, 2. départ ponctuel, 3. points de rencontre, 4. colis sur les
  lignes, 5. dashcam, 6. Stripe réel, 7. vidéos explicatives en dernier).
- Migrations : `init_xlcab` appliquée sur la base locale ; toute modification de
  `prisma/schema.prisma` demande désormais `npx prisma migrate dev --name <nom>`. Référentiel :
  `npx prisma db seed` (config FR uniquement).
- En attente de comptes à créer par le porteur de projet : Google Cloud (TechvonixDigital@gmail.com),
  AWS (stockage S3 des documents chauffeurs), Firebase (notifications push), Stripe (clés test puis live).
- Les `*.integration.spec.ts` démarrent une vraie app (HTTP + Socket.io, port libre) avec Prisma et
  Redis simulés : ni base ni Redis requis. Doubles partagés dans `src/testing/` (faux Redis, doubles
  du module Drivers) — ne jamais importer un `*.spec.ts` depuis un autre (ses tests tourneraient deux fois).
- `tsconfig.build.json` exclut `prisma/`, `src/testing/` et les specs du build (sinon `dist/main.js`
  se retrouve en `dist/src/main.js`).
- Pas d'`esModuleInterop` : importer supertest avec `import * as request from 'supertest'`.
- Module Bookings (`src/bookings/`, hors numérotation de la Partie 9) : `POST /bookings/passenger/quote`
  seulement. Distance calculée par le serveur via Google Routes (`RoutingService`, clé
  `GOOGLE_MAPS_API_KEY`, cache Redis `route:*` 15 min), 30 devis/min/utilisateur, départ ≥ +2 h.
  Création (`POST /bookings/passenger`, module Paiements), historique et annulation (`/trips/:id/cancel`)
  sont faits. Les alias de la Partie 6 `GET /bookings/passenger/:id`, `…/cancel`, `…/checkin` et
  `PATCH /bookings/parcel/:id/cancel` ne sont pas créés : couverts par `/trips/:id` (décision).
- Applications Flutter : `apps/passenger` et `apps/driver` (voir « Deux applis » ci-dessus ; polices
  Poppins/Inter OFL dans `packages/ui/lib/fonts/`). Modules 5 (Home), 6 (Réservation passager) et 7 (Suivi temps réel) en relecture.
- Module 7 : `GET /trips/:id/tracking` (backend, `tracking.controller.ts`) sert au chargement et au
  polling 10 s. Position chauffeur seulement si `accepted|started` ; téléphone chauffeur seulement au
  passager pendant la course. Côté app : `TrackingController` (temps réel + polling automatique dès
  que le WebSocket tombe), `TrackingChannel` (interface ; implémentation Socket.io avec
  `setAuthFn` qui relit le jeton à chaque reconnexion). SOS : dialogue 112 d'abord, puis alerte WS
  avec accusé de réception (5 s) ; audio 30 s non implémenté.
- ETA : le serveur envoie `eta: null` ; l'app l'estime (`utils/geo.dart`, vol d'oiseau × 1,3).
- Identité visuelle (piste A du 2026-10-06 remplacée par « Orbite » le 2026-10-10 ; graphisme à faire valider
  par un web développeur) : référence unique `brand/` (SVG maîtres, `README.md` = géométrie, couleurs, liste
  des endroits à mettre à jour, `generate-icons.ps1` = toutes les PNG via System.Drawing, à lancer
  avec l'outil PowerShell — la politique d'exécution bloque `powershell -File` depuis Bash ; le fichier
  doit garder son BOM UTF-8). Flutter : `XlcabLogo` / `XlcabSymbolPainter` / `XlcabWordmarkPainter`
  (`lib/widgets/xlcab_logo.dart`, `LogoTone` light/dark/onBrand) ; Android : icône adaptative
  `drawable/ic_launcher_foreground.xml` + `@color/xlcab_brand` (nuit), démarrage nuit
  (`launch_background.xml`, `values-v31`) ; iOS : storyboard nuit ; nom affiché « XLCAB ». Portails :
  `src/components/brand/XlcabLogo.tsx` + favicons. Factures : `drawSymbol` (invoice-pdf.ts). Pas de
  service e-mail : `brand/xlcab-logo-email.png` attend le branchement de SendGrid.
- Avis passager (`src/feedback/`, écran 10) : `GET /trips/:id/driver` (passager de la course seulement,
  chauffeur engagé ou course terminée ; prénom seul, plaque masquée après la course, `rating: null` tant
  que `DriverProfile.ratingCount` = 0 — même règle au suivi `TrackingService` et à `/drivers/me/status`, qui
  renvoie aussi `ratingCount`), `POST /trips/:id/rating` (1-5 entier, course terminée depuis
  ≤ 7 j, une fois — `TripRating.tripId` unique —, moyenne recalculée par aggregate ; commentaire lu par
  l'équipe seulement), `POST /trips/:id/report` (motifs
  `REPORT_REASONS`, Incident `driver_report`, un ouvert par course, 5/jour). Admin : incidents libellés
  par type (sos | parcel_failed | driver_report), position affichée pour les SOS seulement.
- Notes dans l'admin (`src/admin/ratings.ts`, 2FA) : `GET /admin/ratings` (filtres driverId, maxStars, withComment ;
  noms chauffeur/passager, commentaire), `GET /admin/ratings/drivers` (moyenne la plus basse d'abord, `lowCount` =
  notes ≤ 2), `DELETE /admin/ratings/:id` (motif ≥ 10 car., AuditLog `rating.remove` SANS le commentaire). Moyenne :
  `recomputeDriverRating` (`feedback/driver-rating.ts`, partagé avec la notation ; 0 note → 5,00 et ratingCount 0).
  Page « Notes des passagers » de `xlcab_admin` (`features/ratings/RatingsPage.tsx`).
- `src/users/user-settings.ts` : `/users/me/preferences` (table `UserPreference`, défauts sans ligne,
  prospection désactivée par défaut) et `/users/me/addresses` (`SavedAddress`, 10 max, ownership par
  deleteMany {id, userId}). Inclus dans l'export RGPD, effacés à l'anonymisation (notes gardées,
  commentaires effacés). `GET /api/v1/health` (public, 200/503, sans détail interne). Migration
  `passenger_experience`. Arrêter l'API avant `prisma generate` (DLL verrouillée sous Windows).
- App : écran 10 `driver_profile_screen.dart` (route `/trip/:tripId/driver`, depuis le suivi et le
  récapitulatif — bouton « Noter le trajet » si terminée), `saved_addresses_screen.dart`,
  `notification_preferences_screen.dart` ; favoris en tête de `AddressSearchScreen` (champ vide).
  Service `FeedbackService` (`feedbackServiceProvider`, `driverPublicProfileProvider`).
- Traductions (2026-10-07) : gen-l10n, `packages/core/l10n.yaml`, ARB `packages/core/lib/l10n/app_fr.arb` (référence, avec les
  métadonnées des paramètres) et `app_en.arb` ; classes générées dans `lib/l10n/generated/` (`flutter gen-l10n`,
  aussi lancé par pub get/build). Accès UNIQUE : `l10n.cle` (getter global de `lib/l10n/l10n.dart`, utilisable
  dans les écrans, services et modèles) ; `app.dart` (`_XlcabAppState`, observateur de la langue du téléphone)
  calcule la langue AVANT de construire, appelle `setAppLocale` puis, au changement, `_rebuildAll` après la frame
  (markNeedsBuild sur tout l'arbre). Ni KeyedSubtree ni clé sur `MaterialApp.router` ne suffisent : la
  GlobalKey du Navigator de GoRouter garde les éléments (barre du bas restée en français). Décimaux : `formatDecimal` (`utils/formatters.dart`, jamais `replaceAll('.', ',')`). Choix
  exclusifs courts : pastilles `ChoiceChip` dans un `Wrap` (`_ChoiceGroup` du profil), pas de `SegmentedButton`
  à libellés longs (coupe les mots sur petit écran / texte agrandi). Langue : choix du profil (`localeProvider`, Hive
  `language`, PATCH /users/me locale) sinon celle du téléphone via `resolveAppLocale` (fr → fr, tout le reste →
  en ; `ga` sans traduction → en). Tests : sans délégué de localisation, `l10n` reste en français (les tests
  existants cherchent les textes français). Règles : aucun texte affiché en dur ; jamais de texte traduit dans
  un `const`, un constructeur d'enum (libellés = accesseurs `switch`) ni un `final` de niveau fichier/statique
  (évalué une fois → accesseur `get`). Nouvelle clé : l'ajouter aux DEUX ARB. Liens légaux par langue :
  `privacyPolicyFor` / `termsFor` (`config/legal.dart`, URLs anglaises à confirmer). Messages d'erreur du
  serveur : traduits par le backend selon l'en-tête `X-Locale` (`localeHeaderInterceptor` sur les deux Dio) et
  `auth.locale` des sockets.
- Messages du serveur (`src/i18n/`) : catalogue `MESSAGES_EN` (français → anglais, « {} » = partie variable des
  gabarits, parties connues — noms de documents, listes « a, b » — traduites aussi). `LocalizedExceptionFilter`
  (APP_FILTER, `I18nModule`) traduit message et listes de validation si `X-Locale` ≠ fr ; sans en-tête (portails,
  outils) rien ne change ; statut et `code` métier jamais modifiés ; erreurs de middleware comprises.
  `LocalizedWsExceptionFilter` sur le gateway de suivi + `socketMessage` (handshake refusé). `messages.en.spec.ts`
  vérifie par AST TypeScript que tout message d'exception / de validation est au catalogue. Gardés en français :
  mentions légales des factures (document de la filiale FR), messages de démarrage (`validateEnv`). Textes de
  notification déjà au catalogue pour de futurs envois push dans la langue du compte (`User.locale`).
- Onboarding (écran 2) : 3 pages, affiché au premier lancement seulement
  (`PreferencesStore.readOnboardingSeen`, redirection du routeur depuis le splash). Tests qui
  passent par le routeur non connecté : surcharger `preferencesStoreProvider` avec
  `MemoryPreferencesStore(onboardingSeen: true)`. Couleurs texte : `AppColors.secondaryText`
  (#1565C0), `tertiaryText` (#A85A00), `accessibilityText` (#546E7A).
- Boutons primaires : couleurs du thème (voir « Identité Orbite ») ; #E91E63 n'est plus que la couleur de la
  navette Rose. « Réserver un trajet » (accueil, barre du bas) → écran 5 `shuttle_selection_screen.dart` → écran 6
  (`?type=`) ; les cartes « Nos navettes » de l'accueil ouvrent directement l'écran 6. Écran 5 : `GET /api/v1/shuttles`
  (`bookings/shuttles.ts`) = par navette `fromCents` (TTC à `minTripKm`, 1 passager, tarif en vigueur) et
  `available` (oui/non via `findEligibleDrivers`, jamais de nombre ni position ; null sans lat/lng ou si Redis
  tombe). Position prise seulement si déjà autorisée (`LocationService.currentPositionIfAllowed`, aucune demande).
- Clés Google mobiles : `android/local.properties` (`MAPS_API_KEY`), `ios/Flutter/Secrets.xcconfig`
  (`GOOGLE_MAPS_API_KEY`), `--dart-define=GOOGLE_MAPS_API_KEY` pour Places. Voir APPLICATIONS_MOBILES.md.
  Le projet Google Cloud sera créé par le porteur de projet sur le compte TechvonixDigital@gmail.com
  (date à annoncer) : ne rien créer ni configurer sur ce compte depuis Claude Code.
- Module 8 (onboarding chauffeur) en relecture. Backend `src/drivers/` : `POST /drivers/me/documents`
  (multipart, 2 Mo max, type détecté par signature binaire JPEG/PNG/PDF, 20 envois/h), `POST /drivers/apply`,
  `GET /drivers/me/profile`. Documents : modèle `DriverDocument` (clé opaque, jamais exposée) et
  `DocumentStorage` (disque local `UPLOAD_DIR` en dev, S3 privé à brancher). `roseEligible`,
  `documentsVerified`, `approvedAt` ne sont jamais modifiables par le candidat (Module 10 admin).
  App : `DriverOnboardingScreen` (route `/driver/onboarding`, pas encore reliée depuis un menu),
  photos via `image_picker` + `flutter_image_compress` (EXIF/GPS retirés, < 2 Mo).
- `xlcab_backend/.gitignore` créé au Module 8 (il n'existait pas) : `.env` et `storage/` exclus.
- Module 9 (portail corporate) en relecture. Backend `src/corporate/` : comptes (ouverture par un
  `admin` XLCAB uniquement), membres, plafonds mensuels, analytics, relevé mensuel, réservation pour
  un collaborateur via `BookingsService.createPassengerTrip` (course + PassengerBooking +
  `TripPriceLine` par régime de TVA). `Trip` a gagné `corporateId`, `costCenter`, `bookedById`.
  Chaque appel revérifie l'appartenance en base (`adminContext`), pas seulement le rôle du jeton.
  `POST /api/v1/geocode` (Google Geocoding, clé serveur) pour le web.
- `xlcab_corporate/` : portail React 18 + Vite 7 + Tailwind 4 (tokens Partie 5 dans
  `src/index.css`), composants shadcn/ui écrits à la main (`src/components/ui`), polices
  auto-hébergées (`public/fonts`). Commandes : `npm run dev` (proxy /api → :3000), `npm test`
  (Vitest + axe), `npm run build`. Pages en `lazy`, jsPDF chargé au clic sur « Exporter ».
  Relevé exporté ≠ facture légale (à émettre côté serveur).
  Traduction FR/EN (2026-10-08) : `src/lib/i18n/` (`fr.ts` = référence, `en.ts` typé `Record<MessageKey,string>` :
  une clé manquante ne compile pas), `t('cle', { param })`. Langue fixée au chargement (localStorage
  `xlcab.corporate.lang`, sinon navigateur : fr → fr, sinon en) ; `setLang` recharge la page (session gardée par
  les cookies) — d'où des textes utilisables même au niveau des modules (menus, schémas zod). Formats via
  `locale` (fr-FR / en-IE). En-tête `X-Locale` sur toutes les requêtes (erreurs serveur traduites).
  `LanguageSwitch` (menu + connexion). Tests : `src/test/setup.ts` force le français ; `lib/i18n.test.ts`
  recharge les modules en anglais (`vi.resetModules`).
- Module 10 (dashboard admin) en relecture. Backend : `src/two-factor/` (TOTP RFC 6238 maison, testé
  sur les vecteurs officiels ; secret chiffré AES-256-GCM avec `TWO_FACTOR_ENC_KEY` ; preuve 2FA =
  JWT 12 h signé avec une clé DÉRIVÉE de JWT_SECRET, en-tête `X-2FA-Token`, vérifiée par
  `TwoFactorGuard`). `src/admin/` : `@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)` sur tout
  `/api/v1/admin/*`. `src/audit/` (AuditLog, global) et `src/notifications/` (Notification en base,
  push FCM à brancher). Les SOS sont persistés en `Incident` par `TrackingService.queueSos` (et
  partent même si la base est indisponible). 2FA appliquée aux admins seulement : la rendre
  obligatoire pour `corporate_admin` demande d'ajouter l'écran de code au portail corporate.
- `xlcab_admin/` : application admin React séparée (port 5174, proxy /api et /ws). Traduite FR/EN (2026-10-08)
  exactement comme le portail : `src/lib/i18n/` (clé de langue `xlcab.admin.lang`), `LanguageSwitch`, `X-Locale` en HTTP
  et `auth.locale` pour le WebSocket des alertes SOS. Ne jamais nommer une variable locale `t` (masque `t()`). Même socle que
  le portail (copié, pas partagé) + `socket.io-client` (alertes SOS, suivi en direct) + `qrcode`.
- Tests front : jsdom ne gère ni la frappe dans `input[type=month]` (utiliser `fireEvent.change`) ni
  `Blob.text()` / `Response(Blob)`. Ne jamais tester avec une valeur égale à la valeur par défaut
  du jour (un test du portail passait à vide en septembre).
- Durées de tests aberrantes (milliers de secondes) = mise en veille de la machine pendant
  l'exécution, pas une régression : relancer.
- Session des portails web (Module 2 modifié avec accord, `src/auth/web-session.ts`) : avec l'en-tête
  `X-Client: web`, login/signup/refresh posent le refresh token en cookie HttpOnly SameSite=Strict
  (`xlcab_refresh`, Path=/api/v1/auth, 30 j) et l'ôtent du corps ; 2FA enable/verify posent la preuve
  en cookie `xlcab_2fa` (Path=/api, 12 h). `TwoFactorGuard` lit l'en-tête X-2FA-Token OU le cookie ;
  `GET /auth/2fa/status` renvoie `proofValid`. Logout web efface les deux. Sans `X-Client`, contrat
  inchangé (app mobile). CORS `credentials: true`. Portails : `credentials: 'include'`, aucun jeton
  en sessionStorage, reprise de session par refresh au chargement, indicateur `twoFactorVerified`.
  JWT : `algorithms: ['HS256']` imposé partout.
- Connexion Flutter : `AuthService` (login/signup/logout via `plainDioProvider`, SANS intercepteur),
  `TokenRefresher` (rotation unique partagée par les requêtes simultanées ; `offline` ne déconnecte
  pas, `invalid` oui), intercepteur 401 dans `dioProvider` (une seule nouvelle tentative, FormData
  cloné).
- Module Trips (`src/trips/`) : GET /trips/:id, start (≤ T−60 min, dashcam active, QR facultatif),
  complete, cancel (frais CGV 0/50/100 % dans `cancellation.ts` ; désistement chauffeur = retour en
  recherche automatique ; admin sans frais). `Trip.cancellationFeeCents` ajouté.
- Courses programmées (décision prise au Module Trips) : occupation d'un chauffeur calculée sur le
  créneau (`schedulesOverlap`, marge 1 h, `MatchingService.busyDrivers`), revérifiée à
  l'acceptation ; `driver:trip` posé à l'acceptation seulement si départ ≤ T+60 min, sinon activé par
  `TrackingService.recordDriverLocation` à T−60 min (vérification max 1×/min).
- Consentement (Module 2 modifié avec accord) : `SignupDto.acceptTerms` (= true) + `termsVersion`
  (doit égaler `TERMS_VERSION`, défaut `DEFAULT_TERMS_VERSION`) ; `User.termsAcceptedAt/termsVersion`
  + AuditLog `user.consent` (IP, appareil). Côté app : constante `termsVersion` dans `auth_service.dart`,
  à faire évoluer avec le backend à chaque nouvelle version des CGU.
- Paiements (`src/payments/`, SDK `stripe` 23, `import Stripe = require('stripe')`) : PRÉPAIEMENT à la
  réservation (une autorisation Stripe expire à 7 jours). `POST /bookings/passenger` crée la course en
  `awaiting_payment` + PaymentIntent (idempotence `trip-payment-{tripId}`) ; paiement confirmé
  (webhook signé ou `/payments/confirm`) → `pending` + dispatch automatique. Annulation → remboursement
  (payé − frais), frais CGV seulement si un chauffeur était engagé (`accepted`). Un incident Stripe
  ne bloque jamais l'annulation (`refundPending`, AuditLog `payment.refund_failed`). Webhook :
  `rawBody: true` dans main.ts, déduplication Redis `stripe:event:{id}`. Remboursement manuel admin
  avec 2FA. Courses d'entreprise : jamais Stripe (facture mensuelle). Client Stripe injecté
  (`STRIPE_CLIENT`) ; double de test `src/testing/fake-stripe.ts`.
- App : écrans 7 (`payment_screen.dart`) et 8 (`confirmation_screen.dart`, QR `qr_flutter`).
  `PaymentSheetPresenter` (interface, feuille Stripe native) ; si le prix serveur ≠ devis affiché,
  seconde confirmation obligatoire. Android : `MainActivity` = `FlutterFragmentActivity` et thèmes
  AppCompat (exigés par flutter_stripe).
- Jest : `testTimeout` 15 s (tests d'intégration lents à froid, juste après une modification).
- `src/testing/memory-prisma.ts` : faux Prisma générique en mémoire pour les tests d'intégration
  (filtres égalité / in / not / gte-gt-lte-lt / OR, select, include, create imbriqué, aggregate).
- Thème : `secondaryContainer`/`onSecondaryContainer` (puces sélectionnées) et boutons à contour/texte
  redéfinis pour le contraste AA. Tout nouvel écran doit passer `textContrastGuideline`.
- **Flutter 3.47.5 est installé dans `C:\Users\Admin\dev\flutter`, pas dans le PATH de la session.**
  Préfixer chaque commande : `$env:Path = "C:\Program Files\Git\cmd;C:\Users\Admin\dev\flutter\bin;" + $env:Path`.
  Ne pas modifier `pubspec.yaml` avec Get-Content/Set-Content de PowerShell 5.1 (corrompt l'UTF-8) :
  utiliser les outils d'édition.
- Flutter ≥ 3.27 requis (`Color.withValues`, `CardThemeData`). Réseau : `dioProvider`
  (`lib/services/api_service.dart`, URL via `--dart-define=API_BASE_URL=...`, https obligatoire en
  release) ; jetons dans `flutter_secure_storage` (`TokenStorage`).
- Dans l'app, les données API passent par un provider Riverpod ; les tests widget remplacent ce
  provider (`overrideWith`) au lieu de simuler le réseau. Doubles partagés : `test/support/fakes.dart`.
  Carte Google, horloge et anti-rebond sont injectables (`bookingMapBuilderProvider`, `clockProvider`,
  `quoteDebounceProvider`).
- Google Places passe par un Dio **distinct** de `dioProvider` (qui ajoute le JWT XLCAB) : ne jamais
  appeler Google avec `dioProvider`.
- Tests d'accessibilité : `meetsGuideline(iOSTapTargetGuideline | androidTapTargetGuideline |
  labeledTapTargetGuideline | textContrastGuideline)`, appliqués à chaque écran.
- Lancer `flutter analyze .` DANS chaque paquet (`packages/core`, `packages/ui`, `apps/passenger`, `apps/driver` ;
  lancé ailleurs, il peut répondre « No issues »
  à tort).
- `flutter analyze lib test` : aucune remarque (2026-10-07).
- Tests widget avec un compte à rebours ou un timer périodique à l'écran : pas de `pumpAndSettle`
  (ne se stabilise jamais) ; avancer par `pump(durée)` et démonter l'écran en fin de test
  (`pumpWidget(SizedBox())`) pour arrêter les timers.
- Une `BoxDecoration` avec `boxShadow` doit avoir une `color` opaque : sinon l'ombre transparaît sous
  le contenu et fait échouer `textContrastGuideline`.
- Les `.zip` à la racine sont des livraisons antérieures ; ne pas les considérer comme du code actif.

## Commandes (depuis `xlcab_backend/`)

```bash
npm install
npx prisma generate                 # après toute modif de prisma/schema.prisma
npx prisma migrate dev --name <nom>
npm test                            # Jest, tous les *.spec.ts sous src/
npm test -- src/auth/auth.service.spec.ts       # un seul fichier
npm test -- -t "refuse un refresh"              # un seul test par nom
npm run build                       # nest build (vérifie aussi le typage)
npm run start:dev
```

Applications Flutter : `flutter pub get` depuis la racine `C:\xlcab` ; `flutter analyze .`, `flutter test` et
`flutter build apk` dans `apps/passenger` ou `apps/driver` (guide : `APPLICATIONS_MOBILES.md`). Exemple :
`flutter test test/screens/home_screen_test.dart`.

Les tests unitaires du backend mockent Prisma, Redis et JwtService via `Test.createTestingModule` + `useValue` :
aucune base ni Redis n'est nécessaire pour `npm test`.

## Architecture backend

- **Monolithe modulaire NestJS**, un module par domaine (Auth, Tracking, Matching, …) enregistré dans
  `src/app.module.ts`. Routes REST préfixées `api/v1/...` directement dans `@Controller`.
- `PrismaModule` et `RedisModule` sont globaux. `RedisService` **étend** le client ioredis : toutes les
  commandes Redis (`geoadd`, `lpush`, `incr`…) sont appelables directement dessus.
- `prisma/schema.prisma` : les modèles de la Partie 4 sont ajoutés au fur et à mesure des modules
  (à ce jour User, Trip, TrackingPoint, DriverProfile, Vehicle, PassengerBooking, JurisdictionConfig).
  Pas de relation Prisma vers `User` (elle obligerait à modifier le modèle du Module 2) : le lien se
  fait par id. `DriverProfile.roseEligible` = habilitation Navette Rose cochée par un admin (on ne
  stocke pas le genre).
- `main.ts` : Helmet, `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted` : tout champ non
  déclaré dans un DTO renvoie 400), `TRUST_PROXY=true` uniquement derrière Nginx.

### Modèle d'authentification (à réutiliser, ne pas réinventer)

- Payload JWT : `{ sub: userId, role, jti }`. `jti` = identifiant de session (un par appareil).
- Access token signé avec `JWT_SECRET` (15 min), refresh avec `JWT_REFRESH_SECRET` (30 j).
- Session active : clé Redis `refresh:{userId}:{jti}` ; rotation à chaque refresh, rôle relu en base.
- Révocation d'un access token : clé Redis `blacklist:{accessToken}` (vérifiée dans `JwtStrategy`).
  Tout nouveau point d'entrée authentifié (HTTP ou WebSocket) doit vérifier cette blacklist.
- RBAC : `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`. La Partie 8 impose aussi un contrôle
  d'**ownership** (rôle seul insuffisant).
- Rate limiting maison via compteur Redis `incr` + `expire` au premier hit.
- Rôles : `passenger | driver | corporate_admin | corporate_member | admin`. L'inscription crée toujours
  `passenger`.
