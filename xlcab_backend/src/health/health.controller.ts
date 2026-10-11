import { Controller, Get, HttpException, HttpStatus, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Sonde de disponibilité (Partie 6 : GET /health), pour Nginx, l'hébergeur et
 * la supervision. Publique : ne renvoie que l'état, jamais de détail interne
 * (version, message d'erreur, adresse des services).
 */
@Controller('api/v1/health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [database, cache] = await Promise.all([
      this.probe('base', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
    ]);
    const body = { status: database && cache ? 'ok' : 'degraded', database: database ? 'ok' : 'down', redis: cache ? 'ok' : 'down' };
    // 503 : le répartiteur de charge retire l'instance tant qu'un service manque.
    if (body.status !== 'ok') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  private async probe(name: string, fn: () => Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([fn(), new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('délai dépassé')), 2000)))]);
      return true;
    } catch (err) {
      this.logger.warn(`Sonde ${name} en échec : ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
