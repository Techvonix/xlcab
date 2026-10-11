╔══════════════════════════════════════════════════════════════════╗
║  XLCAB — SPÉCIFICATION MAÎTRE POUR CLAUDE CODE                   ║
║  Version 1.0 — Document unique de construction                   ║
║  Dernière mise à jour : 23 septembre 2026                        ║
╚══════════════════════════════════════════════════════════════════╝

---

PARTIE 0 — INSTRUCTIONS À CLAUDE CODE

Tu vas construire XLCAB, application mobile de transport hybride (personnes + colis) pour trajets 60 km+ en navettes 7+ places. Ce document contient tout : contexte business, architecture, design, sécurité, juridique, publication stores.

Règles de travail :

1. Lis ce document en entier avant d'écrire la première ligne de code.
2. Procède module par module, dans l'ordre des parties 9 à 15.
3. Montre-moi le code de chaque module terminé avant de passer au suivant.
4. Commente tout en français.
5. Respecte strictement le design system (Partie 5).
6. Pose des questions si une zone d'ombre persiste.

---

PARTIE 1 — CONTEXTE BUSINESS

1.1 Identité

· Nom : XLCAB
· Site : www.XLCAB.com
· Baseline : "Navettes 7+ places. Trajets 60 km+. Colis inclus."
· Siège social : Dublin, Irlande (XLCAB Ltd.)
· Filiale opérationnelle : XLCAB France SAS (obligatoire pour agrément VTC, REVTC, contrats chauffeurs FR)
· Ambition : expansion européenne (ES, IT, DE, PT dans un second temps)

1.2 Positionnement produit

Application mobile de mobilité hybride unifiant :

· Transport de personnes : trajets 60 km+ en navettes 7+ places
· Transport de colis : retour de colis intégré aux trajets passagers

1.3 Les 4 navettes différenciées

Navette Couleur Cible Spécificités
Rose #E91E63 Femmes & familles Conductrice femme, sièges enfants, partage de trajet obligatoire
Bleue #2196F3 Suburbain mixte Prix accessible, module colis intégré
Orange #FF9800 Corporate / B2B Confort, Wi-Fi, facturation entreprise
Accessibilité #607D8B PMR Rampe, formation chauffeur, réservation prioritaire

1.4 Modèle d'affaires

· Paiement à la course (particuliers)
· Facturation mensuelle (B2B)
· Commission sur colis
· Abonnements corporate

---

PARTIE 2 — STACK TECHNIQUE

2.1 Mobile

Flutter 3.24+, Dart 3.5+, Riverpod 2.5+, go_router 14+, dio 5+, Hive, flutter_secure_storage, google_maps_flutter, flutter_stripe 11+, firebase_core/auth/messaging/analytics/crashlytics, intl, flutter_localizations, lottie, flutter_animate, qr_flutter, mobile_scanner, url_launcher, connectivity_plus, permission_handler.

2.2 Backend

Node.js 20 LTS, NestJS 10+, TypeScript 5.4+, Prisma 5+, PostgreSQL 16, Redis 7+, Socket.io 4+, Passport + JWT, class-validator + zod, Swagger/OpenAPI, Jest + Supertest, Pino logger.

2.3 Web (portail corporate + admin)

React 18 + Vite, TailwindCSS + shadcn/ui, TanStack Query + Zustand, react-hook-form + zod, Recharts, TanStack Table.

2.4 Infrastructure (stratégie économique)

· Mois 1-3 (dev) : AWS Free Tier + crédits AWS Activate Founders (1 000-5 000 $)
· Mois 4-12 (MVP) : AWS Lightsail 2 vCPU/2GB (12 $/mois) + Managed PostgreSQL (15 $/mois)
· Année 2 : Lightsail scale-up + crédits Activate
· Année 3+ : ECS Fargate + RDS + ElastiCache (uniquement si > 10 000 utilisateurs actifs)
· Hébergement données : AWS eu-west-3 (Paris) pour conformité RGPD
· CI/CD : GitHub Actions
· Monitoring : Sentry + CloudWatch
· Secrets : AWS Secrets Manager

---

PARTIE 3 — ARCHITECTURE GLOBALE

CLIENTS (Flutter passager + Flutter chauffeur + React corporate + React admin)
                          ↓
                    HTTPS / WSS
                          ↓
              API GATEWAY (Nginx + rate limiting)
                          ↓
        BACKEND NestJS (monolithe modulaire, prêt microservices)
        Modules : Auth, Users, Drivers, Bookings, Matching,
        Tracking, Payments, Notifications, Corporate, Admin, Jurisdiction
                          ↓
        PostgreSQL (principal) + Redis (cache/GEO/files) + S3 (uploads)
                          ↓
        Stripe + Google Maps + Firebase + Twilio + SendGrid + Sentry

