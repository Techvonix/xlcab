import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { ComplianceModule } from './compliance.module';
import { ComplianceService } from './compliance.service';

// Contrôles automatiques quotidiens (Partie 8) : documents chauffeur,
// géolocalisation 30 jours, comptes inactifs depuis 3 ans ; et
// enregistrement de la dernière activité sur les routes authentifiées.

const JWT_SECRET = 'compliance-secret';
const DAY = 24 * 3600_000;
const NOW = new Date('2026-10-05T03:00:00Z');
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY);

describe('Conformité (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let stripe: FakeStripe;
  const jwt = new JwtService();
  const compliance = () => app.get(ComplianceService);
  const notes = (userId: string, type: string) => db.notification.rows.filter((n: any) => n.userId === userId && n.type === type);

  function seedDriver(id: string, over: { profile?: object; vehicle?: object } = {}) {
    db.user.rows.push({ id, email: `${id}@x.fr`, role: 'driver', jurisdiction: 'FR', deletedAt: null, createdAt: daysFromNow(-100) });
    db.driverProfile.rows.push({ id, approvedAt: daysFromNow(-90), isOnline: true, licenseExpiry: daysFromNow(400), vtcCardExpiry: daysFromNow(400), ...over.profile });
    db.vehicle.rows.push({ id: `v-${id}`, driverId: id, plate: 'AB-123-CD', isAvailable: true, insuranceExpiry: daysFromNow(400), technicalControlExpiry: daysFromNow(400), ...over.vehicle });
  }

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    stripe = new FakeStripe();

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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        ComplianceModule,
      ],
    })
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .overrideProvider(TrackingGateway).useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  describe('documents chauffeur', () => {
    it('rappels à J−30 puis J−7, une seule fois par seuil', async () => {
      seedDriver('d1', { vehicle: { insuranceExpiry: daysFromNow(25) } });

      await compliance().checkDriverDocuments(NOW);
      await compliance().checkDriverDocuments(new Date(NOW.getTime() + 3600_000)); // relance le même jour : rien
      expect(notes('d1', 'driver.document_expiring')).toHaveLength(1);
      expect(notes('d1', 'driver.document_expiring')[0].body).toContain('assurance du véhicule AB-123-CD expire dans 25 jours');

      await compliance().checkDriverDocuments(daysFromNow(19)); // J−6
      expect(notes('d1', 'driver.document_expiring')).toHaveLength(2);
    });

    it('document expiré : chauffeur mis hors ligne, retiré du géo-index, prévenu', async () => {
      seedDriver('d1', { profile: { vtcCardExpiry: daysFromNow(-1) } });
      redis.store.set('driver:seen:d1', '1');

      const res = await compliance().checkDriverDocuments(NOW);

      expect(res.suspended).toBe(1);
      expect(db.driverProfile.rows[0].isOnline).toBe(false);
      expect(redis.store.has('driver:seen:d1')).toBe(false);
      expect(notes('d1', 'driver.document_expired')[0].body).toContain('carte VTC a expiré');
    });

    it('documents à jour : rien', async () => {
      seedDriver('d1');
      expect(await compliance().checkDriverDocuments(NOW)).toEqual({ reminders: 0, suspended: 0 });
    });
  });

  it('géolocalisation : points de plus de 30 jours supprimés', async () => {
    db.trackingPoint.rows.push(
      { id: 'old', tripId: 't', driverId: 'd', lat: 0, lng: 0, recordedAt: daysFromNow(-31) },
      { id: 'recent', tripId: 't', driverId: 'd', lat: 0, lng: 0, recordedAt: daysFromNow(-5) },
    );
    expect(await compliance().purgeTrackingPoints(NOW)).toBe(1);
    expect(db.trackingPoint.rows.map((p: any) => p.id)).toEqual(['recent']);
  });

  describe('comptes inactifs (3 ans)', () => {
    const user = (id: string, lastSeen: Date | null, extra: object = {}) => {
      db.user.rows.push({ id, email: `${id}@x.fr`, role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Nom', createdAt: new Date('2022-01-01'), stripeCustomerId: null, ...extra });
      if (lastSeen) db.userActivity.rows.push({ userId: id, lastSeenAt: lastSeen });
    };

    it('inactif depuis plus de 3 ans : anonymisé ; actif : conservé', async () => {
      user('ancien', new Date('2023-09-01'));
      user('actif', daysFromNow(-10));
      const res = await compliance().handleInactiveAccounts(NOW);
      expect(res.accountsAnonymized).toBe(1);
      expect(db.user.rows.find((u: any) => u.id === 'ancien')).toMatchObject({ email: 'supprime-ancien@anonyme.invalid', firstName: null, deletedAt: expect.any(Date) });
      expect(db.user.rows.find((u: any) => u.id === 'actif').deletedAt).toBeNull();
      expect(db.auditLog.rows.some((l: any) => l.action === 'user.retention_anonymized')).toBe(true);
    });

    it('à moins de 30 jours de l’échéance : rappel (une seule fois), pas d’anonymisation', async () => {
      user('bientot', new Date('2023-10-20'));
      await compliance().handleInactiveAccounts(NOW);
      await compliance().handleInactiveAccounts(NOW);
      expect(notes('bientot', 'account.inactivity_notice')).toHaveLength(1);
      expect(db.user.rows[0].deletedAt).toBeNull();
    });

    it('une course récente compte comme activité ; une course à venir bloque la purge', async () => {
      user('voyageur', new Date('2022-06-01'));
      db.trip.rows.push({ id: 't1', passengerId: 'voyageur', status: 'completed', createdAt: daysFromNow(-60) });
      user('reserve', new Date('2022-06-01'));
      db.trip.rows.push({ id: 't2', passengerId: 'reserve', status: 'accepted', createdAt: new Date('2022-06-01') });

      expect((await compliance().handleInactiveAccounts(NOW)).accountsAnonymized).toBe(0);
    });

    it('comptes entreprise et équipe XLCAB : jamais purgés automatiquement', async () => {
      user('boss', new Date('2021-01-01'), { role: 'corporate_admin' });
      user('ops', new Date('2021-01-01'), { role: 'admin' });
      expect((await compliance().handleInactiveAccounts(NOW)).accountsAnonymized).toBe(0);
    });
  });

  it('passe quotidienne : rapport complet tracé dans l’audit', async () => {
    seedDriver('d1', { profile: { licenseExpiry: daysFromNow(-1) } });
    const report = await compliance().runDaily(NOW);
    expect(report).toMatchObject({ driversSuspended: 1, trackingPointsPurged: 0, accountsAnonymized: 0 });
    expect(db.auditLog.rows.some((l: any) => l.action === 'compliance.daily')).toBe(true);
  });

  it('dernière activité enregistrée à chaque requête authentifiée (au plus une fois par jour)', async () => {
    db.user.rows.push({ id: 'p1', email: 'p1@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, createdAt: new Date() });
    const auth = `Bearer ${jwt.sign({ sub: 'p1', role: 'passenger', jti: 'j1' }, { secret: JWT_SECRET })}`;
    await request(app.getHttpServer()).get('/api/v1/users/me').set('Authorization', auth);
    await new Promise((r) => setImmediate(r));
    expect(db.userActivity.rows).toEqual([expect.objectContaining({ userId: 'p1', lastSeenAt: expect.any(Date) })]);

    const first = db.userActivity.rows[0].lastSeenAt;
    await request(app.getHttpServer()).get('/api/v1/users/me').set('Authorization', auth);
    await new Promise((r) => setImmediate(r));
    expect(db.userActivity.rows[0].lastSeenAt).toBe(first);
  });
});
