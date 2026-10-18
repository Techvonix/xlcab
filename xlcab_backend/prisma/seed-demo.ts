import { PrismaClient } from '@prisma/client';
import { recomputeDriverRating } from '../src/feedback/driver-rating';
import { addDays, localDateOf } from '../src/common/local-time';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../src/operators/line-schedule';
import { LinesService } from '../src/operators/lines.service';
import { dashcamCharterVersion } from '../src/dashcam/dashcam';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Données de DÉMONSTRATION (base locale uniquement) :
//   npx ts-node prisma/seed-demo.ts
//
// Crée un compte par rôle et quelques courses pour parcourir l'app, le
// portail entreprise et le dashboard admin. Les mots de passe sont tirés
// au hasard à chaque exécution et écrits dans demo-accounts.local.txt
// (ignoré par Git) — jamais dans le code ni dans la console.
// Réexécutable : les comptes de démo existants sont remplacés.

const prisma = new PrismaClient();
const DEMO_DOMAIN = 'xlcab.test'; // domaine réservé (RFC 2606) : aucun e-mail réel
const HOUR = 3600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const nextYear = new Date(Date.now() + 365 * 24 * HOUR);

const PARIS = { address: 'Gare de Lyon, 75012 Paris', lat: 48.8443, lng: 2.3744 };
const ROUEN = { address: 'Gare de Rouen-Rive-Droite, Rouen', lat: 49.4488, lng: 1.0942 };
const ORLEANS = { address: 'Gare d’Orléans, Orléans', lat: 47.9077, lng: 1.9046 };
const LYON = { address: 'Gare de Lyon-Part-Dieu, Lyon', lat: 45.7606, lng: 4.8594 };
const LIMOGES = { address: 'Gare de Limoges-Bénédictins, Limoges', lat: 45.8364, lng: 1.2681 };
const MAILLOT = { address: 'Porte Maillot, 75017 Paris', lat: 48.8781, lng: 2.2834 };
const BEAUVAIS = { address: 'Aéroport de Beauvais-Tillé', lat: 49.4544, lng: 2.1128 };

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error('seed-demo refusé : base non locale ou NODE_ENV=production');
  }
}

