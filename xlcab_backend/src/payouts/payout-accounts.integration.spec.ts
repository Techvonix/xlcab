import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { PayoutsModule } from './payout-accounts';

// Stripe Connect, étape 1 (vrai HTTP, base et Stripe simulés) : ouverture du
// compte de versement d'un opérateur, suivi de sa validation par Stripe, et
// blocage de la mise en vente tant qu'il n'est pas prêt.

const JWT_SECRET = 'payouts-secret';
const CONNECT_SECRET = 'whsec_connect_test';
const DJAMEL = 'd1a00000-0000-4000-8000-000000000001';
const CHRIS = 'c4100000-0000-4000-8000-000000000002';
const KARIM = 'ca000000-0000-4000-8000-000000000004'; // candidat non validé
const VAN = 'e0000000-0000-4000-8000-000000000011';

describe('Compte de versement des opérateurs (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let stripe: FakeStripe;
  let redis: FakeRedis;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const djamel = as(DJAMEL, 'driver');
  const http = () => request(app.getHttpServer());
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);

  const account = () => http().get('/api/v1/operators/me/payout-account').set('Authorization', djamel);
  const link = (auth = djamel) => http().post('/api/v1/operators/me/payout-account/onboarding-link').set('Authorization', auth);
  const webhook = (event: Record<string, unknown>, signature = `valid:${CONNECT_SECRET}`) =>
    http().post('/api/v1/webhooks/stripe-connect').set('stripe-signature', signature).set('Content-Type', 'application/json').send(JSON.stringify(event));

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
    process.env.PUBLIC_API_URL = 'https://api.exemple.test/';
    delete process.env.LINE_PAYMENT_MODE;
    db = memoryPrisma();
    stripe = new FakeStripe();
    redis = new FakeRedis();

    for (const [id, email] of [[DJAMEL, 'djamel@exemple.test'], [CHRIS, 'chris@exemple.test'], [KARIM, 'karim@exemple.test']]) {
      db.user.rows.push({ id, email, role: 'driver', deletedAt: null });
    }
    db.driverProfile.rows.push({ id: DJAMEL, approvedAt: new Date() }, { id: CHRIS, approvedAt: new Date() }, { id: KARIM, approvedAt: null });
    db.operatorProfile.rows.push({
      id: DJAMEL, status: 'verified', perSeatAllowed: true, termsAcceptedAt: new Date(), termsVersion: DEFAULT_OPERATOR_TERMS_VERSION,
    });
    db.vehicle.rows.push({ id: VAN, driverId: DJAMEL, capacity: 8, shuttleType: 'bleue', pmrEquipped: false });

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
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), FakeInfraModule, AuthModule, AuditModule, NotificationsModule, PayoutsModule, OperatorsModule],
    })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    delete process.env.LINE_PAYMENT_MODE;
    await app.close();
  });

  /** Ouvre le compte de Djamel et renvoie son identifiant Stripe. */
  async function open(): Promise<string> {
    const res = await link();
    expect(res.status).toBe(200);
    return db.payoutAccount.rows[0].stripeAccountId;
  }

  it('sans compte : état « none », non exigé tant que le paiement en ligne est coupé', async () => {
    const res = await account();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ required: false, state: 'none', ready: false, requirementsDue: 0 });
  });

  it('ouvre un compte Express qui ne fait que recevoir des reversements, et renvoie le lien Stripe', async () => {
    const res = await link();
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/connect\.stripe\.test\/setup\/acct_/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const created = stripe.accountCreates[0];
    expect(created.params).toMatchObject({ type: 'express', country: 'FR', email: 'djamel@exemple.test', capabilities: { transfers: { requested: true } }, metadata: { userId: DJAMEL } });
    expect(created.params.capabilities.card_payments).toBeUndefined();
    expect(created.options).toEqual({ idempotencyKey: `payout-account-${DJAMEL}` });
    // Pages de retour sur l'API publique, sans double barre oblique.
    expect(stripe.accountLinksCreated[0]).toMatchObject({
      type: 'account_onboarding', return_url: 'https://api.exemple.test/versements/retour', refresh_url: 'https://api.exemple.test/versements/reprise',
    });
    expect(db.auditLog.rows.some((l: any) => l.action === 'payout.account.create' && l.userId === DJAMEL)).toBe(true);
  });

  it('redemander un lien ne crée pas un second compte', async () => {
    const first = await link();
    const second = await link();
    expect(second.status).toBe(200);
    expect(second.body.url).not.toBe(first.body.url);
    expect(stripe.accountCreates).toHaveLength(1);
    expect(db.payoutAccount.rows).toHaveLength(1);
  });

  it('refuse un chauffeur non validé (403) et un chauffeur sans profil opérateur (409)', async () => {
    const candidate = await link(as(KARIM, 'driver'));
    expect(candidate.status).toBe(403);
    const noProfile = await link(as(CHRIS, 'driver'));
    expect(noProfile.status).toBe(409);
    expect(stripe.accountCreates).toHaveLength(0);
  });

  it('réservé aux chauffeurs : un passager reçoit 403, un anonyme 401', async () => {
    expect((await link(as('aa000000-0000-4000-8000-000000000003', 'passenger'))).status).toBe(403);
    expect((await http().get('/api/v1/operators/me/payout-account')).status).toBe(401);
  });

  it('limite les demandes de lien à 10 par heure', async () => {
    for (let i = 0; i < 10; i++) expect((await link()).status).toBe(200);
    expect((await link()).status).toBe(429);
  });

  it('dossier commencé : « incomplete » avec le nombre d’informations attendues, jamais leur détail', async () => {
    await open();
    const res = await account();
    expect(res.body).toEqual({ required: false, state: 'incomplete', ready: false, requirementsDue: 2 });
    expect(JSON.stringify(res.body)).not.toContain('acct_');
  });

  it('dossier envoyé mais pas encore vérifié par Stripe : « pending »', async () => {
    const id = await open();
    Object.assign(stripe.accounts_.get(id), { details_submitted: true, requirements: { currently_due: [], disabled_reason: 'requirements.pending_verification' } });
    expect((await account()).body).toMatchObject({ state: 'pending', ready: false });
  });

  it('au retour de Stripe, l’état est relu sans attendre le webhook', async () => {
    const id = await open();
    stripe.completeOnboarding(id);
    expect((await account()).body).toEqual({ required: false, state: 'ready', ready: true, requirementsDue: 0 });
    expect(db.notification.rows.some((n: any) => n.userId === DJAMEL && n.type === 'payout.account_ready')).toBe(true);
  });

  describe('webhook Stripe Connect', () => {
    it('account.updated valide le compte, une seule fois même livré deux fois', async () => {
      const id = await open();
      const event = { id: 'evt_1', type: 'account.updated', data: { object: stripe.completeOnboarding(id) } };
      expect((await webhook(event)).body).toEqual({ received: true });
      expect((await webhook(event)).body).toEqual({ received: true, duplicate: true });
      expect(db.payoutAccount.rows[0]).toMatchObject({ payoutsEnabled: true, transfersActive: true, detailsSubmitted: true, requirementsDue: 0 });
      expect(db.notification.rows.filter((n: any) => n.type === 'payout.account_ready')).toHaveLength(1);
    });

    it('refuse une signature invalide ou absente', async () => {
      const id = await open();
      const event = { id: 'evt_2', type: 'account.updated', data: { object: stripe.completeOnboarding(id) } };
      expect((await webhook(event, 'valid:autre-secret')).status).toBe(400);
      expect((await http().post('/api/v1/webhooks/stripe-connect').send(event)).status).toBe(400);
      expect(db.payoutAccount.rows[0].payoutsEnabled).toBe(false);
    });

    it('ignore un compte inconnu de XLCAB', async () => {
      const res = await webhook({ id: 'evt_3', type: 'account.updated', data: { object: { id: 'acct_inconnu', payouts_enabled: true } } });
      expect(res.body).toEqual({ received: true });
      expect(db.payoutAccount.rows).toHaveLength(0);
    });

    it('versements suspendus par Stripe : le compte n’est plus prêt et l’opérateur est prévenu', async () => {
      const id = await open();
      await webhook({ id: 'evt_4', type: 'account.updated', data: { object: stripe.completeOnboarding(id) } });
      const suspended = { ...stripe.accounts_.get(id), payouts_enabled: false, requirements: { currently_due: ['external_account'], disabled_reason: 'requirements.past_due' } };
      stripe.accounts_.set(id, suspended);
      await webhook({ id: 'evt_5', type: 'account.updated', data: { object: suspended } });
      expect((await account()).body).toMatchObject({ state: 'incomplete', ready: false, requirementsDue: 1 });
      expect(db.notification.rows.some((n: any) => n.type === 'payout.account_action_required')).toBe(true);
    });
  });

  it('espace Stripe de l’opérateur : seulement une fois le dossier envoyé', async () => {
    const dashboard = () => http().post('/api/v1/operators/me/payout-account/dashboard-link').set('Authorization', djamel);
    expect((await dashboard()).status).toBe(409);
    const id = await open();
    expect((await dashboard()).status).toBe(409);
    stripe.completeOnboarding(id);
    await account();
    const res = await dashboard();
    expect(res.status).toBe(200);
    expect(res.body.url).toBe(`https://connect.stripe.test/express/${id}`);
  });

  describe('mise en vente d’un départ', () => {
    const line = {
      vehicleId: VAN,
      originAddress: 'Porte Maillot, 75017 Paris', originLat: 48.8781, originLng: 2.2834,
      destinationAddress: 'Aéroport de Beauvais-Tillé', destinationLat: 49.4544, destinationLng: 2.1128,
      departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 8, luggage: 10,
      pricingMode: 'per_seat', priceCents: 2500, durationMin: 75,
    };
    const confirm = (lineId: string) =>
      http().post('/api/v1/operators/me/departures/confirm').set('Authorization', djamel).send({ lineId, until: addDays(tomorrow, 2) });

    it('paiement en ligne coupé : aucun compte de versement exigé', async () => {
      const created = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(line);
      expect(created.status).toBe(201);
      expect((await confirm(created.body.id)).body).toEqual({ confirmed: 3 });
    });

    it('paiement en ligne activé : refusée sans compte validé, acceptée ensuite', async () => {
      process.env.LINE_PAYMENT_MODE = 'connect';
      // Préparer la ligne reste possible : seule la mise en vente est bloquée.
      const created = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(line);
      expect(created.status).toBe(201);

      const refused = await confirm(created.body.id);
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('PAYOUT_ACCOUNT_REQUIRED');
      expect(db.lineDeparture.rows.every((d: any) => d.status === 'to_confirm')).toBe(true);
      expect((await account()).body.required).toBe(true);

      const id = await open();
      expect((await confirm(created.body.id)).status).toBe(403); // dossier commencé seulement
      await webhook({ id: 'evt_6', type: 'account.updated', data: { object: stripe.completeOnboarding(id) } });
      expect((await confirm(created.body.id)).body).toEqual({ confirmed: 3 });
    });

    it('paiement en ligne activé : rouvrir un départ fermé exige aussi le compte', async () => {
      const created = await http().post('/api/v1/operators/me/lines').set('Authorization', djamel).send(line);
      await confirm(created.body.id);
      const departure = db.lineDeparture.rows[0];
      const set = (closed: boolean) => http().patch(`/api/v1/operators/me/departures/${departure.id}`).set('Authorization', djamel).send({ closed });
      expect((await set(true)).status).toBe(200);
      process.env.LINE_PAYMENT_MODE = 'connect';
      expect((await set(false)).body.code).toBe('PAYOUT_ACCOUNT_REQUIRED');
      // Fermer reste toujours possible.
      expect((await set(true)).status).toBe(200);
    });
  });

  it('pages de retour de Stripe : publiques, sans script, dans la langue du navigateur', async () => {
    const fr = await http().get('/versements/retour');
    expect(fr.status).toBe(200);
    expect(fr.text).toContain('Informations transmises à Stripe');
    expect(fr.text).not.toContain('<script');
    expect(fr.headers['cache-control']).toBe('no-store');
    const en = await http().get('/versements/reprise').set('Accept-Language', 'en-GB');
    expect(en.text).toContain('This link has expired');
  });
});
