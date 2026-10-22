# XLCAB — Ce qui reste avant le lancement

Dossier du 22 octobre 2026. Il recense tout ce qui sépare l'application actuelle d'un lancement réel en France
(premier pays), à partir du code, des dossiers du projet (`CLARIFICATION_MODELE.md`, `PROTOCOLE_ANNULATION_CHAUFFEUR.md`,
`CHARTE_CAMERA_EMBARQUEE.md`, `GUIDE_STRIPE_CONNECT.md`) et de l'état de la production.

Légende : 🔴 bloquant pour le lancement · 🟠 à faire avant le lancement si possible · 🟢 après le lancement.
Qui : **Vous** (porteur de projet), **Claude** (code), **Juriste**, **Expert-comptable**.

## 1. Décisions prises le 22 octobre 2026

| Sujet | Décision | Appliqué |
|---|---|---|
| Retenue d'une pénalité chauffeur sur ses reversements | **50 % au plus** de chaque reversement ; le reste par la facture à 30 jours | ✅ réglage par défaut (`PENALTY_WITHHOLD_PERCENT`) |
| Pénalité recouvrée en partie | **Le chauffeur de secours d'abord** (bonus 160 €), puis les avoirs passagers (100 €) | ✅ déjà le fonctionnement |
| TVA des frais d'annulation passager | **Avec la TVA du transport réservé** | ✅ factures ; ⚖️ à confirmer par l'expert-comptable |
| TVA des pénalités chauffeur | **Hors champ** (indemnité) | ✅ inchangé ; ⚖️ à confirmer par l'expert-comptable |

## 2. Ce qui est fait et vérifié

Réservation de navettes, lignes régulières et départs ponctuels, bourse de transport, seuil de départ garanti,
points de rencontre et arrêts, prix et revente par tronçon, colis (3 modes + lignes), suivi en temps réel, SOS,
partage du trajet, notes et signalements, caméra embarquée (charte), paiement Stripe et Stripe Connect (en mode
test simulé), reversements et pénalités, factures légales, export et suppression RGPD, portail entreprise,
tableau de bord admin, deux applis (passager, chauffeur), français et anglais. Tests automatiques : tous verts.

## 3. Bloquant — comptes et services à créer (Vous)

