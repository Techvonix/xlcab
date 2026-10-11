# XLCAB — Audit de l'existant et plan « Bourse de transport »

Réponse aux étapes 1 à 6 du cahier des charges « bourse internationale de transport » (9 octobre 2026).
Aucun code n'a été modifié : ce document attend la validation du périmètre MVP.

---

## 1. Ce que fait XLCAB aujourd'hui

XLCAB fonctionne aujourd'hui comme un **VTC de navettes à prix fixe**. Le client réserve un véhicule entier au
tarif de la grille XLCAB, paie à la réservation, et le serveur propose la course aux chauffeurs un par un
(30 s chacun) jusqu'à ce que l'un d'eux l'accepte.

La bourse demandée suit une autre logique : **une place de marché**. Le client publie une demande, les
opérateurs proposent leur prix, le client choisit, puis l'opérateur confirme. Les opérateurs publient aussi
leurs lignes régulières.

Les deux modes peuvent cohabiter : la bourse s'appuie sur presque tout l'existant. Une fois la réservation
confirmée, une course de la bourse peut redevenir une course XLCAB ordinaire, avec :

- le suivi en temps réel et le QR de prise en charge ;
- le démarrage et la fin de course ;
- la facture et l'avis du passager.

Les trois vidéos (`demo/videos/`) montrent les parcours en place :

- **Vidéo 1 – passager** : accueil, choix de la navette, réservation, profil, passage en anglais.
- **Vidéo 2 – suivi** : suivi de la course, profil du chauffeur, signalement.
- **Vidéo 3 – chauffeur** : mode chauffeur, mission programmée, revenus, courses récentes.

## 2. Inventaire : déjà disponible / à créer

| Section du cahier des charges | Déjà en place | À créer |
|---|---|---|
| **A. Réservation classique** | Départ et destination, date, passagers, type de navette, options (siège enfant, Wi-Fi, bagage supplémentaire, animaux), prix calculé par le serveur, prépaiement Stripe, confirmation, suivi, historique, annulation selon les CGV | Aller-retour, nombre et volume des bagages, demande immédiate (le départ doit être au moins à +2 h), **demande de devis** |
| **3. Demandes de transport** | — | Tout : publication, statuts, expiration |
| **3.3 Propositions des opérateurs** | Acceptation ou refus d'une offre par le chauffeur, mais à prix imposé | Proposition de prix, conditions, question avant confirmation, comparaison des offres par le client |
| **3.4 Confidentialité** | Téléphone visible seulement à T−60 min, prénom seul, plaque masquée après la course, contrôle d'appartenance sur chaque appel | Règles propres à la bourse : coordonnées révélées seulement après confirmation |
| **4. Profils opérateurs** | `DriverProfile` (permis, carte VTC, REVTC, langues, note, PMR), `Vehicle` (capacité, assurance, contrôle technique, dashcam), documents vérifiés par l'admin | Raison sociale, zones et villes desservies, types de prestation, tarifs indicatifs, profil public consultable avant réservation, sociétés et flottes |
| **5. Lignes régulières** | — | Tout : ligne, calendrier, exceptions, places par départ, pause |
| **6. Retours et places libres** | Retour chauffeur déjà géré pour les colis (`onReturnLeg`, départ retour estimé, occupation du chauffeur sur le créneau, `schedulesOverlap`) | Le même principe pour les passagers |
| **7. Comptes entreprises** | Portail web : comptes ouverts par un admin, membres, plafonds mensuels, centres de coût, réservation pour un collaborateur, tableaux de bord, factures mensuelles (PDF), relevé exportable (PDF/CSV), 2FA obligatoire, FR/EN | Rôles « gestionnaire de déplacements », « réservataire » et « comptabilité » ; plusieurs sites ; inscription en ligne avec vérification ; demandes multiples ; devis |
| **8. Agences et OTA** | Socle réutilisable : comptes organisation, membres, isolation des données par organisation | Type de compte agence, référence de dossier partenaire, tarifs contractuels, API publique versionnée avec clés et webhooks |
| **9. Hôtels et conciergeries** | (même socle) | Type de compte, instructions au chauffeur, mise à disposition à la journée |
| **10. Flottes** | 1 véhicule ↔ 1 chauffeur | Opérateur avec plusieurs véhicules et chauffeurs, affectation d'une mission |
| **11. Matching** | Chauffeurs en ligne à proximité (Redis GEO), navette compatible, habilitation Rose ou PMR, occupation sur le créneau | Rapprochement demande ↔ ligne ou opérateur, classement **expliqué** |
| **12. Commissions** | 10 % sur le HT, réglage unique dans `DRIVER_COMMISSION_PERCENT` ; revenus du chauffeur par jour, semaine et mois | Taux par type de compte et par contrat (versionnés, comme les tarifs), commission figée sur chaque course, rapprochement du vendredi |
| **13. Paiement et facturation** | Stripe (paiement, remboursements, webhooks), factures et avoirs numérotés sans trou, facture mensuelle entreprise | ⚠️ **Reversement aux opérateurs** : voir les points de vigilance (§ 3) |
| **14. Notifications** | Table `Notification` en base, textes FR/EN déjà au catalogue | Envoi push (Firebase en cours de création), préférences par type d'événement |
| **15. Suivi de prestation** | Statuts de course, suivi en temps réel, SOS, incidents | Statuts amont : demande, devis, confirmation |
| **16. Pilotage admin** | Dashboard (courses, incidents SOS, chauffeurs, tarifs, factures, notes, juridictions, journal d'audit) | Indicateurs de la bourse : demandes, taux de conversion, non attribuées, lignes, volume brut ≠ chiffre d'affaires XLCAB |
| **17. Vérification et conformité** | Documents chauffeur et véhicule avec échéances (rappels J−30 et J−7, mise hors ligne automatique), RGPD (export, anonymisation, purge), journal d'audit | Statut de vérification des organisations (non vérifié, en cours, validé, suspendu, expiré), documents d'entreprise |
| **Internationalisation** | FR/EN dans l'app, les portails et les messages du serveur ; table `JurisdictionConfig` par pays | Devises, fuseaux horaires par pays (aujourd'hui Europe/Paris) |

