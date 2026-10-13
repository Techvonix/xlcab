# Guide : mettre Stripe Connect en service en mode test

Ce guide vous mène, étape par étape, jusqu'au premier essai réel du paiement des lignes et de la bourse.
Tout se fait en **mode test** : aucune vraie carte, aucun vrai virement, aucun argent.

Comptez environ 30 minutes pour les étapes 1 à 5. Les étapes 6 et 7, c'est Claude qui les fait.

> **Règle à ne jamais oublier.** Les clés qui commencent par `sk_` et `whsec_` sont secrètes : vous les
> collez vous-même dans le fichier `xlcab_backend/.env.local`, **jamais dans la conversation**. Seule la clé
> qui commence par `pk_test_` peut être envoyée à Claude.

Les libellés du tableau de bord Stripe changent de temps en temps. Si un menu ne porte pas exactement le nom
indiqué ici, cherchez le mot-clé (« Connect », « Webhooks », « Clés API ») dans la barre de recherche de Stripe.

---

## Ce que vous aurez à la fin

Quatre valeurs Stripe et un IBAN, rangés ainsi :

| Valeur | Commence par | Où elle va |
|---|---|---|
| Clé secrète | `sk_test_` | `xlcab_backend/.env.local` |
| Secret des notifications de paiement | `whsec_` | `xlcab_backend/.env.local` |
| Secret des notifications des comptes opérateurs | `whsec_` | `xlcab_backend/.env.local` |
| Clé publiable | `pk_test_` | à envoyer à Claude |
| IBAN de XLCAB (et BIC) | `FR76…` | `xlcab_backend/.env.local` |

---

## Étape 1 — Passer en mode test

