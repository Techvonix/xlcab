import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { mfaProof } from '../testing/two-factor-proof';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { CorporateModule } from './corporate.module';

// Portail corporate côté serveur, de bout en bout : vrai HTTP (JWT +
// RBAC du Module 2), vrais services Bookings / Pricing / Corporate.
// Base en mémoire, Google Routes simulé (135,4 km).

const JWT_SECRET = 'corporate-secret';
const inDays = (d: number) => new Date(Date.now() + d * 86400_000);

describe('Corporate (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let fetchMock: jest.SpyInstance;
  const jwt = new JwtService();

  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());

  const tripBody = (over: object = {}) => ({
    origin: { lat: 48.8443, lng: 2.3744 },
    destination: { lat: 49.4488, lng: 1.0942 },
    originAddress: 'Gare de Lyon, Paris',
    destinationAddress: 'Gare de Rouen',
    shuttleType: 'orange',
    scheduledAt: inDays(1).toISOString(),
    seats: 2,
    ...over,
  });

  /** Utilisateurs de départ + compte entreprise ouvert par un admin XLCAB. */
  async function seed() {
    const users = db.user.rows;
    users.push(
      { id: 'xlcab-admin', email: 'ops@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null },
      { id: 'boss', email: 'boss@acme.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Alice', lastName: 'Martin' },
      { id: 'emp', email: 'emp@acme.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Bruno', lastName: 'Petit' },
      { id: 'driver', email: 'driver@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null },
      { id: 'other-boss', email: 'other@globex.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null },
    );
    const res = await http()
      .post('/api/v1/corporate/accounts')
      .set({ Authorization: as('xlcab-admin', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'xlcab-admin') })
      .send({ companyName: 'ACME SAS', billingEmail: 'compta@acme.fr', siret: '123 456 789 00012', adminEmail: 'boss@acme.fr' });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const boss = () => as('boss', 'corporate_admin');
  /** Admin d'entreprise avec sa preuve de double authentification (Partie 8). */
  const corp = (sub = 'boss') => ({ Authorization: as(sub, 'corporate_admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, sub) });

  async function addEmployee(extra: object = {}) {
    const res = await http().post('/api/v1/corporate/members').set(corp()).send({ email: 'emp@acme.fr', ...extra });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  beforeEach(async () => {
    db = memoryPrisma();

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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'server-key' })],
        }),
        FakeInfraModule,
        AuthModule,
        CorporateModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ routes: [{ distanceMeters: 135_400, duration: '5820s' }] }),
    } as Response);
  });

  afterEach(async () => {
    fetchMock.mockRestore();
    await app.close();
  });

  describe('comptes', () => {
    it("l'équipe XLCAB ouvre le compte : l'utilisateur désigné devient admin corporate", async () => {
      const id = await seed();
      expect(db.user.rows.find((u: any) => u.id === 'boss').role).toBe('corporate_admin');
      expect(db.corporateMember.rows).toEqual([expect.objectContaining({ corporateId: id, userId: 'boss', role: 'admin' })]);
      expect(db.corporateAccount.rows[0].siret).toBe('12345678900012'); // espaces retirés
    });

    it("un utilisateur ne peut pas s'ouvrir lui-même un compte entreprise", async () => {
      db.user.rows.push({ id: 'p', email: 'p@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null });
      const res = await http()
        .post('/api/v1/corporate/accounts')
        .set('Authorization', as('p', 'passenger'))
        .send({ companyName: 'Moi SAS', billingEmail: 'p@x.fr', adminEmail: 'p@x.fr' });
      expect(res.status).toBe(403);
    });

    it('le plafond mensuel est modifiable, pas la raison sociale', async () => {
      await seed();
      const ok = await http().patch('/api/v1/corporate/accounts/me').set(corp()).send({ monthlyLimitCents: 500_000 });
      expect(ok.status).toBe(200);
      const ko = await http().patch('/api/v1/corporate/accounts/me').set(corp()).send({ companyName: 'Autre' });
      expect(ko.status).toBe(400);
    });
  });

  describe('équipe', () => {
    it('ajout d’un collaborateur par email : devient membre corporate', async () => {
      await seed();
      await addEmployee({ costCenter: 'Ventes', monthlyLimitCents: 100_000 });
      expect(db.user.rows.find((u: any) => u.id === 'emp').role).toBe('corporate_member');

      const list = await http().get('/api/v1/corporate/members').set(corp());
      expect(list.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: 'emp@acme.fr', firstName: 'Bruno', costCenter: 'Ventes', monthSpendCents: 0 }),
        ]),
      );
    });

    it('refus : email inconnu (404), compte chauffeur (409), doublon (409)', async () => {
      await seed();
      const post = (email: string) => http().post('/api/v1/corporate/members').set(corp()).send({ email });
      expect((await post('inconnu@x.fr')).status).toBe(404);
      expect((await post('driver@x.fr')).status).toBe(409);
      await addEmployee();
      expect((await post('emp@acme.fr')).status).toBe(409);
    });

    it('retrait : membre désactivé, redevient passager, historique conservé', async () => {
      await seed();
      const memberId = await addEmployee();
      const res = await http().delete(`/api/v1/corporate/members/${memberId}`).set(corp());
      expect(res.status).toBe(200);
      expect(db.corporateMember.rows.find((m: any) => m.id === memberId).isActive).toBe(false);
      expect(db.user.rows.find((u: any) => u.id === 'emp').role).toBe('passenger');
    });

    it("un administrateur ne peut pas être retiré depuis le portail", async () => {
      await seed();
      const adminMember = db.corporateMember.rows.find((m: any) => m.userId === 'boss');
      const res = await http().delete(`/api/v1/corporate/members/${adminMember.id}`).set(corp());
      expect(res.status).toBe(403);
    });
  });

  describe('réservation pour un collaborateur', () => {
    it('crée la course facturée à l’entreprise, avec TVA ventilée (trajet mixte)', async () => {
      const corpId = await seed();
      const memberId = await addEmployee({ costCenter: 'Ventes' });

      const res = await http()
        .post('/api/v1/corporate/bookings')
        .set(corp())
        .send({ memberId, trip: tripBody({ withParcel: true }) });

      expect(res.status).toBe(201);
      // Orange : 135,4 × 150 c = 20 310 c (0 %) + colis 800 c (20 % = 160 c)
      expect(res.body.quote).toMatchObject({ priceCents: 21110, vatCents: 160, totalCents: 21270 });
      const trip = db.trip.rows[0];
      expect(trip).toMatchObject({
        passengerId: 'emp', corporateId: corpId, costCenter: 'Ventes', bookedById: 'boss',
        type: 'mixed', status: 'pending', totalPriceCents: 21270,
      });
      expect(db.tripPriceLine.rows.map((l: any) => [l.regime, l.baseCents, l.vatCents])).toEqual([
        ['passenger', 20310, 0],
        ['parcel', 800, 160],
      ]);
      expect(db.passengerBooking.rows[0]).toMatchObject({ tripId: trip.id, seats: 2, qrCode: expect.any(String) });
    });

    it("refuse de réserver pour le collaborateur d'une autre entreprise", async () => {
      await seed();
      const memberId = await addEmployee();
      // Seconde entreprise.
      await http()
        .post('/api/v1/corporate/accounts')
        .set({ Authorization: as('xlcab-admin', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'xlcab-admin') })
        .send({ companyName: 'Globex', billingEmail: 'c@globex.fr', adminEmail: 'other@globex.fr' });

      const res = await http()
        .post('/api/v1/corporate/bookings')
        .set(corp('other-boss'))
        .send({ memberId, trip: tripBody() });
      expect(res.status).toBe(404);
      expect(db.trip.rows).toHaveLength(0);
    });

    it('plafond mensuel du collaborateur : refus explicite avec le reste disponible', async () => {
      await seed();
      const memberId = await addEmployee({ monthlyLimitCents: 30_000 });
      const book = () => http().post('/api/v1/corporate/bookings').set(corp()).send({ memberId, trip: tripBody() });

      expect((await book()).status).toBe(201); // 203,10 €
      const second = await book();
      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/Plafond mensuel du collaborateur dépassé \(reste 96,90\s€\)/);
      expect(db.trip.rows).toHaveLength(1);
    });

    it('plafond mensuel de l’entreprise', async () => {
      await seed();
      db.corporateAccount.rows[0].monthlyLimitCents = 10_000;
      const memberId = await addEmployee();
      const res = await http().post('/api/v1/corporate/bookings').set(corp()).send({ memberId, trip: tripBody() });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Plafond mensuel de l’entreprise dépassé/);
    });
  });

  describe('tableau de bord et factures', () => {
    async function bookTwoTrips() {
      await seed();
      const memberId = await addEmployee({ costCenter: 'Ventes' });
      for (const withParcel of [false, true]) {
        await http().post('/api/v1/corporate/bookings').set(corp()).send({ memberId, trip: tripBody({ withParcel }) });
      }
      // La 1re course est terminée : seule elle est facturable.
      db.trip.rows[0].status = 'completed';
    }
    const month = () => inDays(1).toISOString().slice(0, 7);

    it('KPIs du mois : dépense, TVA séparée, répartitions et 6 mois d’historique', async () => {
      await bookTwoTrips();
      const res = await http().get(`/api/v1/corporate/analytics?month=${month()}`).set(corp());

      expect(res.status).toBe(200);
      expect(res.body.totals).toEqual({
        trips: 2,
        spendTtcCents: 20310 + 21270,
        spendHtCents: 20310 + 21110,
        vatCents: 160,
        passengerHtCents: 40620,
        parcelHtCents: 800,
      });
      expect(res.body.byMember).toEqual([{ name: 'Bruno Petit', trips: 2, spendTtcCents: 41580 }]);
      expect(res.body.byCostCenter).toEqual([{ costCenter: 'Ventes', spendTtcCents: 41580 }]);
      expect(res.body.monthly).toHaveLength(6);
      expect(res.body.monthly[5]).toEqual({ month: month(), trips: 2, spendTtcCents: 41580 });
    });

    it('relevé : toutes les courses listées, seules les terminées facturées', async () => {
      await bookTwoTrips();
      const res = await http().get(`/api/v1/corporate/invoices?month=${month()}`).set(corp());

      expect(res.body.company).toMatchObject({ name: 'ACME SAS', siret: '12345678900012' });
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.lines.map((l: any) => l.billable)).toEqual([true, false]);
      expect(res.body.lines[1]).toMatchObject({ parcelHtCents: 800, parcelVatRate: 20, parcelVatCents: 160, passengerVatRate: 0 });
      expect(res.body.totals).toEqual({
        billableTrips: 1,
        passengerHtCents: 20310,
        passengerVatCents: 0,
        parcelHtCents: 0,
        parcelVatCents: 0,
        totalTtcCents: 20310,
      });
    });

    it('mois invalide refusé', async () => {
      await seed();
      expect((await http().get('/api/v1/corporate/analytics?month=2026-13').set(corp())).status).toBe(400);
    });
  });

  describe('contrôle d’accès', () => {
    it('double authentification obligatoire pour l’admin d’entreprise (Partie 8)', async () => {
      await seed();
      const noProof = await http().get('/api/v1/corporate/members').set('Authorization', boss());
      expect(noProof.status).toBe(403);
      expect(noProof.body.code).toBe('TWO_FACTOR_REQUIRED');
      // Preuve d'un autre compte : refusée aussi.
      const stolen = await http().get('/api/v1/corporate/members').set({ Authorization: boss(), 'X-2FA-Token': mfaProof(JWT_SECRET, 'other-boss') });
      expect(stolen.status).toBe(403);
    });

    it('un collaborateur (corporate_member) n’accède pas au portail', async () => {
      await seed();
      await addEmployee();
      const res = await http().get('/api/v1/corporate/members').set('Authorization', as('emp', 'corporate_member'));
      expect(res.status).toBe(403);
    });

    it('un jeton "corporate_admin" sans appartenance réelle en base est refusé', async () => {
      await seed();
      const res = await http().get('/api/v1/corporate/analytics').set(corp('emp'));
      expect(res.status).toBe(403);
    });

    it('chaque admin ne voit que son entreprise', async () => {
      await seed();
      await addEmployee();
      await http()
        .post('/api/v1/corporate/accounts')
        .set({ Authorization: as('xlcab-admin', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'xlcab-admin') })
        .send({ companyName: 'Globex', billingEmail: 'c@globex.fr', adminEmail: 'other@globex.fr' });
      const res = await http().get('/api/v1/corporate/members').set(corp('other-boss'));
      expect(res.body.map((m: any) => m.email)).toEqual(['other@globex.fr']);
    });
  });

  it('géocodage d’adresse pour le portail web (POST /geocode)', async () => {
    await seed();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [{ formatted_address: 'Gare de Lyon, 75012 Paris, France', geometry: { location: { lat: 48.8443, lng: 2.3744 } } }],
      }),
    } as Response);

    const res = await http().post('/api/v1/geocode').set(corp()).send({ address: 'gare de lyon' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ address: 'Gare de Lyon, 75012 Paris, France', lat: 48.8443, lng: 2.3744 }]);
    const url = new URL(String(fetchMock.mock.calls.at(-1)[0]));
    expect(url.searchParams.get('components')).toBe('country:FR');
  });
});
