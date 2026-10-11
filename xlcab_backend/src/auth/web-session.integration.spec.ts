import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { AuthModule } from './auth.module';
import { DEFAULT_TERMS_VERSION } from './auth.service';

// Portails web : refresh token en cookie HttpOnly (Partie 8, anti-XSS).
// L'app mobile garde le contrat d'origine (jetons dans le corps).

describe('Session web par cookie HttpOnly (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: memoryPrisma() },
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

  const account = { email: 'web@x.fr', password: 'motdepasse', acceptTerms: true, termsVersion: DEFAULT_TERMS_VERSION };
  const cookies = (res: request.Response): string[] => {
    const raw = res.headers['set-cookie'] as unknown;
    return Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  };
  const refreshCookie = (res: request.Response) => cookies(res).find((c) => c.startsWith('xlcab_refresh='));

  it('web : le refresh token part en cookie HttpOnly SameSite=Strict, jamais dans le corps', async () => {
    await http().post('/api/v1/auth/signup').send(account);
    const res = await http().post('/api/v1/auth/login').set('X-Client', 'web').send({ email: account.email, password: account.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('web : rotation par le cookie (corps vide) ; l’ancien cookie est ensuite refusé', async () => {
    const login = await http().post('/api/v1/auth/signup').set('X-Client', 'web').send(account);
    const first = refreshCookie(login)!.split(';')[0];

    const rotated = await http().post('/api/v1/auth/refresh').set('X-Client', 'web').set('Cookie', first).send({});
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).toBeUndefined();
    const second = refreshCookie(rotated)!.split(';')[0];
    expect(second).not.toBe(first);

    const replay = await http().post('/api/v1/auth/refresh').set('X-Client', 'web').set('Cookie', first).send({});
    expect(replay.status).toBe(401);
  });

  it('sans cookie ni corps : 401 ; le cookie est ignoré sans l’en-tête X-Client (pas de session implicite)', async () => {
    const login = await http().post('/api/v1/auth/signup').set('X-Client', 'web').send(account);
    const cookie = refreshCookie(login)!.split(';')[0];

    expect((await http().post('/api/v1/auth/refresh').set('X-Client', 'web').send({})).status).toBe(401);
    expect((await http().post('/api/v1/auth/refresh').set('Cookie', cookie).send({})).status).toBe(401);
  });

  it('mobile : contrat inchangé (jetons dans le corps, aucun cookie)', async () => {
    const res = await http().post('/api/v1/auth/signup').send(account);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(cookies(res)).toHaveLength(0);

    const rotated = await http().post('/api/v1/auth/refresh').send({ refreshToken: res.body.refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
  });

  it('déconnexion web : les cookies de session (refresh, preuve 2FA) sont effacés', async () => {
    const login = await http().post('/api/v1/auth/signup').set('X-Client', 'web').send(account);
    const res = await http().post('/api/v1/auth/logout').set('X-Client', 'web').set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBeLessThan(300);
    const cleared = cookies(res);
    expect(cleared.find((c) => c.startsWith('xlcab_refresh='))).toMatch(/Max-Age=0/);
    expect(cleared.find((c) => c.startsWith('xlcab_2fa='))).toMatch(/Max-Age=0/);
  });

  it('un jeton signé avec un autre algorithme (HS512) est refusé, même avec le bon secret', async () => {
    const login = await http().post('/api/v1/auth/signup').send(account);
    const { sub, role, jti } = new JwtService().decode(login.body.accessToken) as any;
    const forged = new JwtService().sign({ sub, role, jti }, { secret: 's', algorithm: 'HS512' });

    const res = await http().post('/api/v1/auth/logout').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});