| # | Quoi | Pourquoi c'est bloquant |
|---|---|---|
| 3.1 🔴 | **Google Cloud** : clés Maps, Places, Routes | Sans Places, un passager ne peut saisir aucune adresse (seuls les favoris marchent) ; sans Routes, pas de devis de course |
| 3.2 🔴 | **Firebase** (notifications push) | Aujourd'hui les notifications restent dans l'appli : un passager dont le départ est annulé ne le saura qu'en l'ouvrant |
| 3.3 🔴 | **Service d'e-mail** (SendGrid ou équivalent) + domaine d'envoi | Pas de « mot de passe oublié » ni de confirmation d'adresse sans e-mail |
| 3.4 🔴 | **Stripe** : essai complet en mode test, puis compte live et Stripe Connect activé | Rien ne s'encaisse sans lui ; essai décrit dans `GUIDE_STRIPE_CONNECT.md` |
| 3.5 🔴 | **Hébergement en Europe** (serveur, base PostgreSQL gérée avec sauvegardes, Redis avec mot de passe) + nom de domaine + certificats | L'API ne tourne aujourd'hui que sur ce PC |
| 3.6 🔴 | **Stockage S3 privé** (AWS ou équivalent européen) | Documents des chauffeurs (aujourd'hui sur le disque local) |
| 3.7 🔴 | **Comptes développeur** Google Play (25 $ une fois) et Apple (99 $/an) | Publication des deux applis |
| 3.8 🔴 | **Un Mac**, ou un service de compilation iOS en ligne | L'appli iPhone n'a jamais été compilée (impossible sous Windows) |
| 3.9 🔴 | **Informations de la société** (`INVOICE_SELLER_*` : raison sociale, SIREN, TVA, capital, registre VTC) et **IBAN** | Mentions obligatoires des factures |
| 3.10 🟠 | Repasser le dépôt GitHub **en privé** | Le code est lisible par tous (aucun secret dedans) |

## 4. Bloquant — juridique et comptable (Juriste, Expert-comptable)

| # | Quoi | Où sont les questions |
|---|---|---|
| 4.1 🔴 | **CGU / CGV passager** (seuil garanti, annulation gratuite puis frais, colis, objets interdits) | `CLARIFICATION_MODELE.md` §8 |
| 4.2 🔴 | **Conditions générales opérateur** : commission 10 % et sa durée, pénalité 260 €, autorisation de retenue, force majeure, contestation | `PROTOCOLE_ANNULATION_CHAUFFEUR.md` |
| 4.3 🔴 | **Politique de confidentialité**, mentions légales, registre des traitements, contact DPO (`dpo@xlcab.com` affiché) | liens de l'appli à fournir (`config/legal.dart`) |
| 4.4 🔴 | **Caméra embarquée** : charte, durée de conservation, analyse d'impact (AIPD) | `CHARTE_CAMERA_EMBARQUEE.md` §8 |
| 4.5 🔴 | **Statut de transport** : inscription LOTI, vente à la place, départ ponctuel, arrêts sur la voie publique | `CLARIFICATION_MODELE.md` §8 (questions 1, 2, 4) |
| 4.6 🔴 | **Assurances** : responsabilité civile de la plateforme, colis transportés | `CLARIFICATION_MODELE.md` §8 (question 6) |
| 4.7 🟠 | Préférence « conductrice » et Navette Rose : non-discrimination | question 7 |
| 4.8 🟠 | TVA des frais d'annulation et des pénalités (décision provisoire ci-dessus) ; facture de pénalité | question 8 — **Expert-comptable** |

## 5. Bloquant — code (Claude, sans attendre les comptes quand c'est possible)

| # | Quoi | Dépend de |
|---|---|---|
| 5.1 🔴 | **Mot de passe oublié** et confirmation de l'adresse e-mail (serveur + deux applis) | code faisable tout de suite ; envoi réel avec 3.3 |
| 5.2 🔴 | **Notifications push** dans les deux applis (seuil atteint ou manqué, secours, colis, demandes de conservation…) | code faisable tout de suite ; envoi réel avec 3.2 |
| 5.3 🔴 | **Mise en production** : image du serveur, configuration de production, déploiement, sauvegardes, journaux et alertes | 3.5 |
| 5.4 🔴 | **Versions publiables des applis** : signature, icônes et écrans des stores, fiches « données collectées » | 3.7, 3.8 |
| 5.5 🔴 | **Stockage S3** des documents chauffeurs | 3.6 |
| 5.6 🟠 | Suivi des plantages des applis (rapports d'erreurs) | — |
| 5.7 🟠 | Recette complète sur téléphone avec Stripe en mode test (passager, chauffeur, admin) | 3.4 |

## 6. Avant d'ouvrir — exploitation (Vous, avec l'équipe)

- 🔴 **Points de rencontre réels** : vérifier sur place chaque point (accès, arrêt autorisé, consignes) ; les positions
  de démo sont approximatives.
- 🔴 **Premiers opérateurs** : vérifier leurs documents et licences dans l'admin, leur faire accepter les conditions,
  ouvrir leur compte de versement Stripe.
- 🔴 **Équipe support** : comptes admin avec double authentification, astreinte pour les SOS et les départs en danger.
- 🟠 **Tarifs** réels des navettes (page « Tarifs » de l'admin) et facteur CO₂ du minibus à confirmer (Base Empreinte).
- 🟠 Validation du graphisme (logo, icônes) par un designer.

## 7. Après le lancement (décidé : plus tard)

Covoiturage entre particuliers (second produit, après avis juridique), points relais commerçants, envoi des extraits
de caméra (après S3 et juriste), enregistrement audio du SOS, photo de profil, autres pays (un avis juridique et une
configuration par pays), langue irlandaise.

## 8. Ordre proposé

1. **Tout de suite, en parallèle** : Claude code 5.1 (mot de passe oublié) et 5.2 (notifications push) ; vous lancez
   la création des comptes 3.1 à 3.7 et l'envoi des questions au juriste et à l'expert-comptable (section 4).
2. **Dès que Stripe test est prêt** : essai complet 3.4 puis recette 5.7.
3. **Dès que l'hébergement est choisi** : mise en production 5.3 et S3 5.5, sur un environnement de préproduction.
4. **Dès que les textes juridiques sont prêts** : intégration dans les applis, puis publication 5.4 en test fermé
   (Google Play « test interne », Apple TestFlight) avec quelques chauffeurs et passagers.
5. **Lancement** dans une première ville, une fois la section 6 faite.
