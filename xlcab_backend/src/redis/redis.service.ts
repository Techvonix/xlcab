import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Wrapper injectable autour d'ioredis. Utilisé pour :
 * - le compteur de tentatives de login (rate limiting)
 * - le stockage des codes OTP (expiration 5 min)
 * - la blacklist des refresh tokens révoqués
 * - le géo-index des chauffeurs en ligne (GEO commands)
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD'),
    });
  }

  async onModuleDestroy() {
    this.disconnect();
  }
}
