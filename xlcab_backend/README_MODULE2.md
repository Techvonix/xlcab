# XLCAB Backend — Module 2 : Auth

## Installation (à lancer dans Claude Code / votre machine, avec réseau)

```bash
npm install
cp .env.example .env
# Remplir .env : DATABASE_URL, REDIS_HOST, JWT_SECRET, JWT_REFRESH_SECRET

npx prisma generate
npx prisma migrate dev --name init_user

npm run test        # doit passer : 19 tests dans auth.service.spec.ts
npm run start:dev   # démarre sur http://localhost:3000
```

## Vérifier que ça fonctionne

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@xlcab.com","password":"motdepasse123"}'
```

Vous devez recevoir `{ "accessToken": "...", "refreshToken": "..." }`.
Le compte créé a toujours le rôle `passenger` : envoyer un champ `role`
renvoie une erreur 400 (les rôles chauffeur et corporate passent par
une demande + validation, voir Partie 8).

## Ce que couvre ce module

- `POST /auth/signup`, `/login`, `/otp/send`, `/otp/verify`,
  `/refresh`, `/logout`, `DELETE /auth/account` (squelette)
- JWT access (15 min) + refresh (30 j) avec rotation et révocation
  (blacklist Redis)
- Rate limiting login : 5 tentatives / 15 min par email+IP, compté
  avant la recherche en base
- OTP SMS (stub Twilio à brancher — voir `sendOtp()`), envoi limité à
  3 / 15 min par numéro et 10 / heure par IP
- Une session par appareil : refresh token stocké sous
  `refresh:{userId}:{jti}`, rotation à chaque usage, rôle relu en base
  à chaque refresh, logout limité à l'appareil courant
- RBAC : `JwtAuthGuard` + `RolesGuard`/`@Roles()` réutilisables sur
  tout futur endpoint
- 19 tests unitaires (signup, login, rate limiting, OTP, sessions)

## Ce qui reste pour ce module

- En production derrière Nginx : `TRUST_PROXY=true` dans `.env`, sinon
  toutes les requêtes partagent l'IP du proxy pour le rate limiting

- Brancher Twilio réellement dans `AuthService.sendOtp()`
- OAuth Google / Apple (`/auth/oauth/google`, `/auth/oauth/apple`)
- `forgot-password` / `reset-password` (nécessite SendGrid)
- Suppression de compte réelle avec anonymisation RGPD (sera dans
  `UsersModule`, appelé depuis `AuthController.deleteAccount`)

## Prochaine étape

Module 3 — Backend Tracking WebSocket (Partie 10), qui peut
réutiliser `JwtStrategy` déjà en place ici pour authentifier les
connexions Socket.io.
