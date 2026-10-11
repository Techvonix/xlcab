import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { AuthModule } from './auth.module';
import { DEFAULT_TERMS_VERSION } from './auth.service';

// Inscription de bout en bout (Partie 8 : consentement explicite).

describe('POST /api/v1/auth/signup — consentement (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;

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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: 's', JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  const signup = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/auth/signup').set('User-Agent', 'XLCAB/1.0 (iOS)').send(body);

  it('sans case cochée : refusé, aucun compte créé', async () => {
    const res = await signup({ email: 'a@x.fr', password: 'motdepasse', termsVersion: DEFAULT_TERMS_VERSION });
    expect(res.status).toBe(400);
    const res2 = await signup({ email: 'a@x.fr', password: 'motdepasse', acceptTerms: false, termsVersion: DEFAULT_TERMS_VERSION });
    expect(res2.status).toBe(400);
    expect(db.user.rows).toHaveLength(0);
  });

  it('avec consentement : compte créé, preuve enregistrée (version, date, IP, appareil)', async () => {
    const res = await signup({ email: 'a@x.fr', password: 'motdepasse', acceptTerms: true, termsVersion: DEFAULT_TERMS_VERSION });

    expect(res.status).toBe(201);
    expect(db.user.rows[0]).toMatchObject({ email: 'a@x.fr', role: 'passenger', termsVersion: DEFAULT_TERMS_VERSION, termsAcceptedAt: expect.any(Date) });
    expect(db.auditLog.rows[0]).toMatchObject({
      action: 'user.consent',
      userId: db.user.rows[0].id,
      userAgent: 'XLCAB/1.0 (iOS)',
      ipAddress: expect.any(String),
    });
  });

  it('un rôle envoyé par le client reste refusé (Module 2)', async () => {
    const res = await signup({ email: 'a@x.fr', password: 'motdepasse', acceptTerms: true, termsVersion: DEFAULT_TERMS_VERSION, role: 'admin' });
    expect(res.status).toBe(400);
  });
});
