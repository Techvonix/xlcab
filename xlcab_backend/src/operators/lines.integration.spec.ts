import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { mfaProof } from '../testing/two-factor-proof';
import { DEFAULT_OPERATOR_TERMS_VERSION } from './line-schedule';
import { LinesService } from './lines.service';
import { OperatorsModule } from './operators.module';

// Bourse de transport, étape 1, de bout en bout (vrai HTTP, base simulée) :
// cas de test du cahier des charges — Djamel (Paris–Beauvais 5 h, van 9
// places, vente à la place) et Chris (Paris–Orléans 19 h, van 14 places,
// privatisation) —, scénarios A (la ligne apparaît), F (plus de places,
// pause, suspension) et H (cloisonnement entre comptes).

const JWT_SECRET = 'lines-secret';
const DJAMEL = 'd1a00000-0000-4000-8000-000000000001';
const CHRIS = 'c4100000-0000-4000-8000-000000000002';
const PAX = 'aa000000-0000-4000-8000-000000000003';
const VAN_DJAMEL = 'e0000000-0000-4000-8000-000000000011';
const VAN_CHRIS = 'e0000000-0000-4000-8000-000000000012';

const PARIS = { lat: 48.8781, lng: 2.2834, address: 'Porte Maillot, 75017 Paris' };
const BEAUVAIS = { lat: 49.4544, lng: 2.1128, address: 'Aéroport de Beauvais-Tillé' };
const TERMS = { acceptTerms: true, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION };
const ORLEANS = { lat: 47.9018, lng: 1.9041, address: 'Gare d’Orléans' };

