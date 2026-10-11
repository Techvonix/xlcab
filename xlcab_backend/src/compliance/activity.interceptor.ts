import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const ONCE_PER_DAY_SECONDS = 24 * 3600;

/**
 * Enregistre la dernière activité de l'utilisateur authentifié (base de la
 * purge RGPD des comptes inactifs depuis 3 ans). Au plus une écriture par
 * jour et par utilisateur (verrou Redis) ; ne bloque jamais la requête.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const userId: unknown = context.switchToHttp().getRequest()?.user?.sub;
      if (typeof userId === 'string' && userId !== 'system') void this.touch(userId);
    }
    return next.handle();
  }

  private async touch(userId: string) {
    try {
      const fresh = await this.redis.set(`activity:${userId}`, '1', 'EX', ONCE_PER_DAY_SECONDS, 'NX');
      if (fresh !== 'OK') return;
      const now = new Date();
      await this.prisma.userActivity.upsert({
        where: { userId },
        create: { userId, lastSeenAt: now },
        update: { lastSeenAt: now },
      });
    } catch (err) {
      this.logger.warn(`Activité non enregistrée : ${(err as Error).message}`);
    }
  }
}