---

PARTIE 4 — MODÈLE DE DONNÉES (Prisma)

model User {
  id                String   @id @default(uuid())
  email             String   @unique
  phone             String?  @unique
  passwordHash      String?
  role              String   // passenger|driver|corporate_admin|corporate_member|admin
  firstName         String?
  lastName          String?
  locale            String   @default("fr")
  jurisdiction      String   @default("FR")
  emailVerified     Boolean  @default(false)
  phoneVerified     Boolean  @default(false)
  stripeCustomerId  String?
  firebaseUid       String?  @unique
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?
}

model DriverProfile {
  id                String   @id
  user              User     @relation(fields: [id], references: [id])
  licenseNumber     String?
  licenseExpiry     DateTime?
  vtcCardNumber     String?
  vtcCardExpiry     DateTime?
  revtcNumber       String?
  pmrTrained        Boolean  @default(false)
  languages         String[] @default(["fr"])
  rating            Decimal  @default(5.00)
  totalTrips        Int      @default(0)
  preferredShuttle  String?
  isOnline          Boolean  @default(false)
  documentsVerified Boolean  @default(false)
  approvedAt        DateTime?
}

model Vehicle {
  id                    String   @id @default(uuid())
  driverId              String?
  shuttleType           String   // rose|bleue|orange|accessibility
  brand                 String?
  model                 String?
  plate                 String   @unique
  color                 String?
  capacity              Int
  pmrEquipped           Boolean  @default(false)
  dashcamActive         Boolean  @default(false)
  insuranceExpiry       DateTime?
  technicalControlExpiry DateTime?
  isAvailable           Boolean  @default(true)
  jurisdiction          String
}

model Trip {
  id                String   @id @default(uuid())
  type              String   // passenger|parcel|mixed
  status            String   @default("pending")
  passengerId       String?
  driverId          String?
  vehicleId         String?
  shuttleType       String
  originAddress     String
  originLat         Float
  originLng         Float
  destinationAddress String
  destinationLat    Float
  destinationLng    Float
  distanceKm        Decimal?
  durationMin       Int?
  scheduledAt       DateTime?
  acceptedAt        DateTime?
  startedAt         DateTime?
  completedAt       DateTime?
  cancelledAt       DateTime?
  cancellationReason String?
  totalPriceCents   Int?
  vatCents          Int      @default(0)
  jurisdiction      String
  createdAt         DateTime @default(now())
}

model PassengerBooking {
  id            String  @id @default(uuid())
  tripId        String  @unique
  trip          Trip    @relation(fields: [tripId], references: [id], onDelete: Cascade)
  seats         Int
  childSeats    Int     @default(0)
  wifiRequested Boolean @default(false)
  extraLuggage  Boolean @default(false)
  petsAllowed   Boolean @default(false)
  qrCode        String  @unique
  checkedIn     Boolean @default(false)
  notes         String?
}

model ParcelBooking {
  id                    String   @id @default(uuid())
  tripId                String   @unique
  trip                  Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  senderId              String?
  recipientName         String?
  recipientPhone        String?
  recipientSignatureUrl String?
  weightKg              Decimal?
  lengthCm              Int?
  widthCm               Int?
  heightCm              Int?
  photoUrl              String?
  proofOfDeliveryUrl    String?
  requiresSignature     Boolean  @default(false)
  isFragile             Boolean  @default(false)
  insured               Boolean  @default(false)
  insuranceValueCents   Int?
  status                String   @default("pending")
  pickedUpAt            DateTime?
  deliveredAt           DateTime?
}

model Payment {
  id                    String   @id @default(uuid())
  tripId                String?
  userId                String?
  stripePaymentIntentId String?
  amountCents           Int
  currency              String   @default("EUR")
  status                String
  method                String?
  refundedCents         Int      @default(0)
  createdAt             DateTime @default(now())
}

model CorporateAccount {
  id                String   @id @default(uuid())
  companyName       String
  vatNumber         String?
  siret             String?
  billingEmail      String?
  billingAddress    String?
  costCenter        String?
  monthlyLimitCents Int?
  jurisdiction      String
  createdAt         DateTime @default(now())
}

model CorporateMember {
  id                String   @id @default(uuid())
  corporateId       String
  userId            String
  role              String   // admin|member
  monthlyLimitCents Int?
  costCenter        String?
  isActive          Boolean  @default(true)
  addedAt           DateTime @default(now())
}

model TrackingPoint {
  id          BigInt   @id @default(autoincrement())
  tripId      String
  driverId    String?
  lat         Float
  lng         Float
  heading     Float?
  speedKmh    Float?
  recordedAt  DateTime @default(now())

  @@index([tripId, recordedAt(sort: Desc)])
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  type      String
  title     String
  body      String
  data      Json?
  readAt    DateTime?
  createdAt DateTime @default(now())
}

