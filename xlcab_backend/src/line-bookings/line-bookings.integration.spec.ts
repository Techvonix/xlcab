import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { mfaProof } from '../testing/two-factor-proof';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { LineBookingsModule } from './line-bookings.module';
import { RescueService } from './rescue.service';

// Bourse, étape 2 (intégration, vrai HTTP, base et Redis simulés) :
// 2a — réservation de places sur un départ de ligne, opération du départ ;
// 2b — protocole d'annulation chauffeur (PROTOCOLE_ANNULATION_CHAUFFEUR.md) :
// réserve n° 2 → n° 3 → alerte générale → échec à T−30 min, contrôles
// T−75 / T−60 / T−45 min, pénalité de 260 € dès la 3e annulation.

const JWT_SECRET = 'line-bookings-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DJAMEL = id(1); // titulaire Paris–Beauvais
const KARIM = id(2); // réserve n° 2
const SAMIR = id(3); // réserve n° 3
const CHRIS = id(4); // autre opérateur vérifié (alerte générale)
const PAX1 = id(11);
const PAX2 = id(12);
const VAN = { djamel: id(21), karim: id(22), samir: id(23), chris: id(24) };
const PARIS = { lat: 48.8781, lng: 2.2834 };
const BEAUVAIS = { lat: 49.4544, lng: 2.1128 };
const MIN = 60_000;
const DAY = 24 * 3600_000;