**Ce qu'on garde sans réécriture** : authentification (Module 2, figé), suivi temps réel, QR, démarrage et
fin de course, facturation, avis, conformité, i18n, journal d'audit, portails web. Aucune refonte n'est
nécessaire.

## 3. Points de vigilance à trancher AVANT de coder

Ces trois points conditionnent le modèle de données. Je ne peux pas les décider seul.

1. **Vente à la place sur les lignes régulières (réglementation).** Aujourd'hui XLCAB vend un véhicule entier
   au client. C'est le cadre VTC : un client ou un groupe, sur réservation préalable, dans un véhicule de 9
   places au plus, conducteur compris.
   - Vendre des **places à des clients différents** sur une ligne à horaire fixe (Paris–Beauvais 5 h) relève
     a priori du **transport collectif de personnes** :
     - inscription au registre des transporteurs de personnes ;
     - capacité professionnelle ;
     - déclaration à l'Autorité de régulation des transports pour une ligne de moins de 100 km, que la Région
       peut limiter.
   - Le **van de 14 places** de Chris dépasse la limite VTC et demande un permis D1 et ce même statut de
     transporteur.

   Ce n'est pas un avis juridique : **un juriste en transport doit valider**. Proposition pour le MVP :
   - « par véhicule » (privatisation) ouvert à tous les opérateurs vérifiés ;
   - « par place » réservé aux opérateurs dont la licence de transport collectif a été vérifiée par l'admin ;
   - capacité vendable toujours ≤ capacité homologuée moins le conducteur.

2. **Qui encaisse et qui reverse ?** Aujourd'hui Stripe encaisse **tout sur le compte XLCAB**, et rien n'est
   reversé automatiquement aux chauffeurs. Dans une place de marché, cela revient à détenir des fonds pour le
   compte de tiers (le cahier des charges le signale lui-même).
   - Recommandation : **Stripe Connect**. L'opérateur a son propre compte Stripe, le client paie l'opérateur
     et XLCAB prélève sa commission au passage. XLCAB ne détient jamais les fonds.
   - Cela demande le compte Stripe de production et l'activation de Connect par vous.
   - En attendant, la bourse peut fonctionner en mode « paiement à confirmer » : réservation confirmée, sans
     encaissement en ligne, pour les tests uniquement.

3. **Règles actuelles « 7 places et plus » et « 60 km et plus ».** Paris–Beauvais (≈ 85 km) et Paris–Orléans
   (≈ 130 km) passent. En revanche, les transferts hôtel ↔ aéroport (CDG ≈ 30 km) et les mises à disposition
   à la journée, cités au § 9, ne passent pas.
   - Faut-il lever la règle des 60 km pour la bourse, ou la garder ?

## 4. Plan technique priorisé

### Phase 1 — MVP Bourse (passagers et chauffeurs, app mobile + admin)

**Modèle de données** (une migration, uniquement des ajouts : aucune perte de données, rien de modifié dans
le Module 2)