model JurisdictionConfig {
  code                              String  @id
  name                              String
  vatPassengerRate                  Decimal @default(0)
  vatParcelRate                     Decimal @default(20)
  requiresRevtc                     Boolean @default(false)
  requiresVtcCard                   Boolean @default(false)
  minTripKm                         Int     @default(0)
  financialGuaranteePerVehicleCents Int?
  currency                          String  @default("EUR")
  leadDpa                           String?
  legalTexts                        Json?
}

model AuditLog {
  id        BigInt   @id @default(autoincrement())
  userId    String?
  action    String
  entity    String?
  entityId  String?
  metadata  Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
}

---

PARTIE 5 — DESIGN SYSTEM

Couleurs

Rôle Hex
Primaire (Rose Navette) #E91E63
Secondaire (Bleu Navette) #2196F3
Tertiaire (Orange Corporate) #FF9800
Neutre PMR #607D8B
Success #4CAF50
Warning #FFC107
Error #F44336
Light : background / surface / text / border #FFFFFF / #F8F9FA / #121212 / #E0E0E0
Dark : background / surface / text / border #121212 / #1E1E1E / #FFFFFF / #3A3A3A

Typographie

· Titres : Poppins (400/600/700)
· Corps : Inter (400/600/700)
· Échelle : Display 34, H1 28, H2 22, H3 18, Body 14, Caption 12, Button 16, Price 20 (chiffres tabulaires)

Espacements

Base 4 : 4, 8, 16, 24, 32, 48, 64

Rayons

Boutons 12, Cartes 16, Inputs 12, Modales 24, Avatars 50 %, Badges pill

Ombres

· Niveau 1 : 0 1 3 rgba(0,0,0,0.08)
· Niveau 2 : 0 4 12 rgba(0,0,0,0.10)
· Niveau 3 : 0 8 24 rgba(0,0,0,0.12)
· Niveau 4 : 0 -4 16 rgba(0,0,0,0.08)

Composants clés

· Bouton primaire : fond Rose, hauteur 52, rayon 12, scale 0.98 au pressé
· Carte navette : rayon 16, bande de couleur 6px à gauche, badge "Disponible"
· Input : hauteur 56, focus bordure 2px Bleu
· Barre ETA : 4px, dégradé Rose → Bleu, animation 300ms ease-out

Accessibilité

· WCAG AA minimum (4.5:1 texte, 3:1 composants)
· Zones tactiles ≥ 44x44px
· Support VoiceOver + TalkBack
· Ne jamais coder l'info par la couleur seule
· Texte agrandi jusqu'à 200%
· Bouton "Accessibilité" toujours visible

Animations

150ms (micro), 300ms (standard), 500ms (transition écran). ease-out entrée, ease-in sortie.

---

PARTIE 6 — API REST (endpoints à créer)

Auth
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
POST   /api/v1/auth/otp/send
POST   /api/v1/auth/otp/verify
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/oauth/google
POST   /api/v1/auth/oauth/apple
DELETE /api/v1/auth/account

Users
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/preferences
PATCH  /api/v1/users/me/preferences
POST   /api/v1/users/me/addresses
GET    /api/v1/users/me/addresses
DELETE /api/v1/users/me/addresses/:id
GET    /api/v1/users/me/export

Drivers
POST   /api/v1/drivers/apply
GET    /api/v1/drivers/me/profile
PATCH  /api/v1/drivers/me/profile
POST   /api/v1/drivers/me/online
POST   /api/v1/drivers/me/location
GET    /api/v1/drivers/me/trips
GET    /api/v1/drivers/me/earnings
POST   /api/v1/drivers/me/documents

Bookings passager
POST   /api/v1/bookings/passenger/quote
POST   /api/v1/bookings/passenger
GET    /api/v1/bookings/passenger/:id
PATCH  /api/v1/bookings/passenger/:id/cancel
POST   /api/v1/bookings/passenger/:id/checkin
GET    /api/v1/bookings/passenger/history

Bookings colis
POST   /api/v1/bookings/parcel/quote
POST   /api/v1/bookings/parcel
GET    /api/v1/bookings/parcel/:id
PATCH  /api/v1/bookings/parcel/:id/cancel
POST   /api/v1/bookings/parcel/:id/pickup
POST   /api/v1/bookings/parcel/:id/deliver
GET    /api/v1/bookings/parcel/history

Trips & matching
POST   /api/v1/trips/match
POST   /api/v1/trips/:id/accept
POST   /api/v1/trips/:id/start
POST   /api/v1/trips/:id/complete
POST   /api/v1/trips/:id/cancel
GET    /api/v1/trips/:id
GET    /api/v1/trips/:id/tracking

