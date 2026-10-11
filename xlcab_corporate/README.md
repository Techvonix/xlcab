# XLCAB — Portail corporate (Module 9)

Espace web des administrateurs de comptes entreprise (Partie 7, écran 14) :
tableau de bord, gestion d'équipe, réservation pour un collaborateur,
relevé mensuel avec export CSV/PDF (TVA personnes 0 % / marchandises 20 %
séparées).

React 18 + Vite, Tailwind 4, composants au format shadcn/ui
(`src/components/ui`), TanStack Query + Zustand, react-hook-form + zod,
Recharts, TanStack Table, jsPDF.

```bash
npm install
npm run dev        # http://localhost:5173 — backend attendu sur :3000
npm test           # Vitest + Testing Library + axe
npm run build      # typage + build de production (dist/)
```

## Accès

Réservé au rôle `corporate_admin`. Un compte entreprise est ouvert par
l'équipe XLCAB (`POST /api/v1/corporate/accounts`, rôle `admin`), qui
désigne un compte XLCAB existant comme administrateur.

## Avant la mise en production

- **2FA obligatoire pour `corporate_admin`** (Partie 8) : pas encore
  implémentée dans le Module 2.
- **Refresh token** : aujourd'hui en `sessionStorage` ; à remplacer par un
  cookie `httpOnly` posé par le backend.
- **En-têtes de sécurité** de l'hébergement (CSP, HSTS, X-Frame-Options).
- Le relevé exporté **n'est pas une facture légale** : la facture officielle
  (numérotation continue, mentions XLCAB France SAS, n° REVTC) doit être
  émise côté serveur.
