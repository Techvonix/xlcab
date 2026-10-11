# XLCAB — Protocole d'annulation d'un chauffeur sur une ligne régulière

Version validée du 9 octobre 2026 (décisions du porteur de projet au § 6). Cas de référence : le chauffeur n° 1 de la ligne Paris–Beauvais
(départ 5 h) annule au dernier moment alors que 7 ou 14 passagers ont réservé. Objectif : **aucun passager
laissé sur le trottoir**.

---

## 1. Principe : chaque départ a deux secours désignés à l'avance

Pour chaque ligne régulière, l'opérateur titulaire (chauffeur n° 1) est doublé de **deux chauffeurs de
réserve classés** : le n° 2, puis le n° 3.

**Désignation des réserves**
- Elles sont proposées par XLCAB ou par l'opérateur, et chacune doit accepter son rôle.
- Une réserve accepte un rôle pour toute la ligne ou pour des jours précis (astreinte).

**Conditions pour être réserve d'un départ**
- Compte chauffeur validé et profil opérateur vérifié.
- Documents à jour à la date du départ : permis, carte VTC ou licence, assurance, contrôle technique.
- Véhicule d'une capacité au moins égale aux places vendues. Sinon, deux réserves peuvent se partager le
  groupe, par exemple deux vans de 8 places pour 14 passagers.
- Ligne vendue à la place : licence de transport collectif (LOTI) vérifiée, comme pour le titulaire.
- Aucun autre engagement sur le créneau (même contrôle `schedulesOverlap` que pour les courses actuelles).

**Contreparties pour les réserves** (décidé) : celle qui reprend le départ touche **le prix du départ et un bonus de reprise**, financé par la pénalité du chauffeur défaillant. Pas de prime d'astreinte.

## 2. Ce qui déclenche le protocole

| Déclencheur | Détection |
|---|---|
| Le n° 1 annule dans l'app | Immédiate |
| Le n° 1 ne confirme pas « Je suis en route » à T−60 min | Rappel push à T−75 min, puis déclenchement à T−60 min |
| Le n° 1 n'envoie aucune position GPS à T−45 min alors qu'il s'est dit en route | Déclenchement automatique |
| Document ou véhicule devenu invalide (contrôle quotidien de conformité) | Déclenchement dès la détection |

L'infrastructure de suivi existe déjà : le service de suivi active la course du chauffeur à T−60 min et reçoit
ses positions.

## 3. La cascade, minute par minute

1. **Le n° 2 est sollicité aussitôt** : notification push, sonnerie et offre dans l'app chauffeur. C'est le
   même mécanisme que l'offre de course actuelle, qui propose une course à un chauffeur à la fois.
   - Délai de réponse : **5 minutes** si le départ est dans moins de 3 h, **15 minutes** sinon.
2. **Le n° 2 refuse, ne répond pas, ou annule plus tard** : le n° 3 est sollicité dans les mêmes conditions.
3. **Le n° 3 échoue aussi** : alerte générale à **tous les opérateurs vérifiés compatibles** à proximité
   (bourse en mode urgence). Le premier qui accepte et passe les contrôles prend le départ.
4. **En parallèle, dès l'étape 1** : un **incident « départ en danger »** s'ouvre dans le dashboard admin
   (même canal que les alertes SOS). Le support XLCAB peut appeler les chauffeurs, affecter un chauffeur à la
   main ou commander un véhicule partenaire.
5. **Aucune solution à T−30 min** : les passagers sont prévenus sans attendre. On leur propose :
   - un remboursement à 100 % automatique ;
   - un **avoir de compensation** (montant à décider) ;
   - si possible, une solution de remplacement (départ suivant de la ligne, autre ligne, transport partenaire).

**Côté passagers**
- Tant qu'un secours prend le relais, le passager est seulement informé du changement : « Votre chauffeur a
  changé : Karim, Renault Trafic ». Le QR de prise en charge et l'heure ne changent pas.
- Le nouveau chauffeur reçoit la liste d'embarquement et le point de rendez-vous.
- Aucune coordonnée du chauffeur défaillant ne circule.

**Traçabilité** : chaque étape est inscrite au journal d'audit (qui, quand, délai de réponse).

## 4. Pénalité du chauffeur qui n'honore pas sa course

Votre règle : à partir de la **3e annulation abusive**, débit de **260 €** sur le compte du chauffeur, pour le
sensibiliser au service client.

**Ce qui compte comme une annulation**
- Annulation par le chauffeur, ou absence (déclenchements du § 2), **le jour même du départ** (heure
  locale) **ou moins de 12 h avant**, si cela commence plus tôt. Exemple : pour un départ à 5 h, une
  annulation dès 17 h la veille compte ; pour un départ à 19 h, dès minuit. Seuls comptent les départs qui
  ont des réservations.