Payments
POST   /api/v1/payments/intent
POST   /api/v1/payments/confirm
POST   /api/v1/payments/:id/refund
GET    /api/v1/payments/methods
POST   /api/v1/payments/methods
DELETE /api/v1/payments/methods/:id
POST   /api/v1/webhooks/stripe

Corporate
POST   /api/v1/corporate/accounts
GET    /api/v1/corporate/accounts/me
PATCH  /api/v1/corporate/accounts/me
POST   /api/v1/corporate/members
GET    /api/v1/corporate/members
DELETE /api/v1/corporate/members/:id
GET    /api/v1/corporate/analytics
GET    /api/v1/corporate/invoices
POST   /api/v1/corporate/bookings

Admin
GET    /api/v1/admin/users
GET    /api/v1/admin/drivers/pending
POST   /api/v1/admin/drivers/:id/approve
POST   /api/v1/admin/drivers/:id/reject
GET    /api/v1/admin/trips
GET    /api/v1/admin/analytics
GET    /api/v1/admin/audit-logs

Utils
GET    /api/v1/jurisdictions
GET    /api/v1/jurisdictions/:code
POST   /api/v1/geocode
POST   /api/v1/reverse-geocode
POST   /api/v1/route
GET    /api/v1/health

WebSocket
WS /ws/tracking
  → subscribe:trip { tripId }
  ← position { lat, lng, heading, speed, eta }
  ← status { status }
  ← message { from, text }
  ← sos { alert }

---

PARTIE 7 — SPÉCIFICATIONS ÉCRAN PAR ÉCRAN

App Passager (15 écrans)

1. Splash : logo XLCAB, détection pays, redirection selon auth
2. Onboarding (3 slides) : Navettes 7+, Trajets 60 km+, Colis inclus
3. Login / Signup : email + password, OAuth Google + Apple, OTP SMS, CGU bilingue
4. Home : header avatar, 2 gros boutons "Réserver un trajet" / "Envoyer un colis", 4 ShuttleCards, derniers trajets, bottom nav
5. Sélection navette : 4 cartes pleine largeur, bande couleur 6px, badge disponible, prix "à partir de"
6. Réservation passager : Maps 30 %, champs départ/arrivée, validation 60 km, date+heure, passagers 1-7, options, toggle colis, récap prix, bouton payer
7. Paiement : Stripe Elements natif, Apple Pay, Google Pay, facturation B2B, code promo
8. Confirmation : check animé, QR code, récap complet, boutons calendrier/partager/annuler
9. Suivi temps réel : carte plein écran, marqueur chauffeur animé, bottom sheet draggable, ETA, boutons Appeler/Message/Partager, SOS rouge
10. Profil chauffeur : photo, note, véhicule, badges (dashcam, PMR), langues, signaler
11. Création colis : photo, poids, dimensions, enlèvement + livraison, destinataire, créneau, options, prix
12. Suivi colis : timeline verticale (pending → picked_up → in_transit → delivered), horodatage, notification push
13. Profil passager : photo, historique, moyens paiement, adresses, préférences, suppression compte, politique confidentialité, version app
14. Portail corporate : dashboard KPIs, gestion équipe, réservation pour collaborateur, facturation CSV/PDF
15. Mode chauffeur : toggle en ligne/hors ligne, liste missions, navigation, scan QR, checklist colis, revenus

Détails critiques

Écran 6 (Réservation passager) :
· Autocomplete Google Places
· Validation : si distance < 60 km → erreur
· Minimum 2h dans le futur
· Appel POST /bookings/passenger/quote à chaque modification
· Toggle colis recalcule le prix

Écran 9 (Suivi temps réel) :
· WebSocket avec auth JWT
· Subscription trip:{id}
· Reconnexion auto + fallback polling 10s
· SOS : position + audio 30s → backend → SMS contact urgence

Écran 15 (Mode chauffeur) :
· Toggle déclenche POST /drivers/me/online
· Envoi position 10s (sans course) / 3s (en course)
· Missions via WebSocket driver:{id}
· Accept/Refuse timer 30s (auto-refus après)

---

PARTIE 8 — SÉCURITÉ

Authentification
· JWT access 15 min + refresh 30 j (rotation à chaque usage)
· Blacklist Redis pour révocation
· OTP SMS Twilio (5 min, max 3 tentatives)
· Rate limiting : 5 login/15 min/IP
· 2FA obligatoire pour admin + corporate_admin
· RBAC strict : chaque endpoint vérifie rôle + ownership

Chiffrement
· TLS 1.3 + HSTS
· Bcrypt coût 12
· S3 URLs signées (expiration 15 min)
· Clés API dans AWS Secrets Manager