- `OperatorProfile`
  - Champs : `userId` (ou `organizationId` en phase 2), `kind` (`independent | vtc_company | fleet |
    collective`), raison sociale, SIRET, n° de registre des transporteurs, villes desservies, types de
    prestation, langues, description publique.
  - `verificationStatus` (`unverified | pending | verified | suspended | expired`).
  - `perSeatAllowed` (licence de transport collectif vérifiée par l'admin).
  - Réutilise `DriverProfile`, `Vehicle` et `DriverDocument`.
- `RecurringLine`
  - Opérateur, véhicule, origine et destination (adresse, coordonnées, rayon de prise en charge), heure de
    départ locale (« 05:00 ») et fuseau horaire, jours de la semaine, dates de début et de fin.
  - Capacité : places par départ (≤ capacité du véhicule − 1), bagages.
  - Tarif : `pricingMode` (`per_vehicle | per_seat`), prix en centimes, conditions.
  - Retour possible (heure du retour), `status` (`active | paused | closed`).
  - Modifier une ligne crée une nouvelle **version** : les réservations déjà confirmées gardent l'ancienne.
- `LineException` : date fermée ou capacité réduite pour un jour donné.
- `LineDeparture`
  - Une ligne par départ réel (date, heure UTC), avec places confirmées par l'opérateur, places réservées et
    statut (`to_confirm | open | full | closed | cancelled`).
  - Les départs sont générés à 30 jours. **Un départ n'est réservable qu'une fois confirmé par l'opérateur**
    (confirmation groupée par semaine dans l'app).
- `TransportRequest`
  - Demandeur (+ organisation et référence de dossier partenaire, prévues pour les phases 2 et 3).
  - Trajet : départ et destination, date et heure, flexibilité en minutes, aller-retour et date du retour.
  - Besoins : passagers, bagages, type de véhicule, budget facultatif, besoins particuliers, commentaire.
  - Statut (`draft | published | offers_received | accepted | confirmed | in_progress | completed | cancelled
    | expired`) et date d'expiration.
- `TransportOffer`
  - Demande, opérateur, véhicule, prix, places, horaire proposé, conditions, validité.
  - Statut (`pending | accepted | confirmed | declined | withdrawn | expired`).
  - Messages question/réponse courts (`OfferMessage`) : jamais de numéro de téléphone ni d'e-mail avant
    confirmation (filtrage côté serveur).
- `Trip` (existant) : ajout de `source` (`instant | marketplace | line`), `offerId`, `lineDepartureId` et
  `commissionCents` (commission figée au moment de la réservation).

**Statuts** : un rapprochement n'est **jamais** une réservation. Le parcours complet est le suivant :

1. Le client accepte une offre : statut `accepted`.
2. L'opérateur reconfirme sa disponibilité dans un délai donné, avec revérification du créneau
   (`schedulesOverlap`) : statut `confirmed`.
3. Seulement alors, la `Trip` est créée et le paiement demandé.

**Matching** (règles explicites et testables, sans IA)

- Critères :
  - départ et arrivée dans le rayon de la ligne ou de la zone de l'opérateur ;
  - horaire dans la flexibilité ;
  - places et bagages suffisants ;
  - type de véhicule ;
  - opérateur `verified` aux documents valides ;
  - aucun chevauchement de créneau ;
  - départ confirmé et non complet.
- Chaque résultat porte son **explication**, par exemple « Départ à 2,1 km · horaire +15 min · 6 places
  libres · opérateur vérifié ».
- Classement : écart d'horaire, détour, prix, note.

**API** (`/api/v1/...`, même authentification, contrôle d'appartenance sur chaque route, messages FR/EN)

- `POST/GET/PATCH /market/requests`, `POST /market/requests/:id/publish|cancel`.
- `GET /market/requests/:id/offers` (demandeur seulement), `POST /market/offers/:id/accept`.
- `GET /market/feed` (demandes compatibles pour l'opérateur, adresses arrondies et sans identité du client).
- `POST /market/requests/:id/offers`, `POST /market/offers/:id/confirm|withdraw`.
- `GET/POST/PATCH /operators/me/lines`, `POST /operators/me/lines/:id/pause|resume`,
  `POST /operators/me/lines/:id/exceptions`.
- `GET /operators/me/departures?status=to_confirm` et `POST /operators/me/departures/confirm`.
- `GET /lines/search?from&to&date&seats` : départs réservables et explication du classement.
- Admin (2FA) : vérification des opérateurs, demandes non attribuées, suspension d'une ligne.

**Écrans**

- **App passager**
  - Dans « Réserver », deux choix : « Réserver maintenant » (actuel) et « Demander des devis ».
  - Résultats de lignes compatibles.
  - « Mes demandes » : comparaison des offres par prix, horaire, véhicule, note et vérification, puis
    acceptation.
- **App, mode chauffeur** : onglets « Bourse » (demandes compatibles, proposer un prix), « Mes lignes »
  (créer, calendrier, exceptions, pause) et « Départs à confirmer ».
- **Admin** : pages « Bourse » (demandes, offres, non attribuées) et « Opérateurs » (vérification,
  suspension).

**Notifications** : en base et dans l'app tout de suite ; push dès que Firebase est branché. Pas de doublon :
une notification par événement et par destinataire.

### Phase 2 — Comptes professionnels

- Extension de `CorporateAccount` en organisation générique : `kind` (`company | agency | hotel |
  operator`), pays, statut de vérification.
- Nouveaux rôles de membre : gestionnaire de déplacements, réservataire, comptabilité.
- Sites multiples, demandes multiples et devis depuis le portail web.
- Paiement différé ou crédit client : **jamais automatique**, activé par l'admin avec motif dans le journal
  d'audit.

### Phase 3 — Agences, OTA et hôtels

- Même portail web avec le type `agency` ou `hotel` : référence de dossier partenaire, tarifs contractuels
  visibles par ce seul partenaire, instructions au chauffeur.
- API publique `/partner/v1` : clés d'API par partenaire (stockées sous forme de hachage), limitation de
  débit, webhooks signés, documentation OpenAPI.
- Les connecteurs propres à chaque OTA viendront selon les partenaires réellement signés.

### Phase 4 — Commissions et rapprochement du vendredi

- Table `CommissionRule` versionnée (comme `Tariff`) : par défaut, par type de compte, par contrat.
- Le rapprochement du vendredi tourne dans le planificateur existant (verrou Redis) :
  - prestations terminées ;
  - paiements reçus ;
  - commissions dues ;
  - factures à émettre ;
  - annulations et remboursements ;
  - rapport CSV et PDF ;
  - entrée au journal d'audit.
- Les versements suivent les délais de Stripe Connect et les contrats, pas le vendredi.

### Phase 5 — International

Devises, fuseaux horaires et formats par pays (`JurisdictionConfig` existe déjà), autres langues,
optimisation des retours à vide pour les passagers (reprise du mécanisme des colis).

## 5. Le MVP réellement utilisable, au plus vite

Ordre de livraison proposé, chaque étape montrée avant la suivante (règle du projet) :

1. ✅ **Backend lignes régulières et départs** (9 oct.) : modèle, calendrier, exceptions, confirmation,
   recherche, avec les tests Paris–Beauvais et Paris–Orléans.
2. ✅ **Backend bourse** (9 oct.) : réservations sur les lignes, protocole d'annulation chauffeur (voir
   `PROTOCOLE_ANNULATION_CHAUFFEUR.md`), demandes, offres, acceptation puis confirmation, création de la
   course, admin.
3. ✅ **App chauffeur** (10 oct.) : « Mes lignes », départs à confirmer, « Je suis en route », liste
   d'embarquement, reprises en urgence, réserves, « Bourse », annulations et pénalités.
4. ✅ **App passager** (10 oct.) : « Demander des devis », « Mes demandes », réservation sur une ligne.
5. ✅ **Admin** (10 oct.) : vérification des opérateurs, départs en danger, pénalités, suivi de la bourse.
6. Nouvelle **vidéo complète** de démonstration, avec Djamel et Chris en comptes de démo.

Les paiements de la bourse restent en mode « à confirmer » jusqu'à l'activation de Stripe Connect.

## 6. Tests nécessaires avant la production

- **Scénarios d'acceptation A à H** en tests d'intégration (vraie application HTTP, base simulée, comme les
  tests existants) :
  - A : la ligne apparaît dans la recherche ;
  - B : demande, puis opérateur trouvé, puis offre ;
  - C : acceptation, confirmation et notifications ;
  - D : isolation entre entreprises ;
  - E : référence de dossier de l'agence ;
  - F : ligne en pause ou complète, plus jamais proposée ;
  - G : commission recalculable depuis le journal d'audit ;
  - H : aucun accès aux données d'un autre compte.
- **Horaires** : départ à 5 h heure de Paris aux changements d'heure (29 mars et 25 octobre), dernier jour du
  mois, exceptions.
- **Concurrence** : deux clients réservent la dernière place en même temps. Une seule réservation doit passer
  (mise à jour conditionnelle en transaction).
- **Capacité** : impossible de vendre plus que la capacité homologuée moins le conducteur ; réservation à la
  place refusée sans licence vérifiée.
- **Confidentialité** : la bourse ne montre ni nom, ni téléphone, ni adresse exacte avant confirmation ; les
  coordonnées glissées dans un message sont filtrées.
- **Traductions** : tout nouveau message d'erreur présent au catalogue anglais (test automatique existant).
- Accessibilité des nouveaux écrans (contraste, zones tactiles), comme pour tous les écrans actuels.
- Avant le lancement : relecture de sécurité, test de charge du fil des demandes, validation juridique (§ 3).
