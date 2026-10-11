import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { isOriginAllowed } from './tracking/tracking.gateway';

async function bootstrap() {
  // rawBody : le webhook Stripe vérifie sa signature sur le corps BRUT de
  // la requête (req.rawBody), avant tout parsing JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Derrière Nginx (Partie 3), l'IP réelle du client arrive dans
  // X-Forwarded-For. Sans "trust proxy", toutes les requêtes auraient
  // l'IP de Nginx et partageraient le même compteur de rate limiting.
  // À n'activer QUE derrière un proxy de confiance : sinon un client
  // pourrait falsifier son IP via cet en-tête.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(helmet()); // Partie 8 : "Helmet.js"
  // Partie 8 : « CORS strict ». Liste blanche CORS_ORIGINS (portails web),
  // comme le WebSocket. Les apps mobiles n'envoient pas d'en-tête Origin :
  // elles passent ; la barrière reste le jeton d'accès.
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, isOriginAllowed(origin, origins)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-2FA-Token', 'X-Client', 'X-Locale'],
    // Cookies HttpOnly des portails (refresh token, preuve 2FA) : origines de la liste blanche seulement.
    credentials: true,
    maxAge: 600,
  });

  // Validation stricte globale (Partie 8 : "class-validator + zod").
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // rejette les champs non déclarés dans les DTOs
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`XLCAB API démarrée sur le port ${port}`);
}
bootstrap();
