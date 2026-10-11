import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { DocumentStorage } from './document-storage';
import { DriversModule } from './drivers.module';
import { FakeStorage, JPEG, PDF, fakePrisma, validApplication } from '../testing/drivers-fakes';

// Upload multipart réel (multer) + candidature, via HTTP et le guard JWT
// du Module 2. Base, Redis et stockage simulés.

const JWT_SECRET = 'drivers-secret';

describe('Drivers (intégration)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof fakePrisma>;
  let storage: FakeStorage;
  const jwt = new JwtService();
  const token = (sub = 'passenger-a', role = 'passenger') =>
    `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;

  const upload = (type: string, content: Buffer, filename = 'doc.jpg', auth = token()) =>
    request(app.getHttpServer())
      .post('/api/v1/drivers/me/documents')
      .set('Authorization', auth)
      .field('type', type)
      .attach('file', content, filename);

  beforeEach(async () => {
    prisma = fakePrisma();
    storage = new FakeStorage();

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: new FakeRedis() },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        DriversModule,
      ],
    })
      .overrideProvider(DocumentStorage)
      .useValue(storage)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('parcours complet : 5 documents puis candidature → en attente de validation', async () => {
    for (const type of ['vehicle_registration', 'vehicle_insurance', 'technical_control', 'driving_license', 'vtc_card']) {
      const res = await upload(type, type === 'vehicle_insurance' ? PDF : JPEG);
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('storageKey');
    }

    const apply = await request(app.getHttpServer())
      .post('/api/v1/drivers/apply')
      .set('Authorization', token())
      .send(validApplication());
    expect(apply.status).toBe(201);
    expect(apply.body).toMatchObject({ status: 'pending', missingDocuments: [] });

    const profile = await request(app.getHttpServer()).get('/api/v1/drivers/me/profile').set('Authorization', token());
    expect(profile.body.status).toBe('pending');
  });

  it('refuse un fichier déguisé (HTML nommé .pdf)', async () => {
    const res = await upload('driving_license', Buffer.from('<html>piège</html>'), 'permis.pdf');
    expect(res.status).toBe(400);
    expect(storage.files.size).toBe(0);
  });

  it('refuse un fichier de plus de 2 Mo (413)', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload('driving_license', big);
    expect(res.status).toBe(413);
    expect(storage.files.size).toBe(0);
  });

  it('refuse un type de document inconnu', async () => {
    expect((await upload('selfie', JPEG)).status).toBe(400);
  });

  it('refuse les champs que seul un admin peut décider', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers/apply')
      .set('Authorization', token())
      .send({ ...validApplication(), roseEligible: true, documentsVerified: true });
    expect(res.status).toBe(400);
  });

  it('valide les règles du véhicule : 7-8 places, format AB-123-CD, dashcam', async () => {
    const send = (vehicle: object) =>
      request(app.getHttpServer())
        .post('/api/v1/drivers/apply')
        .set('Authorization', token())
        .send({ ...validApplication(), vehicle: { ...validApplication().vehicle, ...vehicle } });

    expect((await send({ capacity: 5 })).status).toBe(400);
    expect((await send({ capacity: 12 })).status).toBe(400);
    expect((await send({ plate: '1234 AB 75' })).status).toBe(400);
    const noDashcam = await send({ dashcamInstalled: false });
    expect(noDashcam.status).toBe(400);
    expect(JSON.stringify(noDashcam.body.message)).toContain('dashcam');
  });

  it('exige le consentement RGPD explicite', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers/apply')
      .set('Authorization', token())
      .send({ ...validApplication(), consent: false });
    expect(res.status).toBe(400);
  });

  it('exige une authentification', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/drivers/me/documents')
      .field('type', 'vtc_card')
      .attach('file', JPEG, 'a.jpg');
    expect(res.status).toBe(401);
  });
});
