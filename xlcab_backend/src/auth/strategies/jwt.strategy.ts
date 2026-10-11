import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../../redis/redis.service';

export interface JwtPayload {
  sub: string; // userId
  role: string;
  jti: string; // identifiant de session (un par appareil connecté)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      // Seul l'algorithme utilisé pour signer est accepté (pas de confusion d'algorithme).
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  /**
   * Appelé automatiquement par Passport après vérification de la
   * signature JWT. On vérifie en plus que le token n'a pas été
   * explicitement révoqué (blacklist Redis, Partie 8 — sécurité).
   */
  async validate(req: any, payload: JwtPayload): Promise<JwtPayload> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const isBlacklisted = await this.redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token révoqué');
    }
    return payload; // injecté dans request.user
  }
}
