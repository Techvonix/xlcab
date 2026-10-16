# XLCAB — Dossier de clarification du modèle

Rédigé le 14 octobre 2026 à la demande du porteur de projet, **avant** toute nouvelle fonction et avant les
vidéos explicatives. Aucun code n'a été modifié pour ce dossier.

Objectif : partir des **problèmes réels** de chaque acteur, dire honnêtement ce que l'appli fait aujourd'hui,
ce qui manque, ce qui doit être validé par un juriste, et lister les décisions à prendre. Chaque décision
porte une recommandation ; rien n'est construit tant qu'elle n'est pas tranchée.

Légende : ✅ fait et vérifié · 🟡 partiel · ❌ absent · ⚖️ à faire valider par un juriste.

---

## 1. Principes (le « pourquoi » de XLCAB)

1. **Une tribu, pas une appli à cash.** Les chauffeurs-opérateurs sont des partenaires : revenus prévisibles,
   règles stables, protection quand un collègue fait défaut (protocole de secours), recours humain.
2. **Commission de 10 % qui ne bouge pas.** Déjà fixe dans le code (`DRIVER_COMMISSION_PERCENT`, calculée sur
   le HT). À inscrire comme **engagement écrit** dans les conditions générales opérateur.
3. **Économies pour les passagers, rentabilité pour les chauffeurs** : remplir les places vides (vente à la
   place, colis, trajets retour) plutôt qu'augmenter les prix.
4. **Écologie mesurée honnêtement** : le chiffre CO₂ est toujours affiché avec sa méthode, jamais embelli.
5. **Sécurité pour tous** : passagers, chauffeurs et colis.
6. **Ne jamais montrer (vidéo, site, réseaux) une fonction qui n'existe pas.**

## 2. Les acteurs et leurs problèmes

