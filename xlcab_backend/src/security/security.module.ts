import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IpRateLimitMiddleware, UserRateLimitInterceptor } from './rate-limit';

/**
 * Protections transverses de l'API (Partie 8), enregistrées une seule fois
 * dans AppModule : limitation de débit par IP (middleware, avant
 * l'authentification) et par utilisateur (intercepteur, après).
 */
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: UserRateLimitInterceptor }],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IpRateLimitMiddleware).forRoutes('{*path}'); // Express 5 : joker nommé (inclut la racine)
  }
}
