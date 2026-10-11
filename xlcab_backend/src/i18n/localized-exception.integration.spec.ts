import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, HttpStatus, INestApplication,
  MiddlewareConsumer, Module, NestModule, Post, ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsEmail } from 'class-validator';
import * as request from 'supertest';
import { I18nModule } from './localized-exception.filter';

// Filtre global : réponse d'erreur dans la langue demandée par l'app (X-Locale).

class ProbeDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email!: string;
}

@Controller('api/v1/probe')
class ProbeController {
  @Get('distance')
  distance() {
    throw new BadRequestException('Distance minimale : 60 km');
  }

  @Get('2fa')
  twoFactor() {
    throw new ForbiddenException({ statusCode: HttpStatus.FORBIDDEN, code: 'TWO_FACTOR_REQUIRED', message: 'Double authentification requise' });
  }

  @Post('validate')
  validate(@Body() dto: ProbeDto) {
    return dto;
  }

  @Get('limited')
  limited() {
    return { ok: true }; // jamais atteint : le middleware répond 429 avant
  }

  @Get('crash')
  crash() {
    throw new Error('panne interne');
  }
}

/** Comme IpRateLimitMiddleware : une erreur levée AVANT le contrôleur. */
@Module({ controllers: [ProbeController] })
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: { originalUrl: string }, _res: unknown, next: (e?: unknown) => void) =>
        req.originalUrl.includes('limited')
          ? next(new HttpException({ statusCode: 429, code: 'RATE_LIMITED', message: 'Trop de requêtes — patientez une minute' }, 429))
          : next(),
      )
      .forRoutes('{*path}');
  }
}

describe('Messages d’erreur traduits (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [I18nModule, ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('sans en-tête (portails, outils) : français inchangé', async () => {
    const res = await http().get('/api/v1/probe/distance');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Distance minimale : 60 km');
  });

  it('X-Locale: en → anglais, même statut', async () => {
    const res = await http().get('/api/v1/probe/distance').set('X-Locale', 'en');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ statusCode: 400, message: 'Minimum distance: 60 km' });
  });

  it('code métier conservé (le client se fie au code, pas au texte)', async () => {
    const res = await http().get('/api/v1/probe/2fa').set('X-Locale', 'en');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ statusCode: 403, code: 'TWO_FACTOR_REQUIRED', message: 'Two-factor authentication required' });
  });

  it('erreurs de validation (ValidationPipe) traduites', async () => {
    const res = await http().post('/api/v1/probe/validate').set('X-Locale', 'en').send({ email: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(['Invalid email address']);
    const fr = await http().post('/api/v1/probe/validate').set('X-Locale', 'fr').send({ email: 'pas-un-email' });
    expect(fr.body.message).toEqual(['Adresse email invalide']);
  });

  it('erreur levée par un middleware (limitation de débit) : traduite aussi', async () => {
    const res = await http().get('/api/v1/probe/limited').set('X-Locale', 'en');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', message: 'Too many requests — please wait a minute' });
  });

  it('erreur inattendue : 500 générique, jamais de détail interne', async () => {
    const res = await http().get('/api/v1/probe/crash').set('X-Locale', 'en');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/panne interne/);
  });
});