Protection API
· CORS strict
· Helmet.js
· Validation stricte (class-validator + zod)
· Prisma (protection SQL injection)
· Rate limiting : 100 req/min/user, 1000 req/min/IP

Conformité RGPD
· Consentement explicite à l'inscription
· Droit d'accès : GET /users/me/export
· Droit à l'effacement : DELETE /users/me (anonymisation)
· Lead DPA : DPC Irlande (déclaration) + CNIL (mention FR)
· Durée conservation : 3 ans inactif → anonymisation auto
· DPIA pour tracking temps réel
· Hébergement eu-west-3 (Paris)

Sécurité physique chauffeurs
· Dashcam obligatoire (vérifiée au démarrage)
· Bouton SOS avec audio + position
· Partage de trajet obligatoire pour navette Rose
· Vérification périodique documents (expiration auto)
· Formation PMR obligatoire pour navette Accessibilité

---

PARTIE 9 — MODULES DE CODE À DÉMARRER

Module 1 — Setup Flutter
1. flutter create xlcab_app --org com.xlcab --platforms ios,android
2. Configurer pubspec.yaml avec toutes les dépendances (voir Partie 2.1)
3. Créer lib/theme/ : app_colors.dart, app_typography.dart, app_spacing.dart, app_theme.dart
4. Créer lib/config/jurisdiction_config.dart (FR, IE, ES, IT, DE, PT)
5. Configurer go_router avec toutes les routes
6. Configurer Riverpod providers (auth, user, theme, locale, jurisdiction, booking)
7. Configurer Firebase (fichiers google-services.json + GoogleService-Info.plist)
8. Structure de dossiers complète (voir ci-dessous)

Structure :
lib/
  main.dart
  app.dart
  theme/{app_colors,app_typography,app_spacing,app_theme}.dart
  models/{user,shuttle,trip,parcel,booking}.dart
  services/{api,auth,booking,payment,location,notification}_service.dart
  providers/{auth,booking,theme,locale}_provider.dart
  screens/
    splash/, onboarding/, auth/, home/, booking/, tracking/,
    profile/, corporate/, driver/, accessibility/
  widgets/{primary_button,shuttle_card,input_field,price_display,
           eta_progress,driver_avatar,parcel_card}.dart
  utils/{validators,formatters,constants}.dart
  l10n/{app_fr,app_en,app_ga}.arb
  config/jurisdiction_config.dart

Module 2 — Backend Auth (code fourni)
Voir Partie 10 pour le code complet (auth.service.ts).

Module 3 — Backend Tracking WebSocket
Voir Partie 10 (tracking.gateway.ts).

Module 4 — Backend Matching
Voir Partie 10 (matching.service.ts).

Module 5 — Mobile écran Home passager
Détails dans Partie 7 (écran 4).

Module 6 — Mobile écran Réservation passager
Détails dans Partie 7 (écran 6).

Module 7 — Mobile écran Suivi temps réel
Détails dans Partie 7 (écran 9).

Module 8 — Mobile onboarding chauffeur
Wizard 5 étapes : infos perso → docs véhicule → docs perso (VTC, REVTC) → infos véhicule → envoi validation. Upload avec compression 2MB max. Notification push à l'approbation.

Module 9 — Portail corporate (React)
Dashboard KPIs, gestion équipe, réservation pour collaborateur, export CSV/PDF avec séparation TVA transport personnes (0 %) / marchandises (20 %).

Module 10 — Dashboard admin
Validation chauffeurs, suivi courses temps réel, incidents, analytics, configuration jurisdictions.

---

PARTIE 10 — CODE DE DÉMARRAGE (modules critiques)

Auth Service (src/auth/auth.service.ts)

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
  ) {}

  async signup(email: string, password: string, role: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new UnauthorizedException('Email déjà utilisé');

    const hash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hash, role },
    });

    return this.generateTokens(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    const attempts = await this.redis.incr(`login:${user.id}`);
    if (attempts === 1) await this.redis.expire(`login:${user.id}`, 900);
    if (attempts > 5) throw new UnauthorizedException('Trop de tentatives');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Identifiants invalides');

    await this.redis.del(`login:${user.id}`);
    return this.generateTokens(user);
  }

  async sendOtp(phone: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`otp:${phone}`, code, 'EX', 300);
    // Twilio API call ici
    return { sent: true };
  }

  async verifyOtp(phone: string, code: string) {
    const stored = await this.redis.get(`otp:${phone}`);
    if (stored !== code) throw new UnauthorizedException('Code invalide');
    await this.redis.del(`otp:${phone}`);
    await this.prisma.user.update({
      where: { phone },
      data: { phoneVerified: true },
    });
    return { verified: true };
  }

  private async generateTokens(user: any) {
    const payload = { sub: user.id, role: user.role };
    const access = this.jwt.sign(payload, { expiresIn: '15m' });
    const refresh = this.jwt.sign(payload, { expiresIn: '30d' });
    await this.redis.set(`refresh:${user.id}`, refresh, 'EX', 2592000);
    return { accessToken: access, refreshToken: refresh };
  }
}

