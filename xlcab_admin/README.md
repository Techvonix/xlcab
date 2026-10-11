# XLCAB — Dashboard admin (Module 10)

Outil interne de l'équipe XLCAB (Partie 9, Module 10) : validation des
chauffeurs et de leurs documents, suivi des courses en direct, incidents
SOS, utilisateurs, configuration des juridictions, journal d'audit.

Application **séparée** du portail corporate (outil interne ≠ espace
client) : à déployer sur un domaine distinct, idéalement restreint par IP
ou VPN.

```bash
npm install
npm run dev        # http://localhost:5174 — backend attendu sur :3000 (API + WebSocket)
npm test           # Vitest + Testing Library + axe
npm run build
```

## Accès

1. Compte au rôle `admin` (créé en base, jamais en libre-service).
2. **Double authentification obligatoire** (Partie 8) : au premier accès,
   scanner le QR code avec une application d'authentification ; ensuite,
   code à 6 chiffres à chaque session. Le backend exige la preuve 2FA
   (en-tête `X-2FA-Token`) sur tous les endpoints `/api/v1/admin/*`.
3. Backend : `TWO_FACTOR_ENC_KEY` doit être défini (`openssl rand -base64 32`).

## Réinitialiser la 2FA d'un admin (téléphone perdu)

Pas de libre-service (un mot de passe volé ne doit pas suffire) :
supprimer sa ligne `TwoFactorAuth` en base, après vérification d'identité.
Il réactivera la 2FA à sa prochaine connexion.
