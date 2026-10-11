import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PricingService } from '../matching/pricing.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { base32Decode, hotp, timeStep } from '../two-factor/totp';
import { AdminModule } from './admin.module';

// Tarifs réglables depuis le dashboard admin : HTTP réel, guards JWT +
// rôle + 2FA, puis effet sur les devis (PricingService).

const JWT_SECRET = 'tariffs-secret';
const HOUR = 3600_000;

describe('Tarifs réglables (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let proof: string;
  const jwt = new JwtService();
  const bearer = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const admin = () => ({ Authorization: bearer('ops', 'admin'), 'X-2FA-Token': proof });

  /** Tarif du formulaire : grille par défaut + modifications. */
  const tariff = (over: Record<string, unknown> = {}) => ({
    jurisdiction: 'FR',
    ratesPerKm: { rose: 125, bleue: 95, orange: 155, accessibility: 105 },
    childSeatCents: 500,
    wifiCents: 300,
    extraLuggageCents: 500,
    parcelFeeCents: 800,
    sharedParcelCents: 900,
    reason: 'Hausse du gazole (+6 %)',
    ...over,
  });
  const publish = (body: object) => http().post('/api/v1/admin/tariffs').set(admin()).send(body);
  const pricing = () => app.get(PricingService);

  beforeEach(async () => {
    db = memoryPrisma();
    db.user.rows.push({ id: 'ops', email: 'ops@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null, createdAt: new Date() });

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
        AdminModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // Double authentification de l'admin (preuve exigée par TwoFactorGuard).
    const setup = await http().post('/api/v1/auth/2fa/setup').set('Authorization', bearer('ops', 'admin'));
    const code = hotp(base32Decode(setup.body.secret), timeStep(Math.floor(Date.now() / 1000)));
    const enable = await http().post('/api/v1/auth/2fa/enable').set('Authorization', bearer('ops', 'admin')).send({ code });
    proof = enable.body.twoFactorToken;
  });

  afterEach(() => app.close());

  it('sans tarif saisi : la grille par défaut de la spécification s’applique', async () => {
    const res = await http().get('/api/v1/admin/tariffs').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ id: null, ratesPerKm: { bleue: 90 }, sharedParcelCents: 800 });
    const quote = await pricing().estimate({ distanceKm: 100, shuttleType: 'bleue', type: 'passenger', jurisdiction: 'FR' });
    expect(quote.priceCents).toBe(9000);
  });

  it('nouveau tarif : appliqué immédiatement aux devis, tracé dans l’audit', async () => {
    // Le devis précédent est en cache : la publication doit le vider.
    await pricing().estimate({ distanceKm: 100, shuttleType: 'bleue', type: 'passenger', jurisdiction: 'FR' });

    const res = await publish(tariff());
    expect(res.status).toBe(201);

    const passenger = await pricing().estimate({ distanceKm: 100, shuttleType: 'bleue', type: 'passenger', jurisdiction: 'FR' });
    expect(passenger.priceCents).toBe(9500);
    const shared = await pricing().graftedParcel('FR');
    expect(shared).toMatchObject({ priceCents: 900, vatCents: 180, totalCents: 1080 });

    const log = db.auditLog.rows.find((l: any) => l.action === 'tariff.create');
    expect(log.metadata).toMatchObject({ reason: 'Hausse du gazole (+6 %)', before: { ratesPerKm: { bleue: 90 } }, after: { ratesPerKm: { bleue: 95 } } });
  });

  it('tarif programmé : pas appliqué avant sa date, annulable tant qu’il n’est pas en vigueur', async () => {
    const res = await publish(tariff({ effectiveFrom: new Date(Date.now() + 48 * HOUR).toISOString() }));
    expect(res.status).toBe(201);

    const now = await pricing().estimate({ distanceKm: 100, shuttleType: 'bleue', type: 'passenger', jurisdiction: 'FR' });
    expect(now.priceCents).toBe(9000);
    const overview = await http().get('/api/v1/admin/tariffs').set(admin());
    expect(overview.body.scheduled).toHaveLength(1);

    const cancel = await http().delete(`/api/v1/admin/tariffs/${res.body.id}`).set(admin());
    expect(cancel.status).toBe(200);
    expect(db.tariff.rows).toHaveLength(0);
  });

  it('un tarif en vigueur ne s’annule pas : on en publie un nouveau (historique conservé)', async () => {
    const res = await publish(tariff());
    expect((await http().delete(`/api/v1/admin/tariffs/${res.body.id}`).set(admin())).status).toBe(409);
    await publish(tariff({ ratesPerKm: { rose: 120, bleue: 90, orange: 150, accessibility: 100 }, reason: 'Retour au tarif initial' }));
    const overview = await http().get('/api/v1/admin/tariffs').set(admin());
    expect(overview.body.history).toHaveLength(2);
    expect(overview.body.current.reason).toBe('Retour au tarif initial');
  });

  it('variation de plus de 30 % : confirmation explicite exigée (faute de frappe)', async () => {
    const typo = tariff({ ratesPerKm: { rose: 120, bleue: 900, orange: 150, accessibility: 100 } });
    const refused = await publish(typo);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('tarif km bleue');
    expect((await publish({ ...typo, confirmLargeChange: true })).status).toBe(201);
  });

  it('validation : bornes, motif obligatoire, pas de date passée', async () => {
    expect((await publish(tariff({ ratesPerKm: { rose: 120, bleue: 0, orange: 150, accessibility: 100 } }))).status).toBe(400);
    expect((await publish(tariff({ reason: '' }))).status).toBe(400);
    expect((await publish(tariff({ effectiveFrom: new Date(Date.now() - 24 * HOUR).toISOString() }))).body.message).toContain('passé');
    expect((await publish(tariff({ jurisdiction: 'ZZ' }))).status).toBe(404);
  });

  it('réservé aux admins avec double authentification', async () => {
    const noProof = await http().post('/api/v1/admin/tariffs').set('Authorization', bearer('ops', 'admin')).send(tariff());
    expect(noProof.status).toBe(403);
    const corporate = await http().get('/api/v1/admin/tariffs').set({ Authorization: bearer('boss', 'corporate_admin'), 'X-2FA-Token': proof });
    expect(corporate.status).toBe(403);
  });
});