Tracking Gateway (src/tracking/tracking.gateway.ts)

import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({ namespace: '/tracking', cors: true })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private jwt: JwtService,
    private redis: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      const payload = this.jwt.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    await this.redis.del(`driver:location:${client.data.userId}`);
  }

  @SubscribeMessage('subscribe:trip')
  async onSubscribe(client: Socket, tripId: string) {
    client.join(`trip:${tripId}`);
    return { subscribed: true };
  }

  @SubscribeMessage('driver:location')
  async onLocation(client: Socket, data: { lat: number; lng: number; heading: number }) {
    if (client.data.role !== 'driver') return;
    await this.redis.geoadd('drivers:online', data.lng, data.lat, client.data.userId);
    const tripId = await this.redis.get(`driver:trip:${client.data.userId}`);
    if (tripId) {
      this.server.to(`trip:${tripId}`).emit('position', {
        driverId: client.data.userId,
        ...data,
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('sos')
  async onSos(client: Socket, data: { tripId: string; lat: number; lng: number }) {
    this.server.to('admin:room').emit('sos:alert', {
      userId: client.data.userId,
      tripId: data.tripId,
      position: { lat: data.lat, lng: data.lng },
      timestamp: Date.now(),
    });
    await this.redis.lpush('sos:queue', JSON.stringify(data));
  }
}

Matching Service (src/matching/matching.service.ts)

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MatchingService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAvailableDrivers(lat: number, lng: number, radiusKm: number, shuttleType: string) {
    const nearby = await this.redis.georadius(
      'drivers:online', lng, lat, radiusKm, 'km',
      'WITHCOORD', 'WITHDIST', 'ASC', 'COUNT', 20,
    );

    const driverIds = (nearby as any[]).map(([id]) => id);
    if (!driverIds.length) return [];

    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        id: { in: driverIds },
        approvedAt: { not: null },
        isOnline: true,
        preferredShuttle: shuttleType,
      },
      include: { user: true },
    });

    return drivers.map(d => ({
      id: d.id,
      name: `${d.user.firstName} ${d.user.lastName}`,
      rating: d.rating,
      shuttleType: d.preferredShuttle,
      languages: d.languages,
      pmrTrained: d.pmrTrained,
    }));
  }

  async estimatePrice(
    distanceKm: number, shuttleType: string, options: any,
    jurisdiction: string, isParcel: boolean,
  ) {
    const config = await this.prisma.jurisdictionConfig.findUnique({ where: { code: jurisdiction } });
    const baseRate = this.getBaseRate(shuttleType);
    let priceCents = Math.round(distanceKm * baseRate);

    if (options.childSeats) priceCents += options.childSeats * 500;
    if (options.wifi) priceCents += 300;
    if (options.extraLuggage) priceCents += 500;
    if (isParcel) priceCents += 800;

    const vatRate = isParcel ? config.vatParcelRate : config.vatPassengerRate;
    const vatCents = Math.round(priceCents * (Number(vatRate) / 100));

    return { priceCents, vatCents, totalCents: priceCents + vatCents };
  }

  private getBaseRate(shuttleType: string): number {
    const rates: Record<string, number> = {
      rose: 120, bleue: 90, orange: 150, accessibility: 100,
    };
    return rates[shuttleType] || 100;
  }
}

---

PARTIE 11 — CADRE JURIDIQUE

11.1 Structure
· XLCAB Ltd. (Dublin, Irlande) : maison mère, propriété intellectuelle, marque, plateforme
· XLCAB France SAS : filiale opérationnelle pour agrément VTC, REVTC, contrats chauffeurs français

11.2 Conformité VTC France
· REVTC obligatoire pour l'exploitant (170 €, renouvelable 5 ans)
· Justificatif de réservation doit mentionner le numéro REVTC (arrêté 6 août 2025, applicable 29 octobre 2025)
· Déclaration des conducteurs au registre (27 juin 2026)
· Garantie financière : 1 500 €/véhicule
· Sanctions : 3 ans + 45 000 € (physique), 225 000 € (morale) pour absence d'inscription

11.3 RGPD
· Lead DPA : DPC Irlande
· CNIL compétente pour plaintes locales en France
· Hébergement : eu-west-3 (Paris)
· Politique de confidentialité bilingue FR/EN obligatoire
· DPIA pour tracking temps réel
· Durée conservation : justificatifs VTC 10 ans (obligation légale)

11.4 Fiscalité
· TVA transport de personnes : exonérée en France (art. 261-4-4° CGI)
· TVA transport de marchandises : 20 % (France)
· Le portail corporate doit gérer deux régimes de TVA

