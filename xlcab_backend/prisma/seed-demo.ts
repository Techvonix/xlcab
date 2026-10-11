import { PrismaClient } from '@prisma/client';
import { recomputeDriverRating } from '../src/feedback/driver-rating';
import { addDays, localDateOf } from '../src/common/local-time';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../src/operators/line-schedule';
import { LinesService } from '../src/operators/lines.service';
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
    await prisma.driverCancellation.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.driverBonus.deleteMany({ where: { driverId: { in: oldIds } } });
    await prisma.passengerCredit.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.lineBackup.deleteMany({ where: { OR: [{ lineId: { in: oldLines } }, { driverId: { in: oldIds } }] } });
    await prisma.lineDeparture.deleteMany({ where: { lineId: { in: oldLines } } });
    await prisma.lineException.deleteMany({ where: { lineId: { in: oldLines } } });
    await prisma.recurringLine.deleteMany({ where: { id: { in: oldLines } } });
    await prisma.operatorProfile.deleteMany({ where: { id: { in: oldIds } } });
    await prisma.tripRating.deleteMany({ where: { OR: [{ passengerId: { in: oldIds } }, { driverId: { in: oldIds } }] } });
    await prisma.savedAddress.deleteMany({ where: { userId: { in: oldIds } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: oldIds } } });
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
  await trip({
    passengerId: member.id, corporateId: corp.id, costCenter: 'VENTES', bookedById: corpAdmin.id, shuttleType: 'orange',
    status: 'pending', scheduledAt: inHours(72), totalPriceCents: 18000, priceLines: { create: [{ regime: 'passenger', baseCents: 18000, ratePercent: 0, vatCents: 0 }] },
    destinationAddress: ORLEANS.address, destinationLat: ORLEANS.lat, destinationLng: ORLEANS.lng, distanceKm: 132, durationMin: 95,
  }, 1);

  // ── Bourse de transport : opérateurs, lignes régulières, réserves, demande ──
  const djamel = await user('Opérateur Djamel (ligne Paris–Beauvais 5 h, à la place)', 'djamel.operateur', 'driver', 'Djamel', 'Haddad', '+33600000007');
  const chris = await user('Opérateur Chris (ligne Paris–Orléans 19 h, van 14 places)', 'chris.operateur', 'driver', 'Chris', 'Moreau', '+33600000008');
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
  // Nadia aussi est opératrice vérifiée : elle voit la bourse et peut être réserve.
  await prisma.operatorProfile.create({
    data: {
      id: nadia.id, kind: 'independent', status: 'verified', verifiedAt: new Date(), cities: ['Paris', 'Rouen'], services: ['intercity'],
      termsAcceptedAt: new Date(), termsVersion: DEFAULT_OPERATOR_TERMS_VERSION,
    },
  });

  // Lignes créées par le vrai service : départs générés sur 30 jours, puis confirmés sur 7 jours.
  const lines = new LinesService(prisma as never, { log: async () => undefined } as never);
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
  for (const id of [djamel.id, chris.id]) await lines.confirm(id, { until: addDays(tomorrow, 6) });

  // Réserves de la ligne de Djamel : Chris (n° 2, confirmé), Nadia (n° 3, invitation à accepter dans son app).
  await prisma.lineBackup.createMany({
    data: [
      { lineId: beauvaisLine.id, driverId: chris.id, vehicleId: vanChris.id, rank: 2, status: 'accepted', respondedAt: new Date() },
      { lineId: beauvaisLine.id, driverId: nadia.id, rank: 3, status: 'invited' },
    ],
  });

  // Léa a réservé 3 places sur le départ de demain.
  const first = await prisma.lineDeparture.findFirst({ where: { lineId: beauvaisLine.id, localDate: tomorrow, direction: 'outbound' } });
  if (first) {
    const held = await lines.reserveSeats(first.id, 3);
    await prisma.trip.create({
      data: {
        type: 'passenger', status: 'accepted', source: 'line', lineDepartureId: first.id, passengerId: lea.id, driverId: djamel.id, vehicleId: vanDjamel.id,
        acceptedAt: new Date(), shuttleType: 'bleue', jurisdiction: 'FR', durationMin: 75, scheduledAt: first.departureAt,
        originAddress: MAILLOT.address, originLat: MAILLOT.lat, originLng: MAILLOT.lng,
        destinationAddress: BEAUVAIS.address, destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
        totalPriceCents: held.priceCents, vatCents: 0, commissionCents: Math.round(held.priceCents / 10),
        priceLines: { create: [{ regime: 'passenger', baseCents: held.priceCents, ratePercent: 0, vatCents: 0 }] },
        passengerBooking: { create: { seats: 3, childSeats: 1, qrCode: randomUUID(), notes: 'Vol de 8 h 10' } },
      },
    });
  }

  // Adresses favorites de Léa : proposées en tête de la recherche d'adresse, elles
  // permettent de parcourir l'app sans clé Google Places (démo, vidéo).
  await prisma.savedAddress.createMany({
    data: [
      { userId: lea.id, label: 'Porte Maillot', address: MAILLOT.address, lat: MAILLOT.lat, lng: MAILLOT.lng },
      { userId: lea.id, label: 'Aéroport de Beauvais', address: BEAUVAIS.address, lat: BEAUVAIS.lat, lng: BEAUVAIS.lng },
      { userId: lea.id, label: 'Gare de Rouen', address: ROUEN.address, lat: ROUEN.lat, lng: ROUEN.lng },
    ],
  });

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