- Ce qui ne compte **pas** : une annulation plus tôt (le protocole se déclenche quand même, sans
  sanction), et le **cas de force majeure justifié** : accident, hospitalisation, panne constatée, décès d'un
  proche… L'admin valide le justificatif, sous 7 jours.

**Échelle proposée** (sur 12 mois glissants)

| Annulation abusive | Conséquence |
|---|---|
| 1re | Avertissement écrit dans l'app et par e-mail, rappel des engagements |
| 2e | Dernier avertissement ; le chauffeur ne peut plus être réserve pendant 30 jours |
| 3e, puis **chacune des suivantes** | **Débit de 260 € à chaque fois** et revue du compte par l'admin, avec suspension possible des lignes |

**Garanties pour le chauffeur**
- Notification motivée.
- **Contestation possible pendant 7 jours** dans l'app ; l'admin tranche, et sa décision est tracée au
  journal d'audit.
- Aucun débit tant que la contestation est en cours.

**Recouvrement des 260 €** : retenue sur les prochains versements du chauffeur (Stripe Connect). À défaut,
facture de pénalité payable sous 30 jours. XLCAB ne prélève jamais de carte sans autorisation.

**Utilisation de la pénalité** (décidé) : partagée entre le **bonus du chauffeur de secours** qui a sauvé le départ et un **avoir pour les passagers** concernés.
(à décider).

⚠️ **Conditions juridiques préalables (à faire valider par votre avocat)**
- La pénalité doit figurer dans les **conditions générales opérateur**, acceptées avant la première ligne,
  avec le montant, le barème, la force majeure et la contestation.
- Elle doit rester proportionnée.
- Le chauffeur doit avoir signé l'autorisation de compensation sur ses versements.
- Sans ces conditions, le débit ne peut pas être appliqué.

## 5. Ce que cela demande dans l'application

**Données**
- `LineBackup` : ligne, chauffeur, rang 2 ou 3, jours d'astreinte, acceptation.
- Chauffeur affecté sur chaque départ (`LineDeparture.driverId`).
- `DriverCancellation` : départ, chauffeur, heure, délai avant départ, motif, justificatif, statut
  (`counted | justified | contested | waived`).
- `DriverPenalty` : 260 €, statut `pending | contested | applied | cancelled`, lien vers la retenue ou la
  facture.

**Serveur**
- Cascade n° 2 → n° 3 → bourse d'urgence, avec délais de réponse et verrou Redis : un seul secours peut
  gagner.
- Contrôles T−75 / T−60 / T−45 min dans le planificateur existant.
- Incident « départ en danger ».
- Notifications aux passagers.
- Compteur sur 12 mois et calcul de la pénalité.

**App chauffeur**
- Bouton « Je suis en route ».
- Offre de reprise d'un départ, avec la liste d'embarquement.
- Rôle de réserve : accepter ou refuser une astreinte.
- Historique des annulations et contestation.

**App passager** : message « chauffeur remplacé », ou proposition de remboursement et d'avoir.

**Admin**
- Liste des départs en danger.
- Affectation manuelle.
- Validation des justificatifs et des contestations.
- Suivi des pénalités.

**Tests**
- Cascade complète : n° 1 annule, n° 2 refuse, n° 3 accepte.
- Le n° 2 ne répond pas dans le délai.
- Deux secours acceptent en même temps : un seul gagne.
- Groupe de 14 passagers réparti sur deux vans.
- Force majeure : l'annulation ne compte pas.
- 3e annulation : 260 € en attente, puis contestation.
- Aucune donnée du chauffeur défaillant n'est montrée aux passagers.

**Place dans le plan** : ce protocole s'insère dans l'étape 2 (bourse et réservations sur les lignes). Il
doit fonctionner **avant** la vente réelle de places sur une ligne.

## 6. Décisions

Prises le 9 octobre 2026 :
1. Dernière minute = le jour même du départ ou moins de 12 h avant.
2. 260 € à chaque annulation abusive à partir de la 3e, sur 12 mois glissants.
3. Réserves : prix du départ + bonus de reprise (pas de prime d'astreinte).
4. Les 260 € : bonus du chauffeur de secours + avoir pour les passagers.

5. Partage des 260 € : **160 € de bonus** au chauffeur de secours, **100 € d'avoirs** répartis entre les passagers
   du départ. Sans pénalité encaissée (1re/2e annulation, force majeure), pas de bonus (montant réglable).
6. Aucun secours trouvé : remboursement à 100 % + **avoir de 20 %** du prix payé.