11.5 Marque
· Dépôt EUIPO (marque UE) — couvre les 27 États membres
· Classes : 09 (logiciels/apps), 39 (transport, réservation, livraison)
· Coût : ~850 € (1re classe) + 50 €/classe supp.

---

PARTIE 12 — PUBLICATION STORES

12.1 Comptes
· Apple Developer Program : Organisation, D-U-N-S irlandais, 99 $/an
· Apple entité affiliée France : ajout via App Store Connect + D-U-N-S français
· Google Play Console : Organisation Irlande, 25 $ une fois
· Google Play France : compte séparé si facturation locale

12.2 Conformité stores
· Data Safety form (Google Play) : géolocalisation, données perso, paiement, chiffrement, suppression compte
· Privacy Nutrition Labels (App Store) : data linked to you, data not linked, tracking
· API level Android 35 (obligatoire depuis août 2025)
· Guideline 4.2 Apple : fonctionnalité native (pas de WebView encapsulé)
· Guideline 3.1.3(d) Apple : paiement hors app pour services physiques (Stripe OK)
· Sign in with Apple obligatoire si OAuth

12.3 Assets à préparer
· Icône 1024x1024 (sans transparence)
· Screenshots iPhone 6.7" (1290x2796), 6.5" (1242x2688)
· Vidéo preview 15-30s
· Compte de démo pour review
· Politique de confidentialité sur URL publique
· CGU/CGV in-app

12.4 Checklist finale
☐ Comptes Apple + Google validés
☐ D-U-N-S obtenu (IE + FR)
☐ Marque EUIPO déposée
☐ Politique de confidentialité publiée
☐ CGU/CGV in-app
☐ Data Safety + Privacy Labels
☐ Target API 35
☐ Flux natif (pas WebView)
☐ Bouton suppression compte in-app + URL web
☐ Sign in with Apple
☐ Compte démo créé
☐ TestFlight + Play Beta configurés
☐ REVTC France obtenu
☐ Justificatif de réservation avec n° REVTC

---

PARTIE 13 — TEXTES LÉGAUX

Politique de confidentialité (extraits) — sections obligatoires :
1. Responsable du traitement (XLCAB Ltd. + XLCAB France SAS)
2. Données collectées (identité, coordonnées, géoloc, paiement, historique, docs chauffeurs)
3. Finalités (réservation, tracking, facturation, fraude, analytics, obligations légales)
4. Base légale (contrat, consentement, intérêt légitime, obligation légale)
5. Durée conservation (compte 3 ans, justificatifs VTC 10 ans, géoloc 30 j)
6. Partage (chauffeurs, Stripe, Google Maps, Firebase, autorités)
7. Droits RGPD (accès, rectification, effacement, portabilité, opposition)
8. Contact DPO : dpo@xlcab.com
9. Autorités : DPC (Irlande) + CNIL (France)
10. Sécurité : TLS 1.3, bcrypt, JWT, AWS eu-west-3

CGU/CGV (extraits) — mentions légales obligatoires France (arrêté 6 août 2025) :
· Raison sociale, SIREN/SIRET, n° REVTC
· Nom client, téléphone
· Date, heure, lieu prise en charge
· Destination
· Prix TTC
· Nom chauffeur, n° carte VTC
· Immatriculation véhicule

Règles :
· Distance min 60 km (FR)
· Réservation possible dès 2h avant
· Annulation gratuite jusqu'à 24h avant (50 % entre 24h et 2h, 100 % < 2h)
· Colis : 30 kg max, 100x80x60 cm max
· Objets interdits : dangereux, illégaux, périssables non emballés

---

PARTIE 14 — ROADMAP

Phase / Durée / Livrables
0 — Setup — 1 sem — Comptes, D-U-N-S, marque EUIPO, AWS Activate
1 — Fondations — 2 sem — Design system Flutter, structure, CI/CD, Prisma schema
2 — Backend Auth & Users — 2 sem — Auth, OTP, profils, RBAC, tests
3 — Backend Bookings — 3 sem — Réservation passager + colis, quote, matching
4 — Mobile Passager — 4 sem — Tous écrans passager, intégrations
5 — Mobile Chauffeur — 3 sem — Onboarding, mode en ligne, missions
6 — Tracking temps réel — 2 sem — WebSocket, carte live, SOS
7 — Paiement — 2 sem — Stripe Connect, remboursements, webhooks
8 — Portail Corporate — 3 sem — Dashboard, équipe, facturation
9 — Admin — 2 sem — Validation chauffeurs, analytics, incidents
10 — Tests & Polish — 3 sem — E2E, security, performance, beta
11 — Publication — 2 sem — Soumission Apple + Google
Total ~30 semaines