1. Connectez-vous sur <https://dashboard.stripe.com>.
2. Activez le **mode test** (un interrupteur « Mode test » ou un environnement de test, en haut de l'écran).
   Tant qu'il est actif, un bandeau le rappelle et les clés commencent par `sk_test_` / `pk_test_`.

Restez en mode test pour toute la suite.

## Étape 2 — Activer Connect

Connect est la partie de Stripe qui permet de reverser de l'argent à des tiers (ici, les opérateurs).

1. Dans le menu, ouvrez **Connect** et lancez la mise en route.
2. Si Stripe demande le type de plateforme, choisissez le modèle **place de marché / plateforme** : la
   plateforme encaisse les clients, puis reverse aux vendeurs.
3. Si Stripe demande le type de comptes des vendeurs, choisissez **Express** : c'est Stripe qui recueille
   l'identité et l'IBAN de l'opérateur sur ses propres pages.
4. Vérifiez que la **France** fait partie des pays où vos vendeurs peuvent s'inscrire.

Stripe peut aussi demander le nom et l'icône affichés aux opérateurs pendant leur inscription : mettez
« XLCAB ». C'est modifiable plus tard.

## Étape 3 — Récupérer les deux clés

1. Ouvrez **Développeurs → Clés API**.
2. **Clé publiable** (`pk_test_…`) : copiez-la, vous l'enverrez à Claude à l'étape 5.
3. **Clé secrète** (`sk_test_…`) : affichez-la et copiez-la. Elle va dans le fichier de l'étape 5, nulle
   part ailleurs.

## Étape 4 — Les notifications de Stripe (webhooks)

Stripe prévient le serveur XLCAB quand un paiement aboutit ou quand le compte d'un opérateur est validé.
Sur votre PC, le serveur n'est pas joignable depuis Internet : il faut un relais. Deux solutions.

### Solution A — L'outil en ligne de commande de Stripe (recommandée pour l'essai)

C'est un petit programme officiel de Stripe qui relaie les notifications vers votre PC.

1. **Demandez à Claude de le télécharger et de le lancer** (c'est un téléchargement : il vous demandera
   votre accord). Il s'installe dans `C:\Users\Admin\dev`, sans rien modifier dans Windows.
2. Au premier lancement, l'outil affiche un lien : ouvrez-le dans votre navigateur et autorisez l'accès à
   votre compte Stripe. C'est vous qui cliquez, pas Claude.
3. L'outil affiche ensuite une ligne du type `Your webhook signing secret is whsec_…`. **Ce même secret
   sert pour les deux lignes** `STRIPE_WEBHOOK_SECRET` et `STRIPE_CONNECT_WEBHOOK_SECRET` de l'étape 5.
   Vous pouvez le lire dans la fenêtre du terminal et le copier vous-même.

L'outil doit rester ouvert pendant tout l'essai. La commande que Claude lancera :

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe --forward-connect-to localhost:3000/api/v1/webhooks/stripe-connect
```

### Solution B — Un serveur de test en ligne (pour plus tard)

Quand l'API tournera sur un serveur accessible en https, vous créerez deux destinations dans
**Développeurs → Webhooks** :

| Destination | Adresse | Événements à cocher | Portée |
|---|---|---|---|
| Paiements | `https://VOTRE-API/api/v1/webhooks/stripe` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` | votre compte |
| Comptes opérateurs | `https://VOTRE-API/api/v1/webhooks/stripe-connect` | `account.updated` | **comptes connectés** |

Chaque destination a son propre secret `whsec_…` : celui des paiements va dans `STRIPE_WEBHOOK_SECRET`,
celui des comptes connectés dans `STRIPE_CONNECT_WEBHOOK_SECRET`. Attention à la portée de la seconde :
si elle écoute « votre compte » au lieu des « comptes connectés », les comptes des opérateurs ne passeront
jamais à « validé ».

## Étape 5 — Remplir le fichier de configuration

Ouvrez `C:\xlcab\xlcab_backend\.env.local` avec le Bloc-notes et ajoutez (ou complétez) ces lignes, avec
vos vraies valeurs entre les guillemets :

```
STRIPE_SECRET_KEY="sk_test_…"
STRIPE_WEBHOOK_SECRET="whsec_…"
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_…"
LINE_PAYMENT_MODE="connect"

INVOICE_SELLER_IBAN="FR76 …"
INVOICE_SELLER_BIC="…"
```

- `LINE_PAYMENT_MODE="connect"` est l'interrupteur : il active le paiement en ligne des lignes et de la
  bourse. Pour revenir à la démo sans paiement, remettez `"deferred"` (ou supprimez la ligne).
- Le BIC est facultatif. Un IBAN mal recopié n'est jamais imprimé sur une facture : le serveur le contrôle.

Enregistrez le fichier, puis écrivez à Claude :

> « Les clés Stripe sont en place. Clé publiable : pk_test_… »

## Étape 6 — Ce que Claude fait ensuite

1. Relancer l'API pour qu'elle lise la nouvelle configuration, et vérifier qu'elle démarre sans alerte.
2. Recompiler l'appli passager avec votre clé publiable, et l'installer sur le téléphone de démo.
3. Lancer le relais des notifications (solution A).

## Étape 7 — Le scénario d'essai

Claude le déroule sur le téléphone, avec les comptes de démo. Les étapes marquées **(vous)** demandent que
vous saisissiez vous-même des informations sur les pages de Stripe : ce sont des données de test fournies
par Stripe, mais Claude ne remplit pas de formulaire d'identité ou de coordonnées bancaires à votre place.

| # | Qui | Action | Résultat attendu |
|---|---|---|---|
| 1 | Claude | Appli chauffeur (Djamel) : « Compte de versement » → « Ouvrir mon compte de versement » | Les pages de Stripe s'ouvrent dans le navigateur du téléphone |
| 2 | **vous** | Remplir l'inscription avec les valeurs de test que Stripe propose sur ses pages (bouton ou mention « données de test ») | Retour sur la page « Informations transmises à Stripe » |
| 3 | Claude | Revenir dans l'appli chauffeur | Le compte passe à « Vérification en cours » puis « Compte de versement validé » |
| 4 | Claude | Appli chauffeur : confirmer les départs de la semaine | Accepté (c'était refusé tant que le compte n'était pas validé) |
| 5 | Claude | Appli passager (Léa) : réserver 2 places Paris–Beauvais | La feuille de paiement Stripe s'ouvre, 50,00 € |
| 6 | **vous** | Saisir la carte de test `4242 4242 4242 4242`, une date future, un cryptogramme quelconque | « Réservation confirmée », sièges affichés |
| 7 | Claude | Appli chauffeur : démarrer puis terminer le départ | Le trajet passe à « terminé » |
| 8 | Claude | Appli chauffeur : « Compte de versement » | Un reversement de 45,00 € « Versé » (50 € moins 10 % de commission) |
| 9 | Claude | Tableau de bord Stripe, mode test | Le paiement de 50 € et le virement de 45 € vers le compte de Djamel |

Puis les cas d'échec, pour vérifier que rien ne reste bloqué :

| Cas | Comment | Résultat attendu |
|---|---|---|
| Paiement abandonné | Fermer la feuille de paiement sans payer | Message « Paiement non finalisé », les sièges redeviennent libres |
| Carte refusée | Carte de test `4000 0000 0000 9995` (fonds insuffisants) | Message de refus, réservation annulée, rien de débité |
| Carte avec validation | Carte de test `4000 0025 0000 3155` (3-D Secure) | Écran de validation de la banque, puis réservation confirmée |
| Bourse | Léa choisit une proposition de Djamel, valide sa carte ; Djamel confirme | Carte seulement autorisée au choix, débitée à la confirmation |
| Bourse, refus | Djamel décline au lieu de confirmer | Autorisation levée, rien de débité |

Les numéros de carte ci-dessus sont les cartes de test publiées par Stripe : elles ne fonctionnent qu'en
mode test.

Deux points que seul l'essai dira, parce qu'ils dépendent de Stripe et non de notre code :

- **Les pages de retour.** Après l'inscription, Stripe renvoie l'opérateur vers une page de l'API. En local
  cette adresse est en `http://localhost:3000`. Stripe l'accepte normalement en mode test ; s'il la refuse,
  il faudra passer par un serveur en https (solution B).
- **Le bonus de reprise.** Il est viré depuis le solde de la plateforme. En mode test ce solde est vide au
  départ : Stripe fournit une carte de test (`4000 0000 0000 0077`) qui crédite le solde disponible
  immédiatement.

---

## Si quelque chose ne marche pas

| Ce que vous voyez | Cause probable | Que faire |
|---|---|---|
| « Paiement momentanément indisponible » dans une appli | `STRIPE_SECRET_KEY` absent, ou API pas relancée | Vérifier `.env.local`, demander à Claude de relancer l'API |
| Le compte de l'opérateur reste « à compléter » | Notifications des comptes non reçues | Vérifier que le relais tourne (solution A) ou la portée « comptes connectés » (solution B). L'appli relit aussi l'état à chaque retour sur l'écran |
| Réservation payée mais toujours « en attente » | Notification de paiement non reçue | Même vérification ; l'appli confirme aussi d'elle-même après la feuille de paiement |
| « Ouvrez votre compte de versement… » en confirmant un départ | Compte de l'opérateur pas encore validé par Stripe | Finir l'inscription (étape 7, lignes 1 à 3) |
| « Bourse de transport bientôt disponible » | `LINE_PAYMENT_MODE` n'est pas `connect` et le serveur est en production | Mettre `LINE_PAYMENT_MODE="connect"` |
| Facture sans IBAN | `INVOICE_SELLER_IBAN` absent ou mal recopié | Corriger la ligne ; la page « Factures » de l'admin affiche une alerte tant qu'il manque |

---

## Avant de passer en réel (plus tard)

Ce guide ne couvre que le mode test. Le passage en production demandera en plus :

- les clés **live** (`sk_live_…`, `pk_live_…`) et deux destinations de webhook en https (solution B) ;
- la validation de votre plateforme Connect par Stripe (questionnaire sur votre activité) ;
- les mentions légales du vendeur (`INVOICE_SELLER_*`) complètes ;
- vos décisions encore ouvertes : part retenue sur les reversements, frais d'annulation, priorité du bonus
  du chauffeur de secours ;
- les validations de votre avocat (conditions générales opérateur, pénalités) et de votre comptable (TVA
  des frais d'annulation et des pénalités).
