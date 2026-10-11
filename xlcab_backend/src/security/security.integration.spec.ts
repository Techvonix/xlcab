import { Controller, Get, Global, INestApplication, Module, Req, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { validateEnv } from './env.validation';
import { SecurityModule } from './security.module';

// Protections transverses (Partie 8) : limitation de débit par IP et par
// utilisateur, vérification de la configuration au démarrage.

const JWT_SECRET = 'security-secret';

@Controller('api/v1/test')
class ProbeController {
  @Get('public')
  open() {
    return { ok: true };
  }

  @Get('private')
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: any) {
    return { user: req.user.sub };
  }
}

describe('Sécurité transverse', () => {
  let app: INestApplication;
  let redis: FakeRedis;
  const jwt = new JwtService();
  const as = (sub: string) => `Bearer ${jwt.sign({ sub, role: 'passenger', jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    process.env.RATE_LIMIT_USER_PER_MINUTE = '5';
    process.env.RATE_LIMIT_IP_PER_MINUTE = '8';
    redis = new FakeRedis();

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: redis },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        SecurityModule,
      ],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    delete process.env.RATE_LIMIT_USER_PER_MINUTE;
    delete process.env.RATE_LIMIT_IP_PER_MINUTE;
    await app.close();
  });

  it('par utilisateur : au-delà de la limite, 429 avec Retry-After ; un autre utilisateur n’est pas touché', async () => {
    for (let i = 0; i < 5; i++) expect((await http().get('/api/v1/test/private').set('Authorization', as('u1'))).status).toBe(200);
    const blocked = await http().get('/api/v1/test/private').set('Authorization', as('u1'));
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await http().get('/api/v1/test/private').set('Authorization', as('u2'))).status).toBe(200);
  });

  it('par IP : y compris les requêtes non authentifiées, avant tout traitement', async () => {
    for (let i = 0; i < 8; i++) await http().get('/api/v1/test/public');
    const blocked = await http().get('/api/v1/test/public');
    expect(blocked.status).toBe(429);
    // Jeton invalide : refusé par la limite IP avant même la vérification du jeton.
    expect((await http().get('/api/v1/test/private').set('Authorization', 'Bearer faux')).status).toBe(429);
  });

  it('Redis indisponible : l’API reste accessible (la limitation ne bloque pas tout)', async () => {
    redis.incr = async () => {
      throw new Error('Redis hors service');
    };
    expect((await http().get('/api/v1/test/public')).status).toBe(200);
  });
});

describe('validateEnv (configuration au démarrage)', () => {
  const strong = (c: string) => c.repeat(40);
  const base = {
    JWT_SECRET: strong('a'),
    JWT_REFRESH_SECRET: strong('b'),
    DATABASE_URL: 'postgresql://x@db:5432/xlcab',
  };
  const prod = {
    ...base,
    NODE_ENV: 'production',
    TWO_FACTOR_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    CORS_ORIGINS: 'https://entreprise.xlcab.com,https://admin.xlcab.com',
    PUBLIC_API_URL: 'https://api.xlcab.com',
    REDIS_PASSWORD: 'r3d1s-long',
  };

  it('production complète : acceptée', () => {
    expect(() => validateEnv(prod)).not.toThrow();
  });

  it.each([
    ['secret d’exemple', { JWT_SECRET: 'change_me_access_secret_change_me_access' }, 'valeur d\'exemple'],
    ['secret trop court', { JWT_SECRET: 'court' }, 'au moins 32'],
    ['secrets identiques', { JWT_REFRESH_SECRET: strong('a') }, 'différents'],
    ['CORS en http', { CORS_ORIGINS: 'http://admin.xlcab.com' }, 'https uniquement'],
    ['CORS absent', { CORS_ORIGINS: '' }, 'CORS_ORIGINS'],
    ['clé 2FA absente', { TWO_FACTOR_ENC_KEY: '' }, 'TWO_FACTOR_ENC_KEY'],
    ['Redis sans mot de passe', { REDIS_PASSWORD: '' }, 'REDIS_PASSWORD'],
    ['Stripe sans secret de webhook', { STRIPE_SECRET_KEY: 'sk_live_x' }, 'STRIPE_WEBHOOK_SECRET'],
  ])('production refusée : %s', (_label, over, message) => {
    expect(() => validateEnv({ ...prod, ...over })).toThrow(message);
  });

  it('hors production : simple avertissement, démarrage possible', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => validateEnv({ ...base, JWT_SECRET: 'court' })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