Avec Claude Code à plein régime : 4-5 mois réalistes.

---

PARTIE 15 — BUDGET OPTIMISÉ

Poste / Coût
Comptes développeurs — ~150 €
D-U-N-S — 0 €
Marque EUIPO — ~850 €
AWS mois 1-12 (Free Tier + Activate) — 0 €
AWS mois 13-24 (Lightsail + Managed DB) — ~27 €/mois = 324 €/an
Stripe — 1.4 % + 0.25 € / transaction
Google Maps API — 200-1 000 €/mois selon volume
Firebase — Gratuit puis ~100 €/mois
Twilio SMS — ~0.05 €/SMS
SendGrid — ~20 €/mois
Sentry — ~30 €/mois
Dev Bangladesh support — 2 000-5 000 €
Total année 1 — ~5 000 - 12 000 €

Stratégie AWS :
1. Postuler AWS Activate Founders (1 000-5 000 $) immédiatement
2. Utiliser Free Tier (EC2 t3.micro + RDS db.t2.micro) les 12 premiers mois
3. Migrer vers Lightsail 12 $ + Managed DB 15 $ après
4. Ne passer à Fargate qu'au-delà de 10 000 utilisateurs actifs
5. Activer Cost Explorer + budget alerts (50 $/mois)

Économie totale 3 ans : ~8 000-15 000 €

---

PARTIE 16 — PROMPTS PAR MODULE (à utiliser en séquence)

Prompt Setup
Crée le projet Flutter xlcab_app selon la spécification maître.
Commence par :
1. flutter create avec org com.xlcab
2. pubspec.yaml complet
3. Tous les fichiers de thème (app_colors, app_typography, app_spacing, app_theme)
4. jurisdiction_config.dart (FR, IE, ES, IT, DE, PT)
5. Configuration go_router + Riverpod
6. Structure de dossiers complète
Montre-moi chaque fichier avant de passer au suivant.

Prompt Auth backend
Crée le module Auth NestJS selon le code fourni en Partie 10.
Inclure : controller, service, DTOs (class-validator), guards JWT,
stratégie Passport, tests unitaires. Intégration Twilio + Redis.

Prompt Home passager
Crée lib/screens/home/home_screen.dart selon Partie 7 écran 4.
Header avatar + cloche, hero card 2 boutons (Réserver / Envoyer colis),
4 ShuttleCards horizontales, derniers trajets, bottom nav.
Riverpod state. Design system strict.

Prompt Réservation passager
Crée lib/screens/booking/passenger_booking_screen.dart selon Partie 7 écran 6.
Maps 30%, champs départ/arrivée avec autocomplete, validation 60 km,
date/heure min +2h, passagers 1-7, options accordéon, toggle colis,
récap prix, bouton payer. Appel POST /bookings/passenger/quote.
États loading/error/success. Commentaires en français.

Prompt Tracking
Crée lib/screens/tracking/tracking_screen.dart selon Partie 7 écran 9.
WebSocket JWT, subscription trip:{id}, carte plein écran,
marqueur animé 3s, bottom sheet draggable, ETA tabulaire,
boutons Appeler/Message/Partager, SOS rouge. Reconnexion auto.
Fallback polling 10s. Notifications push.

Prompt Onboarding chauffeur
Crée lib/screens/driver/driver_onboarding_screen.dart.
Wizard 5 étapes : infos perso → docs véhicule → docs perso (VTC, REVTC)
→ infos véhicule → envoi validation. Upload compression 2MB.
POST /drivers/me/documents. Notification push à l'approbation.

Prompt Portail corporate
Crée le portail React corporate selon Partie 7 écran 14.
Dashboard KPIs (Recharts), gestion équipe (TanStack Table),
réservation collaborateur, export CSV/PDF avec TVA séparée
(transport personnes 0% / marchandises 20%).
Auth JWT. Tailwind + shadcn/ui.

---

PARTIE 17 — PROCHAINES ÉTAPES IMMÉDIATES

1. Aujourd'hui : Sauvegarder ce document dans XLCAB_MASTER_SPEC.md à la racine du projet.
2. Cette semaine :
   · Postuler à AWS Activate Founders (1 000-5 000 $ de crédits)
   · Créer les comptes Apple Developer + Google Play Console (Organisation)
   · Lancer la procédure D-U-N-S (IE + FR)
   · Déposer la marque EUIPO
3. Semaine prochaine : Lancer le prompt Setup dans Claude Code.
4. En parallèle : Recruter 20-50 beta-testeurs (chauffeurs + passagers + corporate).
5. Mois 2 : Contacter le dev Bangladesh pour les tâches DevOps AWS (une fois le MVP backend prêt).

---

FIN DU DOCUMENT MAÎTRE