describe('Réservations sur ligne et protocole d’annulation (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let rescue: RescueService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const driver = (sub: string) => as(sub, 'driver');
  const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };
  const http = () => request(app.getHttpServer());
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
  let lineId: string;

  const departure = () => db.lineDeparture.rows.find((d: any) => d.lineId === lineId && d.localDate === tomorrow);
  const tripsOf = (depId: string) => db.trip.rows.filter((t: any) => t.lineDepartureId === depId);
  const notified = (userId: string, type: string) => db.notification.rows.some((n: any) => n.userId === userId && n.type === type);

  /** Place le départ (et ses réservations) à [minutes] de maintenant. */
  function moveDeparture(minutes: number) {
    const at = new Date(Date.now() + minutes * MIN);
    departure().departureAt = at;
    for (const t of tripsOf(departure().id)) t.scheduledAt = at;
  }

  const book = (pax: string, seats: number) =>
    http().post('/api/v1/lines/bookings').set('Authorization', as(pax, 'passenger')).send({ departureId: departure().id, seats });

  async function invite(email: string, rank: number, who: string, vehicleId: string) {
    const res = await http().post(`/api/v1/operators/me/lines/${lineId}/backups`).set('Authorization', driver(DJAMEL)).send({ email, rank });
    expect(res.status).toBe(200);
    const backup = db.lineBackup.rows.find((b: any) => b.rank === rank);
    const accepted = await http().post(`/api/v1/operators/me/backups/${backup.id}/accept`).set('Authorization', driver(who)).send({ vehicleId });
    expect(accepted.body.status).toBe('accepted');
  }

  const cancelBy = (who: string) =>
    http().post(`/api/v1/operators/me/departures/${departure().id}/cancel`).set('Authorization', driver(who)).send({ reason: 'Malade cette nuit' });
  const offerFor = (who: string) => db.rescueOffer.rows.find((o: any) => o.driverId === who && o.status === 'pending');

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    const approved = new Date('2026-09-01');
    const people = [
      [DJAMEL, 'djamel@test.fr', 'Djamel'], [KARIM, 'karim@test.fr', 'Karim'], [SAMIR, 'samir@test.fr', 'Samir'], [CHRIS, 'chris@test.fr', 'Chris'],
    ];
    for (const [uid, email, firstName] of people) {
      db.user.rows.push({ id: uid, email, role: 'driver', firstName, phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.9, ratingCount: 10, totalTrips: 10, languages: ['fr'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: 'verified', perSeatAllowed: true, transportLicense: 'LOTI-1',
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
    }
    const vans: [string, string, number][] = [[VAN.djamel, DJAMEL, 8], [VAN.karim, KARIM, 8], [VAN.samir, SAMIR, 8], [VAN.chris, CHRIS, 13]];
    vans.forEach(([vid, owner, capacity], i) =>
      db.vehicle.rows.push({ id: vid, driverId: owner, brand: 'Renault', model: 'Trafic', plate: `AA-00${i}-AA`, capacity, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR' }),
    );
    db.user.rows.push(
      { id: PAX1, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', phone: '+33622222222', deletedAt: null },
      { id: PAX2, email: 'tom@test.fr', role: 'passenger', firstName: 'Tom', deletedAt: null },
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', deletedAt: null },
    );

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'k', TWO_FACTOR_ENC_KEY: randomBytes(32).toString('base64') })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        OperatorsModule,
        LineBookingsModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    rescue = moduleRef.get(RescueService);

    // Ligne de Djamel : Paris → Beauvais 5 h, 8 places à 25 €, départs confirmés.
    const created = await http().post('/api/v1/operators/me/lines').set('Authorization', driver(DJAMEL)).send({
      vehicleId: VAN.djamel,
      originAddress: 'Porte Maillot, Paris', originLat: PARIS.lat, originLng: PARIS.lng,
      destinationAddress: 'Aéroport de Beauvais', destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
      departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 8, luggage: 16,
      pricingMode: 'per_seat', priceCents: 2500, durationMin: 75,
    });
    expect(created.status).toBe(201);
    lineId = created.body.id;
    await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', driver(DJAMEL)).send({ lineId, until: tomorrow });
  });

  afterEach(async () => {
    delete process.env.NODE_ENV_OVERRIDE;
    await app.close();
  });

  // ── 2a : réservation ────────────────────────────────────────────────

  describe('2a — réserver une place sur un départ', () => {
    it('course XLCAB ordinaire, déjà acceptée par le chauffeur du départ, prix et commission figés', async () => {
      moveDeparture(5 * 60);
      const res = await book(PAX1, 3);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'accepted', seats: 3, totalPriceCents: 7500, paymentMode: 'deferred' });
      const trip = db.trip.rows.find((t: any) => t.id === res.body.tripId);
      expect(trip).toMatchObject({
        source: 'line', lineDepartureId: departure().id, passengerId: PAX1, driverId: DJAMEL, vehicleId: VAN.djamel,
        status: 'accepted', totalPriceCents: 7500, commissionCents: 750, originAddress: 'Porte Maillot, Paris',
      });
      expect(db.passengerBooking.rows.find((b: any) => b.tripId === trip.id)).toMatchObject({ seats: 3, qrCode: expect.any(String) });
      expect(departure().seatsBooked).toBe(3);
      expect(notified(PAX1, 'line.booked') && notified(DJAMEL, 'line.new_booking')).toBe(true);

      expect((await book(PAX1, 1)).status).toBe(409); // déjà une réservation sur ce départ
      expect((await book(PAX2, 6)).status).toBe(409); // plus que 5 places
      expect(departure().seatsBooked).toBe(3);
    });

    it('annulation par le passager : places rendues à la vente', async () => {
      moveDeparture(5 * 60);
      const { body } = await book(PAX1, 3);
      const res = await http().post(`/api/v1/trips/${body.tripId}/cancel`).set('Authorization', as(PAX1, 'passenger')).send({ reason: 'Vol annulé' });
      expect(res.status).toBe(200);
      expect(departure().seatsBooked).toBe(0);
    });

    it('le chauffeur ne se désiste pas d’une réservation isolée : il annule le départ (protocole)', async () => {
      moveDeparture(5 * 60);
      const { body } = await book(PAX1, 2);
      const res = await http().post(`/api/v1/trips/${body.tripId}/cancel`).set('Authorization', driver(DJAMEL)).send({ reason: 'Indisponible' });
      expect(res.status).toBe(409);
    });

    it('opérer le départ : liste d’embarquement, scan des QR, démarrage et fin en bloc', async () => {
      moveDeparture(5 * 60);
      const a = await book(PAX1, 3);
      await book(PAX2, 2);
      const far = await http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', driver(DJAMEL));
      expect(far.body).toMatchObject({ seatsBooked: 5, ready: false });
      expect(far.body.passengers.map((p: any) => [p.firstName, p.seats, p.phone])).toEqual([['Léa', 3, null], ['Tom', 2, null]]);
      expect((await http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', driver(KARIM))).status).toBe(404);

      moveDeparture(40);
      const near = await http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', driver(DJAMEL));
      expect(near.body.passengers[0].phone).toBe('+33622222222'); // T−60 min : téléphone visible

      const qr = db.passengerBooking.rows.find((b: any) => b.tripId === a.body.tripId).qrCode;
      const scanned = await http().post(`/api/v1/operators/me/departures/${departure().id}/checkin`).set('Authorization', driver(DJAMEL)).send({ qrCode: qr });
      expect(scanned.body).toMatchObject({ firstName: 'Léa', seats: 3, checkedIn: true });
      expect((await http().post(`/api/v1/operators/me/departures/${departure().id}/checkin`).set('Authorization', driver(DJAMEL)).send({ qrCode: 'faux' })).status).toBe(400);

      const started = await http().post(`/api/v1/operators/me/departures/${departure().id}/start`).set('Authorization', driver(DJAMEL));
      expect(started.body).toEqual({ departureId: departure().id, started: 2 });
      const done = await http().post(`/api/v1/operators/me/departures/${departure().id}/complete`).set('Authorization', driver(DJAMEL));
      expect(done.body).toEqual({ departureId: departure().id, completed: 2 });
      expect(tripsOf(departure().id).every((t: any) => t.status === 'completed')).toBe(true);
    });

    it('départs assurés : ceux de mes lignes, puis ceux repris en secours', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      const mine = await http().get('/api/v1/operators/me/assignments').set('Authorization', driver(DJAMEL));
      expect(mine.body).toEqual([expect.objectContaining({ departureId: departure().id, passengers: 3, bookings: 1, ready: false, rescued: false })]);
      expect((await http().get('/api/v1/operators/me/assignments').set('Authorization', driver(KARIM))).body).toEqual([]);

      await cancelBy(DJAMEL);
      expect((await http().get('/api/v1/operators/me/assignments').set('Authorization', driver(DJAMEL))).body).toEqual([]);
      await http().post(`/api/v1/operators/me/rescues/${offerFor(KARIM).id}/accept`).set('Authorization', driver(KARIM)).send({});
      const taken = await http().get('/api/v1/operators/me/assignments').set('Authorization', driver(KARIM));
      expect(taken.body).toEqual([expect.objectContaining({ departureId: departure().id, rescued: true, ready: true })]);
      expect((await http().get('/api/v1/operators/me/assignments').set('Authorization', driver(DJAMEL))).body).toEqual([]);
    });

    it('pas de vente réelle en production tant que Stripe Connect n’est pas branché', async () => {
      moveDeparture(5 * 60);
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        expect((await book(PAX1, 1)).status).toBe(503);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  });

  // ── 2b : protocole d'annulation ─────────────────────────────────────

  describe('2b — cascade de secours', () => {
    it('le n° 1 annule, le n° 2 refuse, le n° 3 reprend : passagers prévenus du seul changement de chauffeur', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      await invite('samir@test.fr', 3, SAMIR, VAN.samir);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await book(PAX2, 4);

      const res = await cancelBy(DJAMEL);
      expect(res.body).toMatchObject({ rescue: true, counted: true, penaltyId: null });
      expect(departure()).toMatchObject({ rescueStatus: 'searching', rescueStage: 'backup2' });
      expect(tripsOf(departure().id).every((t: any) => t.driverId === null && t.status === 'accepted')).toBe(true);
      expect(db.incident.rows[0]).toMatchObject({ type: 'departure_at_risk', userId: DJAMEL, status: 'open' });
      expect(notified(DJAMEL, 'line.cancel.warning')).toBe(true); // 1re annulation : avertissement
      expect(notified(PAX1, 'line.driver_changed')).toBe(false); // pas d'alarme tant que la recherche dure

      const offers = await http().get('/api/v1/operators/me/rescues').set('Authorization', driver(KARIM));
      expect(offers.body).toHaveLength(1);
      expect(offers.body[0]).toMatchObject({ stage: 'backup2', passengers: 7, totalPriceCents: 17500 });
      // Une offre ne s'accepte que par son destinataire.
      expect((await http().post(`/api/v1/operators/me/rescues/${offerFor(KARIM).id}/accept`).set('Authorization', driver(SAMIR)).send({})).status).toBe(404);

      await http().post(`/api/v1/operators/me/rescues/${offerFor(KARIM).id}/decline`).set('Authorization', driver(KARIM));
      expect(departure().rescueStage).toBe('backup3');
      const taken = await http().post(`/api/v1/operators/me/rescues/${offerFor(SAMIR).id}/accept`).set('Authorization', driver(SAMIR)).send({});
      expect(taken.body).toMatchObject({ rescued: true, passengers: 7 });

      expect(departure()).toMatchObject({ rescueStatus: 'rescued', driverId: SAMIR, vehicleId: VAN.samir, driverReadyAt: expect.any(Date) });
      expect(tripsOf(departure().id).every((t: any) => t.driverId === SAMIR && t.vehicleId === VAN.samir)).toBe(true);
      expect(notified(PAX1, 'line.driver_changed') && notified(PAX2, 'line.driver_changed')).toBe(true);
      expect(db.notification.rows.find((n: any) => n.userId === PAX1 && n.type === 'line.driver_changed').body).toContain('Samir');
      expect(db.incident.rows[0].status).toBe('resolved');
      expect((await http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', driver(SAMIR))).status).toBe(200);
      expect((await http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', driver(DJAMEL))).status).toBe(404);
    });

    it('sans réponse du n° 2 dans le délai (15 min, départ dans plus de 3 h) : le n° 3 est sollicité', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      await invite('samir@test.fr', 3, SAMIR, VAN.samir);
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      await cancelBy(DJAMEL);
      const offer = offerFor(KARIM);
      expect(offer.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * MIN);

      await rescue.tick(new Date(Date.now() + 16 * MIN));
      expect(offer.status).toBe('expired');
      expect(departure().rescueStage).toBe('backup3');
      expect(offerFor(SAMIR)).toBeDefined();
    });

    it('départ proche : 5 min pour répondre', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      moveDeparture(100);
      await cancelBy(DJAMEL);
      const delay = offerFor(KARIM).expiresAt.getTime() - Date.now();
      expect(delay).toBeGreaterThan(4 * MIN);
      expect(delay).toBeLessThanOrEqual(5 * MIN);
    });

    it('sans réserve : alerte générale aux opérateurs compatibles ; le premier qui accepte gagne', async () => {
      db.operatorProfile.rows.find((o: any) => o.id === SAMIR).perSeatAllowed = false; // pas de vente à la place
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await cancelBy(DJAMEL);
      expect(departure().rescueStage).toBe('open');
      const offered = db.rescueOffer.rows.map((o: any) => o.driverId).sort();
      expect(offered).toEqual([KARIM, CHRIS].sort());

      const first = await http().post(`/api/v1/operators/me/rescues/${offerFor(CHRIS).id}/accept`).set('Authorization', driver(CHRIS)).send({});
      expect(first.status).toBe(200);
      const second = await http().post(`/api/v1/operators/me/rescues/${offerFor(KARIM)?.id ?? id(999)}/accept`).set('Authorization', driver(KARIM)).send({});
      expect([404, 409]).toContain(second.status);
      expect(departure().driverId).toBe(CHRIS);
      expect(db.rescueOffer.rows.find((o: any) => o.driverId === KARIM).status).toBe('cancelled');
    });

    it('un secours déjà pris sur le créneau, ou au véhicule trop petit, n’est pas sollicité', async () => {
      db.vehicle.rows.find((v: any) => v.id === VAN.karim).capacity = 2;
      db.trip.rows.push({
        id: id(500), type: 'passenger', status: 'accepted', driverId: CHRIS, passengerId: PAX2, shuttleType: 'bleue', jurisdiction: 'FR',
        originAddress: 'x', originLat: 0, originLng: 0, destinationAddress: 'y', destinationLat: 0, destinationLng: 0,
        scheduledAt: new Date(Date.now() + 5 * 3600_000), durationMin: 90, createdAt: new Date(),
      });
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await cancelBy(DJAMEL);
      expect(db.rescueOffer.rows.map((o: any) => o.driverId)).toEqual([SAMIR]);
    });

    it('personne à T−30 min : réservations annulées sans frais, remboursées, avoir de 20 %', async () => {
      for (const o of db.operatorProfile.rows) if (o.id !== DJAMEL) o.status = 'suspended';
      moveDeparture(5 * 60);
      const { body } = await book(PAX1, 3);
      await cancelBy(DJAMEL);
      expect(db.rescueOffer.rows).toHaveLength(0); // l'équipe XLCAB a l'incident

      moveDeparture(29);
      const report = await rescue.tick();
      expect(report.failed).toBe(1);
      expect(departure()).toMatchObject({ rescueStatus: 'failed', status: 'closed' });
      expect(db.trip.rows.find((t: any) => t.id === body.tripId)).toMatchObject({ status: 'cancelled', cancellationFeeCents: 0 });
      expect(db.passengerCredit.rows).toEqual([expect.objectContaining({ userId: PAX1, amountCents: 1500, reason: 'rescue_failed' })]);
      expect(notified(PAX1, 'line.cancelled_no_driver')).toBe(true);
    });

    it('l’équipe XLCAB affecte elle-même un chauffeur (2FA exigée)', async () => {
      for (const o of db.operatorProfile.rows) if (o.id !== DJAMEL && o.id !== CHRIS) o.status = 'suspended';
      db.operatorProfile.rows.find((o: any) => o.id === CHRIS).status = 'suspended';
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await cancelBy(DJAMEL);
      const atRisk = await http().get('/api/v1/admin/departures/at-risk').set(admin);
      expect(atRisk.body[0]).toMatchObject({ departureId: departure().id, rescueStatus: 'searching', passengers: 3 });
      expect((await http().get('/api/v1/admin/departures/at-risk').set('Authorization', as('ops', 'admin'))).status).toBe(403);

      db.operatorProfile.rows.find((o: any) => o.id === CHRIS).status = 'verified';
      // Chauffeurs proposés à l'équipe : vérifiés, véhicule assez grand, jamais le défaillant.
      const candidates = await http().get(`/api/v1/admin/departures/${departure().id}/candidates`).set(admin);
      expect(candidates.body).toEqual([expect.objectContaining({ driverId: CHRIS, name: 'Chris', vehicleId: VAN.chris, capacity: 13, phone: '+33611111111' })]);
      expect(atRisk.body[0].failedDriverName).toBe('Djamel');
      const res = await http().post(`/api/v1/admin/departures/${departure().id}/assign`).set(admin).send({ driverId: CHRIS, vehicleId: VAN.chris });
      expect(res.body).toMatchObject({ rescued: true });
      expect(departure().driverId).toBe(CHRIS);
    });
  });

  describe('2b — contrôles avant le départ', () => {
    it('rappel à T−75 min, puis secours à T−60 min sans « Je suis en route »', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      moveDeparture(70);
      expect((await rescue.tick()).reminders).toBe(1);
      expect(notified(DJAMEL, 'line.ready.reminder')).toBe(true);
      expect((await rescue.tick()).reminders).toBe(0); // un seul rappel

      moveDeparture(58);
      expect((await rescue.tick()).failures).toBe(1);
      expect(departure()).toMatchObject({ rescueStatus: 'searching', rescueStage: 'backup2' });
      expect(db.driverCancellation.rows[0]).toMatchObject({ driverId: DJAMEL, trigger: 'not_ready', status: 'counted' });
    });

    it('« Je suis en route » puis plus de position GPS à T−45 min : secours au 2e contrôle sans position', async () => {
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      moveDeparture(90);
      expect((await http().post(`/api/v1/operators/me/departures/${departure().id}/ready`).set('Authorization', driver(DJAMEL))).status).toBe(200);

      moveDeparture(55);
      expect((await rescue.tick()).failures).toBe(0);
      moveDeparture(44);
      redis.store.set(`driver:seen:${DJAMEL}`, '1'); // position reçue
      expect((await rescue.tick()).failures).toBe(0);
      redis.store.delete(`driver:seen:${DJAMEL}`);
      expect((await rescue.tick()).failures).toBe(0); // une coupure ne suffit pas
      expect((await rescue.tick()).failures).toBe(1);
      expect(db.driverCancellation.rows[0].trigger).toBe('no_position');
    });
  });

  describe('2b — pénalités', () => {
    const seedPastCancellations = (n: number) => {
      for (let i = 0; i < n; i++) {
        db.driverCancellation.rows.push({
          id: id(700 + i), driverId: DJAMEL, departureId: id(800 + i), trigger: 'driver_cancel', minutesBefore: 30, lastMinute: true,
          status: 'counted', createdAt: new Date(Date.now() - (30 + i) * DAY),
        });
      }
    };

    it('annulation prévenue à temps (plus de 12 h et pas le jour même) : secours lancé, mais rien ne compte', async () => {
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      moveDeparture(2 * 24 * 60);
      const res = await cancelBy(DJAMEL);
      expect(res.body).toMatchObject({ rescue: true, counted: false });
      expect(db.driverCancellation.rows[0]).toMatchObject({ status: 'not_counted', lastMinute: false });
      expect(offerFor(KARIM)).toBeDefined();
    });

    it('3e annulation en 12 mois : 260 € après 7 jours ; 160 € au secours, 100 € d’avoirs aux passagers', async () => {
      seedPastCancellations(2);
      await invite('karim@test.fr', 2, KARIM, VAN.karim);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await book(PAX2, 2);
      const res = await cancelBy(DJAMEL);
      expect(res.body.penaltyId).toEqual(expect.any(String));
      const penalty = db.driverPenalty.rows[0];
      expect(penalty).toMatchObject({ driverId: DJAMEL, amountCents: 26000, status: 'pending' });
      await http().post(`/api/v1/operators/me/rescues/${offerFor(KARIM).id}/accept`).set('Authorization', driver(KARIM)).send({});

      expect((await rescue.tick(new Date(Date.now() + 6 * DAY))).penaltiesApplied).toBe(0);
      expect((await rescue.tick(new Date(Date.now() + 8 * DAY))).penaltiesApplied).toBe(1);
      expect(penalty.status).toBe('applied');
      expect(db.driverBonus.rows).toEqual([expect.objectContaining({ driverId: KARIM, amountCents: 16000 })]);
      expect(db.passengerCredit.rows.map((c: any) => [c.userId, c.amountCents])).toEqual([[PAX1, 5000], [PAX2, 5000]]);
      expect(notified(DJAMEL, 'line.penalty.applied')).toBe(true);
    });

    it('les annulations de plus de 12 mois ne comptent plus', async () => {
      seedPastCancellations(2);
      for (const c of db.driverCancellation.rows) c.createdAt = new Date(Date.now() - 400 * DAY);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      expect((await cancelBy(DJAMEL)).body.penaltyId).toBeNull();
    });

    it('sans conditions générales opérateur acceptées : jamais de pénalité', async () => {
      seedPastCancellations(2);
      db.operatorProfile.rows.find((o: any) => o.id === DJAMEL).termsAcceptedAt = null;
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      expect((await cancelBy(DJAMEL)).body.penaltyId).toBeNull();
      expect(db.auditLog.rows.some((r: any) => r.action === 'line.penalty.not_applicable')).toBe(true);
    });

    it('contestation dans les 7 jours : rien n’est débité ; l’équipe tranche (2FA)', async () => {
      seedPastCancellations(2);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      await cancelBy(DJAMEL);
      const penalty = db.driverPenalty.rows[0];
      const contested = await http().post(`/api/v1/operators/me/penalties/${penalty.id}/contest`).set('Authorization', driver(DJAMEL)).send({ reason: 'Panne constatée par le garage' });
      expect(contested.body.status).toBe('contested');
      expect((await rescue.tick(new Date(Date.now() + 8 * DAY))).penaltiesApplied).toBe(0);

      const decided = await http().patch(`/api/v1/admin/penalties/${penalty.id}`).set(admin).send({ decision: 'cancel', reason: 'Facture du garage reçue' });
      expect(decided.body.status).toBe('cancelled');
      expect(db.driverBonus.rows).toHaveLength(0);
    });

    it('force majeure justifiée : l’annulation ne compte plus, la pénalité tombe', async () => {
      seedPastCancellations(2);
      moveDeparture(5 * 60);
      await book(PAX1, 3);
      const { body } = await cancelBy(DJAMEL);
      const justified = await http().post(`/api/v1/operators/me/cancellations/${body.cancellationId}/justify`).set('Authorization', driver(DJAMEL))
        .send({ justification: 'Hospitalisation, certificat transmis au support' });
      expect(justified.body.status).toBe('justification_pending');
      expect(db.driverPenalty.rows[0].status).toBe('contested');

      const review = await http().patch(`/api/v1/admin/cancellations/${body.cancellationId}`).set(admin).send({ status: 'justified', reason: 'Certificat médical' });
      expect(review.body.status).toBe('justified');
      expect(db.driverPenalty.rows[0].status).toBe('cancelled');
      const mine = await http().get('/api/v1/operators/me/cancellations').set('Authorization', driver(DJAMEL));
      expect(mine.body[0]).toMatchObject({ status: 'justified', penalty: { status: 'cancelled', amountCents: 26000 } });
    });
  });

  describe('réserves et droits', () => {
    it('invitation : chauffeur XLCAB validé, pas le titulaire, véhicule assez grand', async () => {
      const post = (email: string, rank: number) =>
        http().post(`/api/v1/operators/me/lines/${lineId}/backups`).set('Authorization', driver(DJAMEL)).send({ email, rank });
      expect((await post('inconnu@test.fr', 2)).status).toBe(404);
      expect((await post('djamel@test.fr', 2)).status).toBe(400);
      expect((await post('karim@test.fr', 4)).status).toBe(400);
      expect((await post('karim@test.fr', 2)).status).toBe(200);
      expect((await post('karim@test.fr', 3)).status).toBe(400); // déjà n° 2
      expect(notified(KARIM, 'line.backup.invite')).toBe(true);

      const backup = db.lineBackup.rows[0];
      db.vehicle.rows.find((v: any) => v.id === VAN.karim).capacity = 4;
      const small = await http().post(`/api/v1/operators/me/backups/${backup.id}/accept`).set('Authorization', driver(KARIM)).send({ vehicleId: VAN.karim });
      expect(small.status).toBe(400);
      const notHis = await http().post(`/api/v1/operators/me/backups/${backup.id}/accept`).set('Authorization', driver(SAMIR)).send({ vehicleId: VAN.samir });
      expect(notHis.status).toBe(404);
      expect((await http().get(`/api/v1/operators/me/lines/${lineId}/backups`).set('Authorization', driver(KARIM))).status).toBe(404);
    });

    it('un autre chauffeur n’annule pas le départ de Djamel ; un passager n’a pas d’espace chauffeur', async () => {
      moveDeparture(5 * 60);
      await book(PAX1, 2);
      expect((await cancelBy(KARIM)).status).toBe(404);
      expect((await http().get('/api/v1/operators/me/rescues').set('Authorization', as(PAX1, 'passenger'))).status).toBe(403);
      expect((await http().post('/api/v1/lines/bookings').set('Authorization', driver(KARIM)).send({ departureId: departure().id, seats: 1 })).status).toBe(403);
    });

    it('départ sans réservation annulé : simplement fermé, aucun protocole ni sanction', async () => {
      const res = await cancelBy(DJAMEL);
      expect(res.body).toEqual({ departureId: departure().id, rescue: false });
      expect(departure().status).toBe('closed');
      expect(db.driverCancellation.rows).toHaveLength(0);
    });
  });
});
