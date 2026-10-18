import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { DriverModeModule } from '../driver-mode/driver-mode.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { mfaProof } from '../testing/two-factor-proof';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { DEFAULT_DASHCAM_CHARTER_VERSION, DashcamModule } from './dashcam';

// Caméra embarquée, niveau 2 (CHARTE_CAMERA_EMBARQUEE.md) : charte acceptée avant
// de passer en ligne ; après un incident, conservation de l'enregistrement demandée
// au chauffeur du trajet, qui confirme.

const JWT_SECRET = 'dashcam-secret';
const nextYear = new Date(Date.now() + 365 * 24 * 3600_000);
const TRIP = '7a1e0000-0000-4000-8000-000000000001';
const INCIDENT = '1c1d0000-0000-4000-8000-000000000001';

describe('Caméra embarquée (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const admin = { Authorization: as('ops', 'admin'), 'X-2FA-Token': mfaProof(JWT_SECRET, 'ops') };

  beforeEach(async () => {
    db = memoryPrisma();
    db.presumeDashcamCharter = false; // ici, la charte est justement ce qu'on vérifie
    for (const [id, firstName] of [['d1', 'Nadia'], ['d2', 'Karim']]) {
      db.user.rows.push({ id, email: `${id}@x.fr`, role: 'driver', jurisdiction: 'FR', deletedAt: null, firstName });
      db.driverProfile.rows.push({ id, approvedAt: new Date('2026-09-01'), documentsVerified: true, isOnline: false, licenseExpiry: nextYear, vtcCardExpiry: nextYear });
      db.vehicle.rows.push({ id: `v-${id}`, driverId: id, isAvailable: true, dashcamActive: true, insuranceExpiry: nextYear, technicalControlExpiry: nextYear });
    }
    db.user.rows.push({ id: 'ops', email: 'ops@xlcab.com', role: 'admin', deletedAt: null });
    db.trip.rows.push({
      id: TRIP, type: 'passenger', status: 'completed', passengerId: 'p1', driverId: 'd1', scheduledAt: new Date('2026-10-17T07:00:00Z'),
      originAddress: 'Gare de Lyon-Part-Dieu', destinationAddress: 'Gare de Limoges', jurisdiction: 'FR',
    });
    db.incident.rows.push({ id: INCIDENT, type: 'driver_report', tripId: TRIP, userId: 'p1', role: 'passenger', lat: 45.76, lng: 4.86, status: 'open', createdAt: new Date() });

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
        DriverModeModule,
        DashcamModule,
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

  it('sans la charte : pas de passage en ligne (403 motivé) ; une fois acceptée, en ligne', async () => {
    const refused = await http().post('/api/v1/drivers/me/online').set('Authorization', as('d1', 'driver')).send({ online: true });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'DASHCAM_CHARTER_REQUIRED' });

    const before = await http().get('/api/v1/drivers/me/dashcam-charter').set('Authorization', as('d1', 'driver'));
    expect(before.body).toEqual({ version: DEFAULT_DASHCAM_CHARTER_VERSION, accepted: false, acceptedAt: null });

    expect((await http().post('/api/v1/drivers/me/dashcam-charter').set('Authorization', as('d1', 'driver')).send({ version: '2020-01-01' })).status).toBe(400);
    const accepted = await http().post('/api/v1/drivers/me/dashcam-charter').set('Authorization', as('d1', 'driver')).send({ version: DEFAULT_DASHCAM_CHARTER_VERSION });
    expect(accepted.body).toMatchObject({ accepted: true, acceptedAt: expect.any(String) });
    expect(db.auditLog.rows.some((r: any) => r.action === 'dashcam.charter.accept')).toBe(true);

    const online = await http().post('/api/v1/drivers/me/online').set('Authorization', as('d1', 'driver')).send({ online: true });
    expect(online.status).toBe(200);
  });

  it('nouvelle version de la charte : à accepter de nouveau', async () => {
    await http().post('/api/v1/drivers/me/dashcam-charter').set('Authorization', as('d1', 'driver')).send({ version: DEFAULT_DASHCAM_CHARTER_VERSION });
    process.env.DASHCAM_CHARTER_VERSION = '2027-01-01';
    try {
      const res = await http().post('/api/v1/drivers/me/online').set('Authorization', as('d1', 'driver')).send({ online: true });
      expect(res.status).toBe(403);
    } finally {
      delete process.env.DASHCAM_CHARTER_VERSION;
    }
  });

  it('après un incident : l’équipe demande la conservation (2FA), le chauffeur du trajet la voit et confirme', async () => {
    expect((await http().post(`/api/v1/admin/incidents/${INCIDENT}/footage-request`).set('Authorization', as('ops', 'admin')).send({})).status).toBe(403);

    const res = await http().post(`/api/v1/admin/incidents/${INCIDENT}/footage-request`).set(admin).send({ reason: 'Signalement d’un passager' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ footageDriverId: 'd1', footageRequestedAt: expect.any(String), footageAcknowledgedAt: null });
    expect(db.notification.rows.some((n: any) => n.userId === 'd1' && n.type === 'dashcam.footage_request')).toBe(true);
    // Une seule demande par incident.
    await http().post(`/api/v1/admin/incidents/${INCIDENT}/footage-request`).set(admin).send({});
    expect(db.notification.rows.filter((n: any) => n.type === 'dashcam.footage_request')).toHaveLength(1);

    const mine = await http().get('/api/v1/drivers/me/footage-requests').set('Authorization', as('d1', 'driver'));
    expect(mine.body).toEqual([expect.objectContaining({ incidentId: INCIDENT, origin: 'Gare de Lyon-Part-Dieu', acknowledgedAt: null })]);
    expect(JSON.stringify(mine.body)).not.toContain('driver_report'); // jamais le motif du signalement

    // Un autre chauffeur ne voit ni ne confirme cette demande.
    expect((await http().get('/api/v1/drivers/me/footage-requests').set('Authorization', as('d2', 'driver'))).body).toEqual([]);
    expect((await http().post(`/api/v1/drivers/me/footage-requests/${INCIDENT}/acknowledge`).set('Authorization', as('d2', 'driver'))).status).toBe(404);

    const ack = await http().post(`/api/v1/drivers/me/footage-requests/${INCIDENT}/acknowledge`).set('Authorization', as('d1', 'driver'));
    expect(ack.body).toEqual({ incidentId: INCIDENT, acknowledged: true });
    expect(db.incident.rows[0].footageAcknowledgedAt).toBeInstanceOf(Date);
  });

  it('trajet sans chauffeur : rien à demander (409)', async () => {
    db.trip.rows[0].driverId = null;
    expect((await http().post(`/api/v1/admin/incidents/${INCIDENT}/footage-request`).set(admin).send({})).status).toBe(409);
  });
});