| Acteur | Son problème | Réponse XLCAB aujourd'hui | Ce qui manque |
|---|---|---|---|
| Passager | Le train est cher ou complet, la voiture seul coûte cher, le covoiturage est incertain (annulations) | ✅ Navettes à prix fixe, lignes régulières à la place, bourse (demande → offres), départ garanti par le protocole de secours, avoir de 20 % si aucun secours | ❌ Départ ponctuel simple, arrêts intermédiaires, points de rencontre nommés |
| Expéditeur de colis | Envoyer vite et pas cher sur un trajet que quelqu'un fait déjà | ✅ Colis greffé sur une course passager, sur un trajet retour, ou navette dédiée ; QR d'enlèvement, code de remise, photo | ❌ Colis sur les lignes régulières, points relais |
| Chauffeur-opérateur | Rouler à vide, voir un trajet annulé faute de monde, commissions élevées qui changent | ✅ 10 % fixe, reversement après chaque trajet, colis retour, secours payé + bonus | ❌ **Seuil de départ garanti** (aujourd'hui il porte seul le risque de remplissage) |
| Territoire / planète | Voitures avec une seule personne à bord | ✅ Impact CO₂ par passager avec sa méthode | 🟡 Facteur « minibus » à confirmer sur la Base Empreinte de l'ADEME |

## 3. Les régimes de transport : à clarifier en premier ⚖️

C'est le point le plus important du dossier : **navette, ligne régulière, transport urbain et covoiturage ne
relèvent pas du même cadre légal.** Les mélanger dans une même appli sans validation est le principal risque
au lancement.

| Mode | Qui conduit | Cadre (à confirmer ⚖️) | Dans l'appli |
|---|---|---|---|
| Navette à la demande (véhicule entier) | Professionnel | VTC ou transport occasionnel LOTI | ✅ Réservation instantanée |
| Ligne régulière, vente à la place | Professionnel LOTI vérifié | Transport public collectif (licence LOTI de XLCAB et de l'opérateur) | ✅ Lignes (vente à la place réservée aux opérateurs vérifiés par l'admin) |
| Bourse (demande → offres) | Professionnel | Transport occasionnel | ✅ Bourse |
| Transport urbain régulier | Professionnel | Organisé par l'autorité des mobilités (Île-de-France Mobilités à Paris) : une ligne urbaine régulière demande en principe son accord | ❌ Hors périmètre (la spec prévoit des trajets de 60 km et plus) |
| Covoiturage classique | **Particulier** | Partage des frais **sans bénéfice** pour le conducteur ; la plateforme peut prendre des frais de service | ❌ Absent |

**Recommandation** : au lancement, XLCAB = **transport professionnel** (navettes, lignes, bourse) uniquement.
Le covoiturage entre particuliers serait un **second produit**, distinct (autres règles de prix : le
conducteur ne peut pas gagner d'argent, autre assurance, pas de licence), à étudier avec le juriste. Le
transport urbain régulier attend un échange avec l'autorité organisatrice. Les **points de rencontre**
(section 5.3) peuvent, eux, servir dès maintenant aux lignes professionnelles.

## 4. Côté passager : les quatre situations demandées

### 4.1 Léa envoie un colis vers un chauffeur qui va dans sa direction

- ✅ **Aujourd'hui** : Léa décrit le colis (30 kg, 120 × 80 × 80 cm au plus). Le serveur cherche, dans cet ordre :
  1. une course passager qui fait le même trajet (départ et arrivée à 3 km près, départ dans les 12 h) :
     forfait 8 € HT, 3 colis / 60 kg par course ;
  2. le trajet retour d'un chauffeur déjà engagé (5 colis / 100 kg) ;
  3. sinon une navette Bleue dédiée, au tarif kilométrique.
  Puis QR d'enlèvement, suivi, code de remise à 4 chiffres connu de Léa seule, photo de remise obligatoire.
- ❌ **Manque** :
  - les colis ne montent **pas** sur les lignes régulières (le cas le plus naturel : « Djamel fait Paris–Beauvais
    tous les matins ») ;
  - Léa doit être à moins de 3 km du départ : pas de dépôt en point relais ni au point de rencontre.
- **Proposition** : colis sur les lignes, avec une capacité « colis » par départ fixée par l'opérateur, remis au
  chauffeur **au point de départ ou au point de rencontre** avant le départ (scan du QR), retiré à l'arrivée
  avec le code de remise. Points relais commerçants dans un second temps (section 5.2).

### 4.2 Thomas cherche une place sur un Lyon → Limoges, dans le véhicule de Sami qui a déjà 4 passagers

- ✅ **Aujourd'hui** : si Sami a publié une **ligne vendue à la place**, Thomas la trouve dans « Trouver une
  place », voit les places restantes, choisit son siège et paie. La vente à la place n'est ouverte qu'aux
  opérateurs dont l'admin a vérifié la licence.
- ❌ **Manque** :
  - le **départ ponctuel** : « je pars demain à 8 h de Lyon pour Limoges, il me reste 3 places ». Aujourd'hui Sami
    devrait créer une ligne d'un seul jour, ce qui est artificiel ;
  - les **arrêts intermédiaires** (Lyon → Clermont-Ferrand → Limoges), donc les places vendues sur une partie
    seulement du trajet ;
  - une course instantanée réservée par un client n'est jamais partagée avec d'autres inconnus (c'est voulu :
    le client a payé le véhicule entier).
- **Proposition** : « Publier un départ » en 3 écrans dans l'appli chauffeur (départ, arrivée, date, heure,
  places, prix par place, arrêts facultatifs). Techniquement, un départ ponctuel réutilise tout ce qui existe
  pour les lignes (réservation, sièges, embarquement, secours, paiement, reversement).

### 4.3 Comment le départ se débloque avec 5 places remplies sur 7

- **Aujourd'hui** : il n'existe **aucun seuil**. L'opérateur confirme son départ, puis le met en vente ; ensuite
  le départ a lieu même avec **un seul** passager. Le passager a une certitude ; le chauffeur porte seul le
  risque de remplissage, ce qui le pousse à ne pas publier.
- **Proposition retenue par le porteur de projet : le seuil de départ garanti** (section 4.5).

### 4.4 Comment le chauffeur reçoit le « top départ » avec 5 passagers

- **Aujourd'hui** : pas de message dédié. Le chauffeur voit sa liste d'embarquement, appuie sur « Je suis en
  route » (contrôlé à T−60 min), puis démarre au plus tôt 1 h avant le départ.
- **Proposition** : le top départ = le message « **Départ confirmé** » envoyé au chauffeur ET aux passagers à
  l'instant où le seuil est atteint (ou quand le chauffeur confirme volontairement en dessous du seuil).

### 4.5 Le seuil de départ garanti (proposition détaillée)

1. **À la publication**, le chauffeur fixe :
   - le nombre de places (ex. 7) ;
   - son **seuil** (ex. 4) : « je pars d'office dès 4 passagers » ;
   - le prix par place.
2. **Avant le seuil**, le départ est réservable et s'affiche « En attente de 2 passagers pour être confirmé ».
   Le passager sait qu'il sera intégralement remboursé si le départ n'est pas confirmé.
3. **Seuil atteint** → « Départ confirmé » (le top départ), notification à tous. À partir de là, l'engagement
   du chauffeur est ferme : protocole de secours, pénalités dès la 3e annulation, etc. Les places restantes
   continuent de se vendre.
4. **Échéance** (recommandation : **24 h avant le départ**) sans seuil atteint → départ annulé **sans frais pour
   personne**, remboursement intégral, et l'appli propose aux passagers une autre ligne ou la bourse. Aucune
   pénalité pour le chauffeur : il n'avait pas atteint son seuil.
5. Le chauffeur peut à tout moment **confirmer en dessous de son seuil** (« je pars quand même »).

Exemple (illustratif) : 7 places à 30 € TTC, seuil 4. Recette minimale garantie au chauffeur = 4 × 30 =
120 € TTC, soit 109,09 € HT (TVA transport 10 %), commission XLCAB 10,91 €, **net chauffeur 98,18 €**. À 7
passagers : 171,82 € net.

**Le paiement avant le seuil** (contrainte technique : une carte ne peut pas rester bloquée plus de 7 jours) :

- **Option A — débit immédiat, remboursement intégral automatique** si le départ n'est pas confirmé.
  Fonctionne quelle que soit la date du départ. Inconvénient : un remboursement met 5 à 10 jours à
  apparaître sur le compte du passager.
- **Option B — carte bloquée sans débit** (comme la bourse aujourd'hui), réservations ouvertes 6 jours avant
  le départ au plus. Rien n'est débité si le départ n'a pas lieu. Inconvénient : on ne peut pas vendre un
  départ plus de 6 jours à l'avance.
- Recommandation : **A**, plus simple pour le passager (il réserve quand il veut) et déjà couverte par le
  circuit de remboursement existant.

## 5. Côté chauffeur

### 5.1 Les modes d'opération dans l'appli chauffeur

| Mode | État |
|---|---|
| Missions à la demande (dispatch, 30 s pour accepter) | ✅ |
| Lignes régulières (mes départs, embarquement par QR, réserves n° 2 et 3) | ✅ |
| Bourse (demandes de clients, propositions de prix, messages sans coordonnées) | ✅ |
| Reprises urgentes (secours d'un collègue, bonus de 160 €) | ✅ |
| Colis : enlèvement, remise avec code et photo, colis au retour | ✅ |
| Revenus, reversements, pénalités, compte de versement Stripe | ✅ (essai réel Stripe à faire) |
| Départ ponctuel avec seuil garanti | ❌ (section 4) |
| Arrêts et points de rencontre | ❌ (section 5.3) |
| Colis déposés en point relais | ❌ (section 5.2) |
| Covoiturage, transport urbain régulier | ❌ (section 3 : décision juridique d'abord) |

### 5.2 Colis depuis un point relais

- ❌ N'existe pas.
- Deux niveaux possibles :
  1. **Point de rencontre = point de dépôt** : l'expéditeur remet le colis au chauffeur au point de rencontre de
     la ligne, avant le départ (scan du QR). Aucun partenaire nécessaire. **Recommandé pour commencer.**
  2. **Points relais commerçants** (bureau de tabac, épicerie…) : le commerçant garde le colis, le chauffeur le
     récupère. Demande des contrats avec les commerçants, une responsabilité définie en cas de perte, une
     assurance ⚖️, un écran « commerçant ». À faire dans un second temps.
- Rappel : l'assurance responsabilité civile pour les colis reste à déterminer (décision antérieure).

### 5.3 Points de rencontre (Porte Maillot, Porte de Saint-Cloud, Porte d'Orléans…)

- ❌ Aujourd'hui une ligne a un départ, une arrivée et une tolérance de 5 km, sans arrêt nommé.
- **Proposition** :
  - un **catalogue de points de rencontre** tenu par l'équipe XLCAB (nom, position exacte, consignes d'accès,
    métro / bus à proximité, possibilité de s'arrêter sans gêner) — choisis pour être sûrs, éclairés et
    autorisés à l'arrêt ⚖️ (règles de stationnement de la ville) ;
  - le chauffeur compose sa ligne ou son départ ponctuel à partir de ces points (départ, arrêts, arrivée,
    heure de passage à chaque arrêt) ;
  - le passager réserve « de tel point à tel point » ; ces points servent aussi au dépôt des colis.
- Décision à prendre : prix unique quel que soit le tronçon, ou prix par tronçon fixé par le chauffeur
  (recommandé : prix par tronçon, sinon personne ne réserve un trajet court au prix du long).

### 5.4 La caméra (dashcam) pour la sécurité de tous

- ✅ Aujourd'hui : le chauffeur **déclare** sa dashcam au dossier ; sans véhicule équipé, le serveur refuse de le
  mettre en ligne et de démarrer une course. L'appli ne filme rien et ne stocke aucune image.
- Filmer des passagers impose des obligations (information visible des passagers, finalité, durée de
  conservation, qui accède aux images) ⚖️ et la CNIL encadre ces dispositifs.
- Trois niveaux possibles :
  1. déclaration seule (aujourd'hui) + photo de la caméra montée à la validation du véhicule ;
  2. **enregistrement gardé dans la caméra du véhicule**, écrasé en boucle, extrait seulement en cas
     d'incident ou de SOS, avec autocollant d'information et charte signée par le chauffeur ;
  3. vidéo envoyée et stockée par XLCAB : lourd (stockage, sécurité, demandes d'accès), à éviter au lancement.
- Recommandation : **niveau 2**, à faire valider ⚖️.

### 5.5 Protection et rémunération du chauffeur (rappel de ce qui existe)

- ✅ Commission 10 % fixe sur le HT ; la TVA des colis n'est pas un revenu ; reversement après chaque trajet.
- ✅ Secours : réserves n° 2 et n° 3, puis alerte aux opérateurs compatibles ; le secours qui reprend touche le
  prix du départ + 160 € de bonus (financé par la pénalité du défaillant).
- ✅ Pénalité de 260 € seulement dès la 3e annulation abusive sur 12 mois, avec contestation et justificatif.
- ❓ Frais de carte Stripe (environ 1,5 % + 0,25 € par paiement européen) : aujourd'hui ils sont **à la charge
  de XLCAB**, pris sur ses 10 %. À confirmer : c'est cohérent avec « 10 % qui ne bouge pas », mais cela réduit
  la marge réelle de XLCAB à 8 % environ sur un petit montant.

## 6. Sécurité pour tous (ce qui existe)

- ✅ Documents chauffeur vérifiés (permis, carte professionnelle, assurance, contrôle technique) ; mise hors
  ligne automatique à l'expiration.
- ✅ Suivi en temps réel ; partage du trajet à des contacts de confiance par un lien sans adresse exacte.
- ✅ SOS : appel au 112 d'abord, puis alerte à l'équipe avec la position.
- ✅ Préférence « conductrice » (non exclusive, « ce n'est pas une garantie »).
- ✅ Prénom seul, téléphone visible seulement 1 h avant ; plaque masquée après la course.
- ✅ Signalement d'un chauffeur ; notes ; l'équipe lit les commentaires.
- ❌ Enregistrement audio du SOS (30 s) : non fait, demande consentement et stockage.

## 7. Écologie

- ✅ Impact CO₂ par passager : nombre de places × (0,218 − 0,29 / personnes à bord) × km, jamais négatif,
  avec la méthode affichée. 0,218 kg/km = voiture thermique (ADEME).
- 🟡 0,29 kg/km pour un minibus diesel vient d'une source néerlandaise : à confirmer sur la Base Empreinte.
- Effet direct du seuil garanti : plus de personnes par véhicule, donc un chiffre qui s'améliore réellement.

## 8. Questions pour le juriste ⚖️

1. Cohabitation dans une même marque de transport professionnel (LOTI, VTC) et de covoiturage entre
   particuliers : possible ? avec quelles séparations ?
2. Départ ponctuel vendu à la place par un opérateur LOTI : qualification (occasionnel ou régulier ?),
   formalités.
3. Seuil de départ garanti et annulation faute de passagers : rédaction des CGV passager et des conditions
   opérateur (le passager doit le savoir avant de payer).
4. Points de rencontre : arrêt et prise en charge sur la voie publique (Paris : portes, gares routières).
5. Dashcam : information des passagers, durée de conservation, accès aux images.
6. Colis : responsabilité et assurance (chauffeur, XLCAB, point relais), objets interdits.
7. Préférence « conductrice » et Navette Rose : non-discrimination.
8. TVA des pénalités et des frais d'annulation ; facture de pénalité.
9. Clause « commission de 10 % garantie » : durée de l'engagement, conditions de révision.

## 9. Décisions

**Toutes les recommandations D1 à D13 sont VALIDÉES par le porteur de projet le 14 octobre 2026.**

Portée : le modèle doit s'appliquer **dans chaque grande ville européenne** où XLCAB s'implantera, sous réserve
des contraintes juridiques locales. Conséquences pour la conception :

- tout paramètre qui dépend du pays (TVA, licence exigée pour vendre à la place, échéance du seuil, distance
  minimale, textes légaux, devise) vit dans la configuration de la juridiction (`JurisdictionConfig`), jamais en
  dur dans le code ;
- les points de rencontre sont rattachés à une **ville** et choisis avec la réglementation locale de l'arrêt ;
- l'ouverture d'un pays suppose son propre avis juridique (questions de la section 8 reprises pays par pays)
  et une configuration de juridiction relue ; tant qu'elle manque, le pays reste fermé ;
- textes de l'appli traduits (déjà en place pour le français et l'anglais) et heures en heure locale de la
  ligne (déjà en place : fuseau par ligne).

| # | Décision | Recommandation (validée) |
|---|---|---|
| D1 | Périmètre du lancement | Transport professionnel seulement (navettes, lignes, départs ponctuels, bourse) ; covoiturage = second produit après avis juridique ; pas de transport urbain régulier |
| D2 | Seuil de départ garanti | Oui, fixé par le chauffeur à la publication |
| D3 | Échéance du seuil | 24 h avant le départ |
| D4 | Paiement avant le seuil | Option A : débit immédiat, remboursement intégral automatique |
| D5 | Départ ponctuel (« je pars demain, 3 places ») | Oui, avec le même seuil |
| D6 | Arrêts intermédiaires | Oui, à partir du catalogue de points de rencontre |
| D7 | Prix par tronçon | Oui, fixé par le chauffeur |
| D8 | Points de rencontre : qui les choisit | L'équipe XLCAB (catalogue), le chauffeur choisit dedans |
| D9 | Colis sur les lignes | Oui, capacité colis par départ, remise au point de rencontre |
| D10 | Points relais commerçants | Plus tard, après contrats et assurance |
| D11 | Dashcam | Niveau 2 : enregistrement dans le véhicule, extrait sur incident |
| D12 | Frais Stripe | Restent à la charge de XLCAB (les 10 % ne bougent pas pour le chauffeur) |
| D13 | Engagement 10 % | Écrit dans les conditions opérateur, durée à fixer avec le juriste |

## 10. Après les décisions : ordre de travail proposé

1. Seuil de départ garanti + « Départ confirmé » (top départ) sur les lignes existantes.
2. Départ ponctuel dans l'appli chauffeur.
3. Catalogue de points de rencontre (admin) + arrêts et prix par tronçon.
4. Colis sur les lignes, remis au point de rencontre.
5. Charte et mention dashcam (selon l'avis juridique).
6. Essai réel Stripe (clés de test).
7. **Vidéos explicatives** (ci-dessous), tournées seulement quand tout ce qu'elles montrent fonctionne.

### Scénario de la vidéo passager (à valider)

1. Thomas cherche Lyon → Limoges : il trouve le départ de Sami (« 4 passagers, départ confirmé » ou « encore
   1 passager pour confirmer »), choisit son siège et son point de rencontre, paie.
2. Le seuil est atteint : Thomas reçoit « Départ confirmé ».
3. Léa envoie un colis : il part sur un départ qui va dans sa direction ; elle le dépose au point de rencontre,
   suit le trajet, le destinataire donne le code de remise.
4. Sécurité : partage du trajet, contacts de confiance, SOS.
5. Après le trajet : note du chauffeur, impact CO₂ avec sa méthode.

### Scénario de la vidéo chauffeur (à valider)

1. Sami publie un départ ponctuel : 7 places, seuil 4, arrêts aux points de rencontre, colis acceptés.
2. Il reçoit les réservations, puis le **top départ** « Départ confirmé ».
3. Le jour J : « Je suis en route », embarquement par QR, colis scannés, dashcam (mention et charte).
4. Les autres modes : missions à la demande, bourse (propositions de prix), reprise urgente d'un collègue.
5. Revenus : 10 % de commission fixe, reversement après le trajet, compte de versement.
