import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  NestMiddleware,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RedisService } from '../redis/redis.service';

// Partie 8 : « Rate limiting : 100 req/min/user, 1000 req/min/IP ».
// Fenêtre fixe d'une minute, compteurs Redis (partagés entre instances).
// Les limites propres à certaines routes (connexion, OTP, devis, envois…)
// s'ajoutent à celles-ci.
export const DEFAULT_USER_PER_MINUTE = 100;
export const DEFAULT_IP_PER_MINUTE = 1000;

const limit = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

async function count(redis: RedisService, key: string): Promise<number> {
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60);
  return n;
}

function tooMany(retryAfter: number): HttpException {
  return new HttpException(
    { statusCode: 429, code: 'RATE_LIMITED', message: 'Trop de requêtes — patientez une minute', retryAfter },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

const minuteKey = () => Math.floor(Date.now() / 60_000);
const secondsLeft = () => 60 - Math.floor((Date.now() % 60_000) / 1000);

/**
 * Par adresse IP, AVANT toute authentification (protège aussi des rafales
 * de requêtes non authentifiées). L'IP réelle derrière Nginx dépend de
 * TRUST_PROXY (main.ts). En cas de panne Redis, la requête passe : la
 * limitation ne doit pas rendre l'API indisponible.
 */
@Injectable()
export class IpRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RateLimit');

  constructor(private redis: RedisService) {}

  async use(req: any, res: any, next: (err?: unknown) => void) {
    try {
      const n = await count(this.redis, `rl:ip:${req.ip}:${minuteKey()}`);
      if (n > limit('RATE_LIMIT_IP_PER_MINUTE', DEFAULT_IP_PER_MINUTE)) {
        res.setHeader('Retry-After', String(secondsLeft()));
        return next(tooMany(secondsLeft()));
      }
    } catch (err) {
      this.logger.warn(`Limitation par IP indisponible : ${(err as Error).message}`);
    }
    next();
  }
}

/** Par utilisateur authentifié (après les guards : l'identité vient du jeton vérifié). */
@Injectable()
export class UserRateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RateLimit');

  constructor(private redis: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      const userId: unknown = req?.user?.sub;
      if (typeof userId === 'string') {
        let n = 0;
        try {
          n = await count(this.redis, `rl:user:${userId}:${minuteKey()}`);
        } catch (err) {
          this.logger.warn(`Limitation par utilisateur indisponible : ${(err as Error).message}`);
        }
        if (n > limit('RATE_LIMIT_USER_PER_MINUTE', DEFAULT_USER_PER_MINUTE)) {
          context.switchToHttp().getResponse().setHeader('Retry-After', String(secondsLeft()));
          throw tooMany(secondsLeft());
        }
      }
    }
    return next.handle();
  }
}