async function main() {
  assertLocalDatabase();

  // Nettoyage des données de démo précédentes (courses liées, puis comptes).
  const old = await prisma.user.findMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } }, select: { id: true } });
  const oldIds = old.map((u) => u.id);
  if (oldIds.length) {
    // Bourse de transport : lignes, départs, réserves, protocole, demandes.
    const oldLines = (await prisma.recurringLine.findMany({ where: { operatorId: { in: oldIds } }, select: { id: true } })).map((l) => l.id);
    const oldDepartures = (await prisma.lineDeparture.findMany({ where: { lineId: { in: oldLines } }, select: { id: true } })).map((d) => d.id);
    const oldRequests = (await prisma.transportRequest.findMany({ where: { requesterId: { in: oldIds } }, select: { id: true } })).map((r) => r.id);
    const oldOffers = (
      await prisma.transportOffer.findMany({ where: { OR: [{ requestId: { in: oldRequests } }, { operatorId: { in: oldIds } }] }, select: { id: true } })
    ).map((o) => o.id);
    await prisma.offerMessage.deleteMany({ where: { offerId: { in: oldOffers } } });
    await prisma.transportOffer.deleteMany({ where: { id: { in: oldOffers } } });
    await prisma.transportRequest.deleteMany({ where: { id: { in: oldRequests } } });
    await prisma.rescueOffer.deleteMany({ where: { OR: [{ departureId: { in: oldDepartures } }, { driverId: { in: oldIds } }] } });
    await prisma.driverPenalty.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.dashcamCharterAcceptance.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.driverCancellation.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.driverBonus.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.passengerCredit.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.lineBackup.deleteMany({ where: { OR: [{ lineId: { in: oldLines } }, { driverId: { in: oldIds } }] } });
    await prisma.lineSeat.deleteMany({ where: { departureId: { in: oldDepartures } } });
    await prisma.lineDeparture.deleteMany({ where: { lineId: { in: oldLines } } });
    await prisma.lineException.deleteMany({ where: { lineId: { in: oldLines } } });
    await prisma.lineStop.deleteMany({ where: { lineId: { in: oldLines } } });
    await prisma.recurringLine.deleteMany({ where: { id: { in: oldLines } } });
    await prisma.operatorProfile.deleteMany({ where: { id: { in: oldIds } } });
    await prisma.tripRating.deleteMany({ where: { OR: [{ passengerId: { in: oldIds } }, { driverId: { in: oldIds } }] } });
    await prisma.savedAddress.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.trustedContact.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.tripShare.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.trip.deleteMany({ where: { OR: [{ passengerId: { in: oldIds } }, { driverId: { in: oldIds } }] } });
    await prisma.corporateMember.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.vehicle.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.driverDocument.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.driverProfile.deleteMany({ where: { id: { in: oldIds } } });
    await prisma.twoFactorAuth.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.corporateAccount.deleteMany({ where: { companyName: 'Démo Logistique SAS' } });

  const accounts: { label: string; email: string; password: string }[] = [];
  async function user(label: string, local: string, role: string, firstName: string, lastName: string, phone: string) {
    const password = randomBytes(9).toString('base64url');
    const email = `${local}@${DEMO_DOMAIN}`;
    const created = await prisma.user.create({
      data: {
        email, role, firstName, lastName, phone, jurisdiction: 'FR', emailVerified: true,
        passwordHash: await bcrypt.hash(password, 12),
        termsAcceptedAt: new Date(), termsVersion: process.env.TERMS_VERSION ?? '2026-10-01',
      },
    });
    accounts.push({ label, email, password });
    return created;
  }

  const lea = await user('Passagère', 'lea.passagere', 'passenger', 'Léa', 'Martin', '+33600000001');
  const nadia = await user('Chauffeure (validée, véhicule Bleue)', 'nadia.chauffeure', 'driver', 'Nadia', 'Benali', '+33600000002');
  const karim = await user('Chauffeur (candidature en attente)', 'karim.candidat', 'passenger', 'Karim', 'Diallo', '+33600000003');
  const admin = await user('Équipe XLCAB (admin, 2FA à activer à la 1re connexion)', 'admin', 'admin', 'Camille', 'Admin', '+33600000004');
  const corpAdmin = await user('Admin entreprise (portail corporate)', 'sophie.entreprise', 'corporate_admin', 'Sophie', 'Lefèvre', '+33600000005');
  const member = await user('Collaborateur entreprise', 'thomas.collaborateur', 'corporate_member', 'Thomas', 'Roux', '+33600000006');

  // Chauffeure validée : documents à jour, véhicule Bleue avec dashcam.
  await prisma.driverProfile.create({
    data: {
      id: nadia.id, licenseNumber: 'DEMO-PERMIS-01', licenseExpiry: nextYear, vtcCardNumber: 'DEMO-VTC-01', vtcCardExpiry: nextYear,
      revtcNumber: 'DEMO-REVTC-01', languages: ['fr', 'en'], totalTrips: 128, preferredShuttle: 'bleue',
      documentsVerified: true, approvedAt: new Date(),
    },
  });
  const van = await prisma.vehicle.create({
    data: {
      driverId: nadia.id, shuttleType: 'bleue', brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'DEMO-001',
      capacity: 8, dashcamActive: true, insuranceExpiry: nextYear, technicalControlExpiry: nextYear, isAvailable: true, jurisdiction: 'FR',
    },
  });

  // Candidature en attente : visible dans le dashboard admin (à valider).
  await prisma.driverProfile.create({
    data: { id: karim.id, licenseNumber: 'DEMO-PERMIS-02', licenseExpiry: nextYear, vtcCardNumber: 'DEMO-VTC-02', vtcCardExpiry: nextYear, preferredShuttle: 'orange' },
  });
  await prisma.vehicle.create({
    data: {
      driverId: karim.id, shuttleType: 'orange', brand: 'Mercedes', model: 'Vito', color: 'Noir', plate: 'DEMO-002',
      capacity: 7, dashcamActive: true, insuranceExpiry: nextYear, technicalControlExpiry: nextYear, isAvailable: false, jurisdiction: 'FR',
    },
  });

  // Entreprise cliente avec son admin et un collaborateur.
  const corp = await prisma.corporateAccount.create({
    data: { companyName: 'Démo Logistique SAS', siret: '00000000000000', billingEmail: `factures@${DEMO_DOMAIN}`, costCenter: 'DIR', monthlyLimitCents: 300_000, jurisdiction: 'FR' },
  });
  await prisma.corporateMember.createMany({
    data: [
      { corporateId: corp.id, userId: corpAdmin.id, role: 'admin' },
      { corporateId: corp.id, userId: member.id, role: 'member', costCenter: 'VENTES' },
    ],
  });

  // Courses : une course acceptée demain (supports des colis à l'aller et
  // au retour), un historique, une course d'entreprise.
  const trip = (data: Record<string, unknown>, seats = 2) =>
    prisma.trip.create({
      data: {
        type: 'passenger', shuttleType: 'bleue', jurisdiction: 'FR', distanceKm: 135.4, durationMin: 97,
        totalPriceCents: 12186, vatCents: 0,
        originAddress: PARIS.address, originLat: PARIS.lat, originLng: PARIS.lng,
        destinationAddress: ROUEN.address, destinationLat: ROUEN.lat, destinationLng: ROUEN.lng,
        priceLines: { create: [{ regime: 'passenger', baseCents: 12186, ratePercent: 0, vatCents: 0 }] },
        passengerBooking: { create: { seats, qrCode: randomUUID() } },
        ...data,
      },
    });

  await trip({ passengerId: lea.id, status: 'accepted', driverId: nadia.id, vehicleId: van.id, scheduledAt: inHours(26), acceptedAt: new Date() });
  // Historique : 3 courses terminées, notées par la passagère (5, 5, 4) — la
  // note de la chauffeure est ainsi cohérente partout (4,67 / 5, 3 avis).
  const stars = [5, 5, 4];
  for (let i = 1; i <= 3; i++) {
    const at = inHours(-24 * 7 * i);
    const done = await trip({ passengerId: lea.id, status: 'completed', driverId: nadia.id, vehicleId: van.id, scheduledAt: at, startedAt: at, completedAt: new Date(at.getTime() + 97 * 60_000) });
    await prisma.tripRating.create({
      data: { tripId: done.id, passengerId: lea.id, driverId: nadia.id, stars: stars[i - 1], comment: i === 3 ? 'Un peu de retard au départ, sinon très bien.' : null, createdAt: new Date(at.getTime() + 2 * HOUR) },
    });
  }
  await recomputeDriverRating(prisma as never, nadia.id);
  // Une course terminée hier, pas encore notée : notation, étiquettes et « Réserver le retour ».
  const yesterday = inHours(-20);
  await trip({ passengerId: lea.id, status: 'completed', driverId: nadia.id, vehicleId: van.id, scheduledAt: yesterday, startedAt: yesterday, completedAt: new Date(yesterday.getTime() + 97 * 60_000) });
  await trip({
    passengerId: member.id, corporateId: corp.id, costCenter: 'VENTES', bookedById: corpAdmin.id, shuttleType: 'orange',
    status: 'pending', scheduledAt: inHours(72), totalPriceCents: 18000, priceLines: { create: [{ regime: 'passenger', baseCents: 18000, ratePercent: 0, vatCents: 0 }] },
    destinationAddress: ORLEANS.address, destinationLat: ORLEANS.lat, destinationLng: ORLEANS.lng, distanceKm: 132, durationMin: 95,
  }, 1);

  // ── Bourse de transport : opérateurs, lignes régulières, réserves, demande ──
  const djamel = await user('Opérateur Djamel (ligne Paris–Beauvais 5 h, à la place)', 'djamel.operateur', 'driver', 'Djamel', 'Haddad', '+33600000007');
  const chris = await user('Opérateur Chris (ligne Paris–Orléans 19 h, van 14 places)', 'chris.operateur', 'driver', 'Chris', 'Moreau', '+33600000008');
  // Créé après Chris : les numéros des comptes précédents (scripts de tournage) ne changent pas.
  const sami = await user('Opérateur Sami (Lyon → Limoges 8 h, seuil de départ : 4 passagers)', 'sami.operateur', 'driver', 'Sami', 'Benamar', '+33600000009');
  const operator = async (u: { id: string }, n: number, kind: string, legalName: string, brand: string, model: string, capacity: number) => {
    await prisma.driverProfile.create({
      data: {
        id: u.id, licenseNumber: `DEMO-PERMIS-1${n}`, licenseExpiry: nextYear, vtcCardNumber: `DEMO-VTC-1${n}`, vtcCardExpiry: nextYear,
        languages: ['fr', 'en'], totalTrips: 40 * n, preferredShuttle: 'bleue', documentsVerified: true, approvedAt: new Date(),
      },
    });
    await prisma.operatorProfile.create({
      data: {
        id: u.id, kind, legalName, transportLicense: `LOTI-DEMO-${n}`, status: 'verified', perSeatAllowed: true, verifiedAt: new Date(),
        cities: ['Paris'], services: ['airport', 'intercity', 'group'], termsAcceptedAt: new Date(), termsVersion: DEFAULT_OPERATOR_TERMS_VERSION,
      },
    });
    return prisma.vehicle.create({
      data: {
        driverId: u.id, shuttleType: 'bleue', brand, model, color: 'Blanc', plate: `DEMO-01${n}`, capacity, dashcamActive: true,
        insuranceExpiry: nextYear, technicalControlExpiry: nextYear, isAvailable: true, jurisdiction: 'FR',
      },
    });
  };
  // « Van de 9 places » = 8 passagers ; « van de 14 places » = 13 passagers (conducteur non compris).
  const vanDjamel = await operator(djamel, 1, 'independent', 'Djamel Navettes', 'Renault', 'Trafic', 8);
  const vanChris = await operator(chris, 2, 'collective', 'Chris Transports', 'Mercedes', 'Sprinter', 13);
  const vanSami = await operator(sami, 3, 'independent', 'Sami Navettes', 'Peugeot', 'Expert Traveller', 8);
  // Nadia aussi est opératrice vérifiée : elle voit la bourse et peut être réserve.
  await prisma.operatorProfile.create({
    data: {
      id: nadia.id, kind: 'independent', status: 'verified', verifiedAt: new Date(), cities: ['Paris', 'Rouen'], services: ['intercity'],
      termsAcceptedAt: new Date(), termsVersion: DEFAULT_OPERATOR_TERMS_VERSION,
    },
  });

  // Lignes créées par le vrai service : départs générés sur 30 jours, puis confirmés sur 7 jours.
  // Démo en paiement différé : aucun compte de versement exigé.
  const lines = new LinesService(prisma as never, { log: async () => undefined } as never, { assertReady: async () => undefined } as never);
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
  const everyDay = [1, 2, 3, 4, 5, 6, 7];
  const beauvaisLine = await lines.create(djamel.id, {
    vehicleId: vanDjamel.id, originAddress: MAILLOT.address, originLat: MAILLOT.lat, originLng: MAILLOT.lng,
    destinationAddress: BEAUVAIS.address, destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
    departureTime: '05:00', daysOfWeek: everyDay, startDate: tomorrow, seats: 8, luggage: 12, pricingMode: 'per_seat', priceCents: 2500,
    durationMin: 75, conditions: '1 valise et 1 bagage cabine par personne',
  });
  await lines.create(chris.id, {
    vehicleId: vanChris.id, originAddress: MAILLOT.address, originLat: MAILLOT.lat, originLng: MAILLOT.lng,
    destinationAddress: ORLEANS.address, destinationLat: ORLEANS.lat, destinationLng: ORLEANS.lng,
    departureTime: '19:00', returnTime: '22:30', daysOfWeek: everyDay, startDate: tomorrow, seats: 13, luggage: 20,
    pricingMode: 'per_vehicle', priceCents: 39000, durationMin: 110,
  });
  // Catalogue de points de rencontre (tenu par l'équipe XLCAB) : créé s'il n'existe pas.
  // Lieux exacts d'attente à choisir et vérifier sur place par l'équipe (règles d'arrêt locales).
  const point = async (city: string, name: string, address: string, lat: number, lng: number, transit: string) =>
    (await prisma.meetingPoint.findFirst({ where: { city, name } })) ??
    prisma.meetingPoint.create({ data: { city, name, address, lat, lng, transit } });
  await point('Paris', 'Porte Maillot', 'Place de la Porte Maillot, 75017 Paris', 48.8781, 2.2834, 'Métro 1, RER C (Neuilly – Porte Maillot)');
  await point('Paris', 'Porte de Saint-Cloud', 'Place de la Porte de Saint-Cloud, 75016 Paris', 48.8378, 2.2567, 'Métro 9');
  await point('Paris', 'Porte d’Orléans', 'Place du 25 Août 1944, 75014 Paris', 48.8235, 2.3253, 'Métro 4, tram T3a');
  const clermontPoint = await point('Clermont-Ferrand', 'Gare de Clermont-Ferrand', 'Avenue de l’Union Soviétique, 63000 Clermont-Ferrand', 45.7786, 3.1003, 'Tram A, bus');

  // Seuil de départ garanti (CLARIFICATION_MODELE.md) : Sami part d'office dès 4 passagers sur 7.
  const limogesLine = await lines.create(sami.id, {
    vehicleId: vanSami.id, originAddress: LYON.address, originLat: LYON.lat, originLng: LYON.lng,
    destinationAddress: LIMOGES.address, destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
    departureTime: '08:00', daysOfWeek: everyDay, startDate: tomorrow, seats: 7, luggage: 7, pricingMode: 'per_seat', priceCents: 3000,
    durationMin: 270, minPassengers: 4, conditions: '1 valise et 1 bagage cabine par personne',
    // Arrêt à Clermont-Ferrand : Lyon → Clermont 18 €, Clermont → Limoges 12 €.
    stops: [{ meetingPointId: clermontPoint.id, offsetMin: 150, fareFromOriginCents: 1800 }],
    // Colis (CLARIFICATION_MODELE.md, D9) : 3 par départ, 15 € l'un, remis au point de rendez-vous.
    parcelSlots: 3, parcelPriceCents: 1500,
  });
  for (const id of [djamel.id, chris.id, sami.id]) await lines.confirm(id, { until: addDays(tomorrow, 6) });

  // Réserves de la ligne de Djamel : Chris (n° 2, confirmé), Nadia (n° 3, invitation à accepter dans son app).
  await prisma.lineBackup.createMany({
    data: [
      { lineId: beauvaisLine.id, driverId: chris.id, vehicleId: vanChris.id, rank: 2, status: 'accepted', respondedAt: new Date() },
      { lineId: beauvaisLine.id, driverId: nadia.id, rank: 3, status: 'invited' },
    ],
  });

  // Thomas a réservé 3 places (sièges 1 à 3) sur le départ de demain : Léa peut y choisir les siennes.
  const first = await prisma.lineDeparture.findFirst({ where: { lineId: beauvaisLine.id, localDate: tomorrow, direction: 'outbound' } });
  if (first) {
    const held = await lines.reserveSeats(first.id, 3);
    const leaLineTrip = await prisma.trip.create({
      data: {
        type: 'passenger', status: 'accepted', source: 'line', lineDepartureId: first.id, passengerId: member.id, driverId: djamel.id, vehicleId: vanDjamel.id,
        acceptedAt: new Date(), shuttleType: 'bleue', jurisdiction: 'FR', durationMin: 75, scheduledAt: first.departureAt,
        originAddress: MAILLOT.address, originLat: MAILLOT.lat, originLng: MAILLOT.lng,
        destinationAddress: BEAUVAIS.address, destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
        totalPriceCents: held.priceCents, vatCents: 0, commissionCents: Math.round(held.priceCents / 10),
        priceLines: { create: [{ regime: 'passenger', baseCents: held.priceCents, ratePercent: 0, vatCents: 0 }] },
        passengerBooking: { create: { seats: 3, childSeats: 1, qrCode: randomUUID(), notes: 'Vol de 8 h 10' } },
      },
    });
    // Ses sièges numérotés : ils apparaissent « pris » dans le choix du siège.
    await prisma.lineSeat.createMany({ data: [1, 2, 3].map((seatNumber) => ({ departureId: first.id, seatNumber, tripId: leaLineTrip.id })) });
  }

  // Sami : 3 places déjà vendues (Karim) sur le départ d'après-demain — l'échéance du seuil (24 h
  // avant) est encore loin. Il manque 1 passager : la réservation de Léa déclenche le « top départ ».
  const limogesDeparture = await prisma.lineDeparture.findFirst({ where: { lineId: limogesLine.id, localDate: addDays(tomorrow, 1), direction: 'outbound' } });
  if (limogesDeparture) {
    const held = await lines.reserveSeats(limogesDeparture.id, 3);
    const karimTrip = await prisma.trip.create({
      data: {
        type: 'passenger', status: 'accepted', source: 'line', lineDepartureId: limogesDeparture.id, passengerId: karim.id, driverId: sami.id, vehicleId: vanSami.id,
        acceptedAt: new Date(), shuttleType: 'bleue', jurisdiction: 'FR', durationMin: 270, scheduledAt: limogesDeparture.departureAt,
        originAddress: LYON.address, originLat: LYON.lat, originLng: LYON.lng,
        destinationAddress: LIMOGES.address, destinationLat: LIMOGES.lat, destinationLng: LIMOGES.lng,
        totalPriceCents: held.priceCents, vatCents: 0, commissionCents: Math.round(held.priceCents / 10),
        priceLines: { create: [{ regime: 'passenger', baseCents: held.priceCents, ratePercent: 0, vatCents: 0 }] },
        passengerBooking: { create: { seats: 3, childSeats: 0, qrCode: randomUUID() } },
      },
    });
    await prisma.lineSeat.createMany({ data: [1, 2, 3].map((seatNumber) => ({ departureId: limogesDeparture.id, seatNumber, tripId: karimTrip.id })) });
  }

  // Adresses favorites de Léa : proposées en tête de la recherche d'adresse, elles
  // permettent de parcourir l'app sans clé Google Places (démo, vidéo).
  await prisma.savedAddress.createMany({
    data: [
      { userId: lea.id, label: 'Porte Maillot', address: MAILLOT.address, lat: MAILLOT.lat, lng: MAILLOT.lng },
      { userId: lea.id, label: 'Aéroport de Beauvais', address: BEAUVAIS.address, lat: BEAUVAIS.lat, lng: BEAUVAIS.lng },
      { userId: lea.id, label: 'Gare de Rouen', address: ROUEN.address, lat: ROUEN.lat, lng: ROUEN.lng },
      { userId: lea.id, label: 'Gare de Lyon-Part-Dieu', address: LYON.address, lat: LYON.lat, lng: LYON.lng },
      { userId: lea.id, label: 'Gare de Limoges', address: LIMOGES.address, lat: LIMOGES.lat, lng: LIMOGES.lng },
      { userId: lea.id, label: 'Gare de Clermont-Ferrand', address: 'Gare de Clermont-Ferrand, Clermont-Ferrand', lat: 45.7786, lng: 3.1003 },
    ],
  });

  // Charte caméra embarquée acceptée par les chauffeurs de démo (sinon ni en ligne ni démarrage).
  await prisma.dashcamCharterAcceptance.createMany({
    data: [nadia.id, djamel.id, chris.id, sami.id].map((userId) => ({ userId, version: dashcamCharterVersion() })),
  });

  // Favoris de Sami : sans clé Google Places, il compose son départ ponctuel (vidéo) à partir d'eux.
  await prisma.savedAddress.createMany({
    data: [
      { userId: sami.id, label: 'Gare de Lyon-Part-Dieu', address: LYON.address, lat: LYON.lat, lng: LYON.lng },
      { userId: sami.id, label: 'Gare de Limoges', address: LIMOGES.address, lat: LIMOGES.lat, lng: LIMOGES.lng },
    ],
  });

  // Espace sécurité de Léa : un contact de confiance (numéro fictif) et le partage proposé à chaque trajet.
  await prisma.trustedContact.create({ data: { userId: lea.id, name: 'Maman', phone: '0600000099' } });
  await prisma.userPreference.create({ data: { userId: lea.id, autoShareTrips: true } });

  // Bourse : demande publiée par Léa (6 passagers dans 3 jours), une proposition de Djamel.
  const departureAt = inHours(72);
  const request = await prisma.transportRequest.create({
    data: {
      requesterId: lea.id, originAddress: '12 rue de Courcelles, 75017 Paris', originLat: 48.8793, originLng: 2.3052,
      destinationAddress: ROUEN.address, destinationLat: ROUEN.lat, destinationLng: ROUEN.lng,
      departureAt, flexMin: 30, passengers: 6, luggage: 6, needs: 'Un siège bébé', status: 'offers_received', publishedAt: new Date(),
      expiresAt: new Date(departureAt.getTime() - HOUR),
    },
  });
  await prisma.transportOffer.create({
    data: {
      requestId: request.id, operatorId: djamel.id, vehicleId: vanDjamel.id, priceCents: 18000, pickupAt: departureAt,
      conditions: 'Attente de 15 minutes incluse', validUntil: inHours(24),
    },
  });

  // Protocole d'annulation (démo) : Chris a annulé trois départs à la dernière minute en deux
  // mois. La 3e lui vaut une pénalité de 260 €, appliquée il y a 31 jours, dont 45 € seulement
  // ont été retenus sur ses reversements : le planificateur de l'API émet la facture du solde
  // (215 €) dans la minute qui suit — par le vrai circuit, avec son numéro et son PDF.
  // Djamel avait repris ce départ : son bonus de 160 € attend le recouvrement de la pénalité.
  const DAY = 24 * HOUR;
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
  const rescuedDeparture = randomUUID();
  let lastCancellation = '';
  for (const [i, age] of [60, 50, 40].entries()) {
    const cancellation = await prisma.driverCancellation.create({
      data: {
        driverId: chris.id, departureId: i === 2 ? rescuedDeparture : randomUUID(), trigger: 'driver_cancel', reason: 'Indisponible',
        minutesBefore: 120, lastMinute: true, status: 'counted', createdAt: daysAgo(age),
      },
    });
    lastCancellation = cancellation.id;
  }
  const penalty = await prisma.driverPenalty.create({
    data: {
      driverId: chris.id, cancellationId: lastCancellation, amountCents: 26_000, status: 'applied', contestUntil: daysAgo(33),
      decidedAt: daysAgo(31), decidedBy: 'system', collectedCents: 4_500, createdAt: daysAgo(40),
    },
  });
  await prisma.driverBonus.create({
    data: { driverId: djamel.id, departureId: rescuedDeparture, penaltyId: penalty.id, amountCents: 16_000, createdAt: daysAgo(31) },
  });

  const file = join(__dirname, '..', 'demo-accounts.local.txt');
  writeFileSync(
    file,
    [
      'XLCAB — comptes de DÉMONSTRATION (base locale). Ne pas réutiliser ces mots de passe ailleurs.',
      `Généré le ${new Date().toLocaleString('fr-FR')}`,
      '',
      ...accounts.map((a) => `${a.label}\n  e-mail : ${a.email}\n  mot de passe : ${a.password}\n`),
    ].join('\n'),
    'utf8',
  );
  console.log(`Démo prête : ${accounts.length} comptes. Identifiants dans ${file}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
