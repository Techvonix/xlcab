import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { mfaProof } from '../testing/two-factor-proof';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { TripsModule } from '../trips/trips.module';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { InvoicesModule } from './invoices.module';
import { InvoicesService } from './invoices.service';

// Factures légales de bout en bout : émission à la fin de course et pour
// les frais d'annulation, avoirs, facture mensuelle d'entreprise,
// numérotation continue, accès au PDF (client, entreprise, lien signé).

const JWT_SECRET = 'invoices-secret';
const HOUR = 3600_000;
const year = new Date().getUTCFullYear();
const id = (n: number) => `7a1e0000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

describe('Factures (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const invoices = () => app.get(InvoicesService);

  /** Course démarrée par d1, avec prix ventilé (passager 0 %, et colis 20 % si [parcel]). */
  function seedTrip(n: number, extra: Record<string, unknown> = {}, parcel = false) {
    const trip = {
      id: id(n), type: parcel ? 'mixed' : 'passenger', status: 'started', passengerId: 'p1', driverId: 'd1', vehicleId: 'v1',
      shuttleType: 'bleue', originAddress: 'Gare de Lyon, Paris', originLat: 48.84, originLng: 2.37,
      destinationAddress: 'Gare de Rouen', destinationLat: 49.45, destinationLng: 1.09,
      scheduledAt: new Date(Date.now() - HOUR), startedAt: new Date(Date.now() - HOUR), durationMin: 97,
      totalPriceCents: parcel ? 13146 : 12186, vatCents: parcel ? 160 : 0, jurisdiction: 'FR', corporateId: null, createdAt: new Date(), ...extra,
    };
    db.trip.rows.push(trip);
    db.passengerBooking.rows.push({ id: `b${n}`, tripId: trip.id, seats: 2, childSeats: 0, qrCode: `qr-${n}`, checkedIn: true });
    db.tripPriceLine.rows.push({ id: `l${n}a`, tripId: trip.id, regime: 'passenger', baseCents: 12186, ratePercent: 0, vatCents: 0 });
    if (parcel) db.tripPriceLine.rows.push({ id: `l${n}b`, tripId: trip.id, regime: 'parcel', baseCents: 800, ratePercent: 20, vatCents: 160 });
    return trip;
  }
  const complete = (n: number) => http().post(`/api/v1/trips/${id(n)}/complete`).set('Authorization', as('d1', 'driver'));

  beforeEach(async () => {
    db = memoryPrisma();
    db.user.rows.push(
      { id: 'p1', email: 'lea@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Léa', lastName: 'Martin' },
      { id: 'p2', email: 'paul@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null },
      { id: 'd1', email: 'nadia@x.fr', role: 'driver', jurisdiction: 'FR', deletedAt: null, firstName: 'Nadia' },
      { id: 'boss', email: 'sophie@acme.fr', role: 'corporate_admin', jurisdiction: 'FR', deletedAt: null },
      { id: 'm1', email: 'thomas@acme.fr', role: 'corporate_member', jurisdiction: 'FR', deletedAt: null, firstName: 'Thomas' },
    );
    db.driverProfile.rows.push({ id: 'd1', totalTrips: 3 });
    db.vehicle.rows.push({ id: 'v1', driverId: 'd1', plate: 'AB-123-CD', dashcamActive: true });

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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', INVOICE_SELLER_SIREN: '123456789' })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        TripsModule,
        InvoicesModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('course de particulier', () => {
    it('fin de course : facture acquittée, numérotée, lignes par régime de TVA, PDF archivé', async () => {
      seedTrip(1, {}, true);
      expect((await complete(1)).status).toBe(200);

      const inv = db.invoice.rows[0];
      expect(inv).toMatchObject({
        number: `FA-${year}-000001`, kind: 'invoice', tripId: id(1), customerUserId: 'p1', paymentStatus: 'paid',
        subtotalCents: 12986, vatCents: 160, totalCents: 13146,
        buyer: { name: 'Léa Martin', lines: ['lea@x.fr'] },
      });
      expect(inv.lines).toEqual([
        expect.objectContaining({ regime: 'passenger', vatRate: 0, unitCents: 12186, description: expect.stringContaining('Transport de personnes Gare de Lyon, Paris → Gare de Rouen') }),
        expect.objectContaining({ regime: 'parcel', vatRate: 20, unitCents: 800, vatCents: 160, totalCents: 960 }),
      ]);
      // Identité du vendeur figée ; mentions manquantes signalées.
      expect(inv.seller.lines).toEqual(expect.arrayContaining(['SIREN 123456789 — RCS [à compléter]']));
      // Clé opaque « uuid.pdf », seul format accepté par le stockage sur disque
      // (l'ancienne clé « invoice-FA-… » y était refusée : aucun PDF n'était archivé hors tests).
      expect(inv.pdfKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    });

    it('numérotation continue, sans trou ; une course déjà facturée ne l’est pas deux fois', async () => {
      seedTrip(1);
      seedTrip(2);
      await complete(1);
      await complete(2);
      await invoices().issueForTrip(id(1)); // idempotent
      expect(db.invoice.rows.map((i: any) => i.number)).toEqual([`FA-${year}-000001`, `FA-${year}-000002`]);
    });

    it('le client télécharge son PDF ; un autre client non ; l’équipe XLCAB oui', async () => {
      seedTrip(1);
      await complete(1);
      const invId = db.invoice.rows[0].id;

      const mine = await http().get('/api/v1/invoices').set('Authorization', as('p1'));
      expect(mine.body).toEqual([expect.objectContaining({ number: `FA-${year}-000001`, totalCents: 12186 })]);

      const pdf = await http().get(`/api/v1/invoices/${invId}/pdf`).set('Authorization', as('p1')).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toContain(`FA-${year}-000001.pdf`);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      expect((await http().get(`/api/v1/invoices/${invId}/pdf`).set('Authorization', as('p2'))).status).toBe(404);
      expect((await http().get(`/api/v1/invoices/${invId}/pdf`).set('Authorization', as('ops', 'admin'))).status).toBe(200);
    });

    it('app mobile : lien signé de 5 min, valable pour cette facture seulement', async () => {
      seedTrip(1);
      seedTrip(2);
      await complete(1);
      await complete(2);
      const [a, b] = db.invoice.rows;

      const link = await http().post(`/api/v1/invoices/${a.id}/link`).set('Authorization', as('p1'));
      expect(link.status).toBe(200);
      const url = new URL(link.body.url);
      expect(url.pathname).toBe(`/api/v1/invoices/${a.id}/file`);
      const token = url.searchParams.get('token')!;

      expect((await http().get(`/api/v1/invoices/${a.id}/file?token=${encodeURIComponent(token)}`)).status).toBe(200);
      expect((await http().get(`/api/v1/invoices/${b.id}/file?token=${encodeURIComponent(token)}`)).status).toBe(401);
      expect((await http().get(`/api/v1/invoices/${a.id}/file`)).status).toBe(401);
      // Un jeton d'accès ordinaire ne vaut pas lien de téléchargement.
      const access = jwt.sign({ inv: a.id, sub: 'p1' }, { secret: JWT_SECRET });
      expect((await http().get(`/api/v1/invoices/${a.id}/file?token=${access}`)).status).toBe(401);
      expect((await http().post(`/api/v1/invoices/${a.id}/link`).set('Authorization', as('p2'))).status).toBe(404);
    });

    it('écran 8 : la course indique sa facture au client', async () => {
      seedTrip(1);
      await complete(1);
      const res = await http().get(`/api/v1/trips/${id(1)}`).set('Authorization', as('p1'));
      expect(res.body.invoice).toEqual({ id: db.invoice.rows[0].id, number: `FA-${year}-000001` });
    });
  });

  describe('annulation et remboursement', () => {
    it('frais d’annulation retenus : facture de l’indemnité, hors champ TVA', async () => {
      seedTrip(1, { status: 'accepted', startedAt: null, scheduledAt: new Date(Date.now() + HOUR) });
      const res = await http().post(`/api/v1/trips/${id(1)}/cancel`).set('Authorization', as('p1')).send({ reason: 'Imprévu' });
      expect(res.body.feeCents).toBe(12186); // moins de 2 h : 100 %
      const inv = db.invoice.rows[0];
      expect(inv).toMatchObject({ number: `FA-${year}-000001`, totalCents: 12186, vatCents: 0 });
      expect(inv.lines[0]).toMatchObject({ regime: 'cancellation', vatRate: 0, description: expect.stringContaining('Frais d’annulation') });
    });

    it('annulation sans frais : aucune facture', async () => {
      seedTrip(1, { status: 'pending', driverId: null, startedAt: null, scheduledAt: new Date(Date.now() + 48 * HOUR) });
      await http().post(`/api/v1/trips/${id(1)}/cancel`).set('Authorization', as('p1')).send({ reason: 'Imprévu' });
      expect(db.invoice.rows).toHaveLength(0);
    });

    it('remboursement partiel : avoir (série AV) au prorata de chaque taux de TVA', async () => {
      seedTrip(1, {}, true);
      await complete(1);
      const credit = await invoices().issueCreditNote(id(1), 6573, 'Retard important');
      expect(credit).toMatchObject({ number: `AV-${year}-000001`, kind: 'credit_note', totalCents: -6573, creditedInvoiceId: db.invoice.rows[0].id });
      const lines = credit!.lines as any[];
      expect(lines[0]).toMatchObject({ regime: 'passenger', vatRate: 0, totalCents: -6093 });
      expect(lines[1]).toMatchObject({ regime: 'parcel', vatRate: 20, totalCents: -480, vatCents: -80, unitCents: -400 });
      expect(credit!.subtotalCents + credit!.vatCents).toBe(-6573);
    });
  });

  describe('entreprises', () => {
    const lastMonth = () => {
      const n = new Date();
      return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
    };

    beforeEach(() => {
      db.corporateAccount.rows.push({
        id: 'corp-1', companyName: 'Acme SAS', siret: '11122233300011', vatNumber: 'FR12111222333', billingAddress: '1 rue de la Paix, 75002 Paris',
        billingEmail: 'compta@acme.fr', jurisdiction: 'FR', createdAt: new Date(),
      });
      db.corporateMember.rows.push(
        { id: 'cm1', corporateId: 'corp-1', userId: 'boss', role: 'admin', isActive: true },
        { id: 'cm2', corporateId: 'corp-1', userId: 'm1', role: 'member', isActive: true },
      );
    });

    it('pas de facture à la course : facture mensuelle récapitulative, payable à 30 jours', async () => {
      const inMonth = new Date(lastMonth().getTime() + 5 * 24 * HOUR);
      seedTrip(1, { corporateId: 'corp-1', passengerId: 'm1', costCenter: 'VENTES' });
      await complete(1);
      expect(db.invoice.rows).toHaveLength(0);

      Object.assign(db.trip.rows[0], { completedAt: inMonth });
      seedTrip(2, { corporateId: 'corp-1', passengerId: 'm1', status: 'completed', completedAt: inMonth });
      const inv = await invoices().issueCorporateMonthly('corp-1', lastMonth());

      expect(inv).toMatchObject({
        number: `FA-${year}-000001`, corporateId: 'corp-1', paymentStatus: 'due', totalCents: 24372, tripIds: [id(1), id(2)],
        buyer: { name: 'Acme SAS', lines: ['1 rue de la Paix, 75002 Paris', 'SIRET : 11122233300011', 'TVA intracommunautaire : FR12111222333', 'compta@acme.fr'] },
      });
      expect((inv!.lines as any[])[0].description).toContain('centre de coût VENTES');
      expect(inv!.dueDate!.getTime() - Date.now()).toBeGreaterThan(29 * 24 * HOUR);

      // Idempotente : une seule facture par entreprise et par mois.
      await invoices().issueCorporateMonthly('corp-1', lastMonth());
      expect(db.invoice.rows).toHaveLength(1);
    });

    it('planificateur : factures du mois écoulé pour chaque entreprise ayant roulé', async () => {
      seedTrip(1, { corporateId: 'corp-1', passengerId: 'm1', status: 'completed', completedAt: new Date(lastMonth().getTime() + 24 * HOUR) });
      expect(await invoices().runMonthly(new Date())).toBe(1);
      expect(await invoices().runMonthly(new Date())).toBe(0);
    });

    it('portail : l’admin de l’entreprise voit et télécharge ses factures ; un collaborateur non', async () => {
      seedTrip(1, { corporateId: 'corp-1', passengerId: 'm1', status: 'completed', completedAt: new Date(lastMonth().getTime() + 24 * HOUR) });
      const inv = await invoices().issueCorporateMonthly('corp-1', lastMonth());

      const corp = { Authorization: as('boss', 'corporate_admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'boss') };
      const list = await http().get('/api/v1/corporate/invoices/issued').set(corp);
      expect(list.body).toEqual([expect.objectContaining({ number: inv!.number, paymentStatus: 'due' })]);
      expect((await http().get(`/api/v1/corporate/invoices/issued/${inv!.id}/pdf`).set(corp)).status).toBe(200);
      // Sans preuve 2FA : refusé ; et pas d'accès détourné par la route des particuliers.
      expect((await http().get('/api/v1/corporate/invoices/issued').set('Authorization', as('boss', 'corporate_admin'))).status).toBe(403);
      expect((await http().get(`/api/v1/invoices/${inv!.id}/pdf`).set('Authorization', as('boss', 'corporate_admin'))).status).toBe(404);

      expect((await http().get('/api/v1/corporate/invoices/issued').set({ Authorization: as('m1', 'corporate_member'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'm1') })).status).toBe(403);
      expect((await http().get(`/api/v1/invoices/${inv!.id}/pdf`).set('Authorization', as('m1', 'corporate_member'))).status).toBe(404);
    });
  });
});