describe('Lignes régulières (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let lines: LinesService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const djamel = as(DJAMEL, 'driver');
  const chris = as(CHRIS, 'driver');
  const pax = as(PAX, 'passenger');
  const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };
  const http = () => request(app.getHttpServer());

  // Demain, heure de Paris : toujours plus d'une heure avant un départ à 5 h.
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);

  const beauvaisLine = (over: Record<string, unknown> = {}) => ({
    vehicleId: VAN_DJAMEL,
    originAddress: PARIS.address, originLat: PARIS.lat, originLng: PARIS.lng,
    destinationAddress: BEAUVAIS.address, destinationLat: BEAUVAIS.lat, destinationLng: BEAUVAIS.lng,
    departureTime: '05:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startDate: tomorrow,
    seats: 8,
    luggage: 10,
    pricingMode: 'per_seat',
    priceCents: 2500,
    durationMin: 75,
    conditions: '1 bagage cabine + 1 valise par personne',
    ...over,
  });

  const search = (q: Record<string, unknown>) =>
    http().get('/api/v1/lines/search').set('Authorization', pax).query({
      fromLat: 48.8790, fromLng: 2.2850, toLat: BEAUVAIS.lat, toLng: BEAUVAIS.lng, date: tomorrow, seats: 2, ...q,
    });

  async function verify(id: string, body: Record<string, unknown>) {
    const res = await http().patch(`/api/v1/admin/operators/${id}`).set(admin).send({ reason: 'Documents contrôlés', ...body });
    expect(res.status).toBe(200);
  }

  /** Djamel : profil, licence vérifiée, ligne publiée et départs confirmés sur 7 jours. */
  async function publishDjamel() {
    await http().put('/api/v1/operators/me').set('Authorization', djamel).send({
      kind: 'independent', legalName: 'Djamel Navettes', transportLicense: 'LOTI-2026-0042', cities: ['Paris', 'Beauvais'], services: ['airport'], ...TERMS,
    });
    await verify(DJAMEL, { status: 'verified', perSeatAllowed: true });
    const created = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine());
    expect(created.status).toBe(201);
    const confirmed = await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', djamel)
      .send({ lineId: created.body.id, until: addDays(tomorrow, 6) });
    expect(confirmed.body).toEqual({ confirmed: 7 });
    return created.body.id as string;
  }

  const departureOf = (lineId: string, date = tomorrow, direction = 'outbound') =>
    db.lineDeparture.rows.find((d: any) => d.lineId === lineId && d.localDate === date && d.direction === direction);

  beforeEach(async () => {
    db = memoryPrisma();
    const approved = new Date('2026-09-01');
    db.user.rows.push(
      { id: DJAMEL, email: 'djamel@test.fr', role: 'driver', firstName: 'Djamel', phone: '+33600000001', deletedAt: null },
      { id: CHRIS, email: 'chris@test.fr', role: 'driver', firstName: 'Chris', phone: '+33600000002', deletedAt: null },
      { id: PAX, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', deletedAt: null },
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', deletedAt: null },
    );
    db.driverProfile.rows.push(
      { id: DJAMEL, approvedAt: approved, rating: 4.8, ratingCount: 52, languages: ['fr', 'ar'] },
      { id: CHRIS, approvedAt: approved, rating: 5, ratingCount: 0, languages: ['fr', 'en'] },
    );
    db.vehicle.rows.push(
      // capacity = places passagers, conducteur non compris (van de 9 places → 8).
      { id: VAN_DJAMEL, driverId: DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-111-AA', capacity: 8, jurisdiction: 'FR' },
      { id: VAN_CHRIS, driverId: CHRIS, brand: 'Mercedes', model: 'Sprinter', plate: 'BB-222-BB', capacity: 13, jurisdiction: 'FR' },
    );

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: new FakeRedis() },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', TWO_FACTOR_ENC_KEY: randomBytes(32).toString('base64') })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        OperatorsModule,
        AdminModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    lines = moduleRef.get(LinesService);
  });

  afterEach(() => app.close());

  describe('scénario A — Djamel, Paris–Beauvais 5 h, à la place', () => {
    it('vente à la place refusée tant que la licence n’est pas vérifiée par XLCAB', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', transportLicense: 'LOTI-2026-0042', ...TERMS });
      const res = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PER_SEAT_NOT_ALLOWED');
    });

    it('jamais plus de places que la capacité homologuée du véhicule (conducteur non compris)', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', transportLicense: 'LOTI-2026-0042', ...TERMS });
      await verify(DJAMEL, { perSeatAllowed: true });
      const res = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine({ seats: 9 }));
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('8 places passagers');
    });

    it('départs générés à confirmer : invisibles dans la recherche avant la confirmation de l’opérateur', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', transportLicense: 'LOTI-2026-0042', ...TERMS });
      await verify(DJAMEL, { status: 'verified', perSeatAllowed: true });
      const created = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine());
      const pending = await http().get('/api/v1/operators/me/departures').set('Authorization', djamel).query({ status: 'to_confirm' });
      expect(pending.body.length).toBeGreaterThanOrEqual(29); // 30 jours glissants
      expect((await search({})).body).toEqual([]);

      await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', djamel).send({ lineId: created.body.id, until: tomorrow });
      expect((await search({})).body).toHaveLength(1);
      expect((await search({ date: addDays(tomorrow, 1) })).body).toEqual([]); // pas encore confirmé
    });

    it('la ligne apparaît dans une recherche compatible, avec le prix et les raisons du classement — sans donnée privée', async () => {
      await publishDjamel();
      const res = await search({ time: '05:15' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const [hit] = res.body;
      expect(hit).toMatchObject({
        direction: 'outbound',
        localTime: '05:00',
        origin: PARIS.address,
        destination: BEAUVAIS.address,
        pricingMode: 'per_seat',
        unitPriceCents: 2500,
        totalPriceCents: 5000,
        seatsLeft: 8,
        operator: { name: 'Djamel Navettes', rating: 4.8, ratingCount: 52 },
        vehicle: { brand: 'Renault', model: 'Trafic', capacity: 8 },
      });
      expect(hit.reasons).toEqual([
        { code: 'pickup', km: expect.any(Number) },
        { code: 'dropoff', km: 0 },
        { code: 'time', diffMin: -15 },
        { code: 'seats_left', count: 8 },
        { code: 'verified_operator' },
      ]);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('AA-111-AA'); // plaque
      expect(raw).not.toContain('+336'); // téléphone
      expect(raw).not.toContain('@test.fr'); // e-mail
    });

    it('rien hors du trajet, du sens, de l’horaire ou des bagages demandés', async () => {
      await publishDjamel();
      expect((await search({ toLat: ORLEANS.lat, toLng: ORLEANS.lng })).body).toEqual([]);
      // Pas de retour déclaré : Beauvais → Paris introuvable.
      expect((await search({ fromLat: BEAUVAIS.lat, fromLng: BEAUVAIS.lng, toLat: PARIS.lat, toLng: PARIS.lng })).body).toEqual([]);
      expect((await search({ time: '09:00', flexMin: 60 })).body).toEqual([]);
      expect((await search({ luggage: 11 })).body).toEqual([]);
      expect((await search({ seats: 9 })).body).toEqual([]);
    });
  });

  describe('scénario A bis — Chris, Paris–Orléans 19 h, véhicule privatisé avec retour', () => {
    async function publishChris() {
      await http().put('/api/v1/operators/me').set('Authorization', chris).send({ kind: 'collective', legalName: 'Chris Transports', ...TERMS });
      const created = await http().post('/api/v1/operators/me/lines').set('Authorization', chris).send({
        vehicleId: VAN_CHRIS,
        originAddress: PARIS.address, originLat: PARIS.lat, originLng: PARIS.lng,
        destinationAddress: ORLEANS.address, destinationLat: ORLEANS.lat, destinationLng: ORLEANS.lng,
        departureTime: '19:00', returnTime: '22:30', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow,
        seats: 13, luggage: 20, pricingMode: 'per_vehicle', priceCents: 39000, durationMin: 110,
      });
      expect(created.status).toBe(201);
      await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', chris).send({ until: tomorrow });
      return created.body.id as string;
    }

    it('opérateur non vérifié : ligne publiée mais jamais proposée', async () => {
      await publishChris();
      expect((await search({ toLat: ORLEANS.lat, toLng: ORLEANS.lng, seats: 10 })).body).toEqual([]);
    });

    it('vérifié : aller et retour proposés, prix du véhicule quel que soit le groupe, 13 places au plus', async () => {
      await publishChris();
      await verify(CHRIS, { status: 'verified' });

      const outbound = await search({ toLat: ORLEANS.lat, toLng: ORLEANS.lng, seats: 10, time: '19:00' });
      expect(outbound.body).toHaveLength(1);
      expect(outbound.body[0]).toMatchObject({ direction: 'outbound', localTime: '19:00', totalPriceCents: 39000, seatsLeft: 13 });
      expect(outbound.body[0].reasons).toContainEqual({ code: 'private_vehicle' });
      expect(outbound.body[0].operator.rating).toBeNull(); // pas encore noté

      const back = await search({ fromLat: ORLEANS.lat, fromLng: ORLEANS.lng, toLat: PARIS.lat, toLng: PARIS.lng, seats: 4 });
      expect(back.body).toHaveLength(1);
      expect(back.body[0]).toMatchObject({ direction: 'return', localTime: '22:30', origin: ORLEANS.address, destination: PARIS.address });

      expect((await search({ toLat: ORLEANS.lat, toLng: ORLEANS.lng, seats: 14 })).body).toEqual([]);
    });

    it('véhicule privatisé : un premier client le prend en entier', async () => {
      const lineId = await publishChris();
      await verify(CHRIS, { status: 'verified' });
      const dep = departureOf(lineId);
      expect(await lines.reserveSeats(dep.id, 6)).toMatchObject({ seats: 13, priceCents: 39000 });
      await expect(lines.reserveSeats(dep.id, 1)).rejects.toThrow('Plus assez de places sur ce départ');
      expect((await search({ toLat: ORLEANS.lat, toLng: ORLEANS.lng, seats: 1 })).body).toEqual([]);
    });
  });

  describe('scénario F — disponibilité', () => {
    it('départ fermé (« plus de places »), puis rouvert', async () => {
      const lineId = await publishDjamel();
      const dep = departureOf(lineId);
      const closed = await http().patch(`/api/v1/operators/me/departures/${dep.id}`).set('Authorization', djamel).send({ closed: true });
      expect(closed.body.status).toBe('closed');
      expect((await search({})).body).toEqual([]);
      await http().patch(`/api/v1/operators/me/departures/${dep.id}`).set('Authorization', djamel).send({ closed: false });
      expect((await search({})).body).toHaveLength(1);
    });

    it('ligne en pause : plus proposée ; reprise : de nouveau proposée sans reconfirmation', async () => {
      const lineId = await publishDjamel();
      await http().post(`/api/v1/operators/me/lines/${lineId}/pause`).set('Authorization', djamel);
      expect((await search({})).body).toEqual([]);
      await http().post(`/api/v1/operators/me/lines/${lineId}/resume`).set('Authorization', djamel);
      expect((await search({})).body).toHaveLength(1);
    });

    it('places vendues : la dernière place ne part qu’une fois, puis le départ disparaît', async () => {
      const lineId = await publishDjamel();
      const dep = departureOf(lineId);
      await lines.reserveSeats(dep.id, 7);
      await expect(lines.reserveSeats(dep.id, 2)).rejects.toThrow('Plus assez de places sur ce départ');
      expect((await search({ seats: 2 })).body).toEqual([]);
      expect((await search({ seats: 1 })).body[0].seatsLeft).toBe(1);
      await lines.reserveSeats(dep.id, 1);
      expect((await search({ seats: 1 })).body).toEqual([]);
      await lines.releaseSeats(dep.id, 3); // annulation de 3 places
      expect((await search({ seats: 3 })).body).toHaveLength(1);
    });

    it('opérateur suspendu, ou vente à la place retirée : ses départs disparaissent aussitôt', async () => {
      await publishDjamel();
      await verify(DJAMEL, { perSeatAllowed: false });
      expect((await search({})).body).toEqual([]);
      await verify(DJAMEL, { perSeatAllowed: true });
      expect((await search({})).body).toHaveLength(1);
      await verify(DJAMEL, { status: 'suspended' });
      expect((await search({})).body).toEqual([]);
    });

    it('changer de licence retire la vente à la place jusqu’à la nouvelle vérification', async () => {
      await publishDjamel();
      const res = await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', transportLicense: 'LOTI-2027-0001' });
      expect(res.body.perSeatAllowed).toBe(false);
      expect((await search({})).body).toEqual([]);
    });

    it('jour fermé ou capacité réduite par une exception ; jamais sous les places déjà vendues', async () => {
      const lineId = await publishDjamel();
      const day2 = addDays(tomorrow, 1);
      const closeDay = await http().post(`/api/v1/operators/me/lines/${lineId}/exceptions`).set('Authorization', djamel).send({ date: day2, reason: 'Congés' });
      expect(closeDay.status).toBe(200);
      expect(departureOf(lineId, day2)).toBeUndefined();
      expect((await search({ date: day2 })).body).toEqual([]);

      await lines.reserveSeats(departureOf(lineId).id, 4);
      const tooFew = await http().post(`/api/v1/operators/me/lines/${lineId}/exceptions`).set('Authorization', djamel).send({ date: tomorrow, seats: 3 });
      expect(tooFew.status).toBe(409);
      const closeBooked = await http().post(`/api/v1/operators/me/lines/${lineId}/exceptions`).set('Authorization', djamel).send({ date: tomorrow });
      expect(closeBooked.status).toBe(409);
      await http().post(`/api/v1/operators/me/lines/${lineId}/exceptions`).set('Authorization', djamel).send({ date: tomorrow, seats: 5 });
      expect((await search({ seats: 1 })).body[0].seatsLeft).toBe(1);

      await http().delete(`/api/v1/operators/me/lines/${lineId}/exceptions/${day2}`).set('Authorization', djamel);
      expect(departureOf(lineId, day2)).toMatchObject({ status: 'to_confirm' }); // à reconfirmer
    });

    it('modifier l’horaire : le départ déjà réservé garde son heure, les autres repassent « à confirmer »', async () => {
      const lineId = await publishDjamel();
      const booked = departureOf(lineId);
      await lines.reserveSeats(booked.id, 2);
      const res = await http().patch(`/api/v1/operators/me/lines/${lineId}`).set('Authorization', djamel).send({ departureTime: '05:30', priceCents: 2700 });
      expect(res.status).toBe(200);
      expect(departureOf(lineId)).toMatchObject({ departureAt: booked.departureAt, priceCents: 2500, status: 'open' });
      expect(departureOf(lineId, addDays(tomorrow, 1))).toMatchObject({ priceCents: 2700, status: 'to_confirm' });
    });

    it('fermer la ligne : départs sans réservation supprimés, départs réservés conservés (fermés à la vente)', async () => {
      const lineId = await publishDjamel();
      await lines.reserveSeats(departureOf(lineId).id, 2);
      const res = await http().post(`/api/v1/operators/me/lines/${lineId}/close`).set('Authorization', djamel);
      expect(res.body).toMatchObject({ status: 'closed', keptBookedDepartures: 1 });
      const left = db.lineDeparture.rows.filter((d: any) => d.lineId === lineId);
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ seatsBooked: 2, status: 'closed' });
      const again = await http().patch(`/api/v1/operators/me/lines/${lineId}`).set('Authorization', djamel).send({ seats: 6 });
      expect(again.status).toBe(409);
    });
  });

  describe('scénario H — cloisonnement et droits', () => {
    it('un opérateur ne voit ni ne modifie la ligne d’un autre (404) ; un passager n’a pas d’espace opérateur', async () => {
      const lineId = await publishDjamel();
      expect((await http().patch(`/api/v1/operators/me/lines/${lineId}`).set('Authorization', chris).send({ seats: 2 })).status).toBe(404);
      expect((await http().post(`/api/v1/operators/me/lines/${lineId}/pause`).set('Authorization', chris)).status).toBe(404);
      expect((await http().get('/api/v1/operators/me/departures').set('Authorization', chris).query({ lineId })).status).toBe(404);
      const dep = departureOf(lineId);
      expect((await http().patch(`/api/v1/operators/me/departures/${dep.id}`).set('Authorization', chris).send({ closed: true })).status).toBe(404);
      const confirm = await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', chris).send({ until: addDays(tomorrow, 20) });
      expect(confirm.body).toEqual({ confirmed: 0 });
      expect((await http().get('/api/v1/operators/me/lines').set('Authorization', chris)).body).toEqual([]);

      expect((await http().get('/api/v1/operators/me/lines').set('Authorization', pax)).status).toBe(403);
      expect((await http().get('/api/v1/lines/search')).status).toBe(401);
    });

    it('un chauffeur non validé ne publie pas ; le véhicule d’un autre est introuvable', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', chris).send({ kind: 'collective', ...TERMS });
      db.driverProfile.rows.find((d: any) => d.id === CHRIS).approvedAt = null;
      const res = await http().post('/api/v1/operators/me/lines').set('Authorization', chris).send(beauvaisLine({ vehicleId: VAN_CHRIS, pricingMode: 'per_vehicle' }));
      expect(res.status).toBe(403);
      db.driverProfile.rows.find((d: any) => d.id === CHRIS).approvedAt = new Date();
      const other = await http().post('/api/v1/operators/me/lines').set('Authorization', chris).send(beauvaisLine({ pricingMode: 'per_vehicle' }));
      expect(other.status).toBe(404);
    });

    it('conditions générales opérateur : acceptées dans la version en vigueur avant toute ligne', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent' });
      const refused = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine({ pricingMode: 'per_vehicle' }));
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('OPERATOR_TERMS_REQUIRED');
      const old = await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', acceptTerms: true, termsVersion: '2020-01-01' });
      expect(old.status).toBe(400);
      const ok = await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', ...TERMS });
      expect(ok.body.termsAccepted).toBe(true);
      expect(db.auditLog.rows.some((r: any) => r.action === 'operator.terms.accept')).toBe(true);
      // Un nouvel enregistrement du profil sans acceptation ne retire pas l'acceptation.
      const again = await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', legalName: 'D. Navettes' });
      expect(again.body.termsAccepted).toBe(true);
      expect((await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine({ pricingMode: 'per_vehicle' }))).status).toBe(201);
    });

    it('véhicules : seulement les siens', async () => {
      const res = await http().get('/api/v1/operators/me/vehicles').set('Authorization', djamel);
      expect(res.body).toEqual([{ id: VAN_DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-111-AA', capacity: 8, shuttleType: undefined, accessible: undefined }]);
    });

    it('l’opérateur ne s’accorde ni la vérification ni la vente à la place', async () => {
      const res = await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', status: 'verified', perSeatAllowed: true });
      expect(res.status).toBe(400);
    });

    it('vérification admin : 2FA exigée, motif obligatoire, tracée au journal d’audit', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent' });
      const noProof = await http().patch(`/api/v1/admin/operators/${DJAMEL}`).set('Authorization', as('ops', 'admin')).send({ status: 'verified', reason: 'ok ok ok' });
      expect(noProof.status).toBe(403);
      const noLicense = await http().patch(`/api/v1/admin/operators/${DJAMEL}`).set(admin).send({ perSeatAllowed: true, reason: 'Licence vue' });
      expect(noLicense.status).toBe(400);
      await verify(DJAMEL, { status: 'verified' });
      expect(db.auditLog.rows.find((r: any) => r.action === 'operator.review')).toMatchObject({ userId: 'ops', entityId: DJAMEL });
      const list = await http().get('/api/v1/admin/operators').set(admin).query({ status: 'verified' });
      expect(list.body.items[0]).toMatchObject({ id: DJAMEL, name: 'Djamel', driverApproved: true, openLines: 0 });
    });
  });

  describe('validation', () => {
    it('heure, jours, dates et retour incohérents refusés', async () => {
      await http().put('/api/v1/operators/me').set('Authorization', djamel).send({ kind: 'independent', ...TERMS });
      const post = (over: Record<string, unknown>) =>
        http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(beauvaisLine({ pricingMode: 'per_vehicle', ...over }));
      expect((await post({ departureTime: '25:00' })).status).toBe(400);
      expect((await post({ daysOfWeek: [] })).status).toBe(400);
      expect((await post({ daysOfWeek: [0, 8] })).status).toBe(400);
      expect((await post({ startDate: '2020-01-01' })).status).toBe(400);
      expect((await post({ endDate: addDays(tomorrow, -1) })).status).toBe(400);
      expect((await post({ returnTime: '04:00' })).status).toBe(400);
      expect((await post({ priceCents: 0 })).status).toBe(400);
      expect((await post({ pricingMode: 'free' })).status).toBe(400);
    });
  });
});
