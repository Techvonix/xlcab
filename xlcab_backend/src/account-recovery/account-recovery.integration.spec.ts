import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule, MailService } from '../mail/mail';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { AccountRecoveryModule, RESET_MAX_ATTEMPTS } from './account-recovery';

// Mot de passe oublié : code à 6 chiffres par e-mail, nouveau mot de passe, sessions fermées.

describe('Mot de passe oublié (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let redis: FakeRedis;
  let mail: MailService;
  const http = () => request(app.getHttpServer());
  const forgot = (email: string) => http().post('/api/v1/auth/password/forgot').send({ email });
  const reset = (body: Record<string, unknown>) => http().post('/api/v1/auth/password/reset').send(body);
  const codeOf = (i = mail.outbox.length - 1) => /(\d{6})/.exec(mail.outbox[i].subject)![1];

  beforeEach(async () => {
    db = memoryPrisma();
    redis = new FakeRedis();
    db.user.rows.push(
      { id: 'u1', email: 'lea@x.fr', role: 'passenger', locale: 'fr', passwordHash: await bcrypt.hash('ancien-mdp', 4), deletedAt: null },
      { id: 'u2', email: 'tom@x.fr', role: 'passenger', locale: 'en', passwordHash: await bcrypt.hash('ancien-mdp', 4), deletedAt: null },
      { id: 'u3', email: 'parti@x.fr', role: 'passenger', locale: 'fr', passwordHash: 'x', deletedAt: new Date() },
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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: 'reset-secret', JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuditModule,
        MailModule,
        AuthModule,
        AccountRecoveryModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    mail = app.get(MailService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('code envoyé par e-mail, nouveau mot de passe, toutes les sessions fermées, connexion avec le nouveau', async () => {
    await redis.set('refresh:u1:tel', '1');
    await redis.set('refresh:u1:tablette', '1');
    const res = await forgot('lea@x.fr');
    expect(res.status).toBe(202);
    expect(mail.outbox).toHaveLength(1);
    expect(mail.outbox[0]).toMatchObject({ to: 'lea@x.fr', subject: expect.stringMatching(/^XLCAB — votre code : \d{6}$/) });
    expect(mail.outbox[0].text).toContain('valable 15 minutes');
    // Le code n'est jamais gardé en clair.
    expect(await redis.get('pwreset:code:u1')).not.toContain(codeOf());

    const done = await reset({ email: 'lea@x.fr', code: codeOf(), password: 'nouveau-mdp' });
    expect(done.status).toBe(200);
    expect(await redis.get('refresh:u1:tel')).toBeNull();
    expect(await redis.get('refresh:u1:tablette')).toBeNull();
    expect(db.auditLog.rows.some((l: any) => l.action === 'user.password_reset' && l.userId === 'u1')).toBe(true);

    expect((await http().post('/api/v1/auth/login').send({ email: 'lea@x.fr', password: 'ancien-mdp' })).status).toBe(401);
    expect((await http().post('/api/v1/auth/login').send({ email: 'lea@x.fr', password: 'nouveau-mdp' })).status).toBe(200);
    // Code à usage unique.
    expect((await reset({ email: 'lea@x.fr', code: codeOf(), password: 'encore-autre' })).status).toBe(400);
  });

  it('même réponse que le compte existe ou non ; aucun e-mail pour un compte inconnu ou supprimé', async () => {
    const known = await forgot('lea@x.fr');
    const unknown = await forgot('personne@x.fr');
    const deleted = await forgot('parti@x.fr');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(deleted.body).toEqual(known.body);
    expect(mail.outbox.map((m) => m.to)).toEqual(['lea@x.fr']);
  });

  it('e-mail dans la langue du compte', async () => {
    await forgot('tom@x.fr');
    expect(mail.outbox[0].subject).toMatch(/^XLCAB — your code: \d{6}$/);
    expect(mail.outbox[0].text).toContain('valid for 15 minutes');
  });

  it(`mauvais code : refusé ; au ${RESET_MAX_ATTEMPTS}e essai, le code est détruit`, async () => {
    await forgot('lea@x.fr');
    const good = codeOf();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 1; i < RESET_MAX_ATTEMPTS; i++) {
      expect((await reset({ email: 'lea@x.fr', code: bad, password: 'nouveau-mdp' })).status).toBe(400);
    }
    expect((await reset({ email: 'lea@x.fr', code: bad, password: 'nouveau-mdp' })).status).toBe(429);
    // Même le bon code ne passe plus : il faut en redemander un.
    expect((await reset({ email: 'lea@x.fr', code: good, password: 'nouveau-mdp' })).status).toBe(400);
  });

  it('un nouveau code remplace le précédent', async () => {
    await forgot('lea@x.fr');
    const first = codeOf(0);
    await forgot('lea@x.fr');
    const second = codeOf(1);
    if (first !== second) expect((await reset({ email: 'lea@x.fr', code: first, password: 'nouveau-mdp' })).status).toBe(400);
    expect((await reset({ email: 'lea@x.fr', code: second, password: 'nouveau-mdp' })).status).toBe(200);
  });

  it('règles : code à 6 chiffres, mot de passe de 8 caractères au moins ; 3 demandes par heure et par adresse', async () => {
    await forgot('lea@x.fr');
    expect((await reset({ email: 'lea@x.fr', code: '12ab56', password: 'nouveau-mdp' })).status).toBe(400);
    expect((await reset({ email: 'lea@x.fr', code: codeOf(), password: 'court' })).status).toBe(400);
    await forgot('lea@x.fr');
    await forgot('lea@x.fr');
    expect((await forgot('LEA@x.fr')).status).toBe(429);
  });
});
