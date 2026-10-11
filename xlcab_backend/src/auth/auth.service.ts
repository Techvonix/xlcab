import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';

const BCRYPT_COST = 12; // Partie 8 : "Bcrypt coût 12"

// Partie 8 : "Rate limiting : 5 login/15 min/IP"
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

// Partie 8 : "OTP SMS Twilio (5 min, max 3 tentatives)"
const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 3;

// Partie 8 (note de relecture) : limiter l'envoi d'OTP par numéro ET
// par IP contre la fraude au pompage de SMS. Les seuils ne sont pas
// chiffrés dans la spec : valeurs proposées, à ajuster si besoin.
const OTP_SEND_MAX_PER_PHONE = 3;
const OTP_SEND_PHONE_WINDOW_SECONDS = 15 * 60;
const OTP_SEND_MAX_PER_IP = 10;
const OTP_SEND_IP_WINDOW_SECONDS = 60 * 60;

const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// Seul rôle attribuable par l'inscription libre (Partie 8).
const SIGNUP_ROLE = 'passenger';

// Version en vigueur des CGU / politique de confidentialité, surchargeable
// par TERMS_VERSION. À changer à chaque nouvelle version des textes.
export const DEFAULT_TERMS_VERSION = '2026-10-01';

export interface SignupConsent {
  termsVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RefreshPayload {
  sub: string;
  role: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private redis: RedisService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  // ── Inscription ──────────────────────────────────────────────────────

  /**
   * Crée toujours un compte "passenger" : le rôle n'est plus un
   * paramètre (Partie 8 — note de relecture).
   *
   * Consentement (Partie 8, RGPD) : la version des CGU acceptée doit être
   * la version en vigueur. Elle est enregistrée sur le compte avec la
   * date, et l'IP / l'appareil dans le journal d'audit : c'est la preuve
   * du consentement en cas de contrôle.
   */
  async signup(email: string, password: string, consent: SignupConsent): Promise<TokenPair> {
    const currentTerms = this.config.get<string>('TERMS_VERSION') ?? DEFAULT_TERMS_VERSION;
    if (consent.termsVersion !== currentTerms) {
      throw new BadRequestException(
        'Les conditions générales ont été mises à jour : mettez l’application à jour pour les accepter',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: SIGNUP_ROLE,
        termsAcceptedAt: new Date(),
        termsVersion: currentTerms,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'user.consent',
      entity: 'User',
      entityId: user.id,
      metadata: { termsVersion: currentTerms },
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
    });

    return this.generateTokens(user.id, user.role);
  }

  // ── Connexion ─────────────────────────────────────────────────────────

  async login(email: string, password: string, ip: string): Promise<TokenPair> {
    // Partie 10 : le compteur email+IP est incrémenté AVANT la recherche
    // en base. Ainsi un email inexistant consomme aussi des tentatives :
    // le blocage ne révèle plus si un compte existe, et on ne peut plus
    // bombarder la base avec des emails au hasard sans être limité.
    const attemptsKey = `login:attempts:${email.toLowerCase()}:${ip}`;
    const attempts = await this.hit(attemptsKey, LOGIN_LOCKOUT_SECONDS);
    if (attempts > LOGIN_MAX_ATTEMPTS) {
      throw new HttpException(
        'Trop de tentatives — réessayez dans 15 minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Message générique volontaire : on ne révèle jamais si l'email
    // existe ou non (évite l'énumération de comptes).
    const genericError = 'Email ou mot de passe incorrect';
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedException(genericError);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(genericError);
    }

    await this.redis.del(attemptsKey);
    return this.generateTokens(user.id, user.role);
  }

  // ── OTP SMS ───────────────────────────────────────────────────────────

  async sendOtp(phone: string, ip: string): Promise<{ sent: true }> {
    // Partie 8 : limitation par numéro ET par IP (anti pompage de SMS).
    // On vérifie les deux compteurs avant de générer ou d'envoyer quoi
    // que ce soit.
    const perPhone = await this.hit(
      `otp:send:phone:${phone}`,
      OTP_SEND_PHONE_WINDOW_SECONDS,
    );
    const perIp = await this.hit(`otp:send:ip:${ip}`, OTP_SEND_IP_WINDOW_SECONDS);
    if (perPhone > OTP_SEND_MAX_PER_PHONE || perIp > OTP_SEND_MAX_PER_IP) {
      throw new HttpException(
        "Trop de demandes de code — réessayez plus tard",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // randomInt : générateur cryptographique ; borne haute exclusive,
    // donc 1 000 000 pour couvrir 100000 à 999999 inclus.
    const code = randomInt(100000, 1000000).toString();
    await this.redis.set(`otp:code:${phone}`, code, 'EX', OTP_TTL_SECONDS);
    await this.redis.del(`otp:attempts:${phone}`); // reset des tentatives

    // TODO(intégration Twilio) : envoyer le SMS via l'API Twilio ici.
    // this.twilioClient.messages.create({ to: phone, body: `Code XLCAB: ${code}` });

    return { sent: true };
  }

  async verifyOtp(phone: string, code: string): Promise<{ verified: true }> {
    const attemptsKey = `otp:attempts:${phone}`;
    const attempts = await this.hit(attemptsKey, OTP_TTL_SECONDS);

    if (attempts > OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Trop de tentatives — demandez un nouveau code');
    }

    const stored = await this.redis.get(`otp:code:${phone}`);
    if (!stored || stored !== code) {
      throw new UnauthorizedException('Code invalide ou expiré');
    }

    await this.redis.del(`otp:code:${phone}`);
    await this.redis.del(attemptsKey);

    await this.prisma.user.updateMany({
      where: { phone },
      data: { phoneVerified: true },
    });

    return { verified: true };
  }

  // ── Rafraîchissement / révocation de token ──────────────────────────

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
    if (!payload?.sub || !payload?.jti) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    // Partie 10 : une clé par session (refresh:{userId}:{jti}), ce qui
    // permet plusieurs appareils connectés en même temps. On vérifie que
    // ce token est bien le dernier émis pour CETTE session (rotation).
    const sessionKey = this.refreshKey(payload.sub, payload.jti);
    const stored = await this.redis.get(sessionKey);
    if (stored !== refreshToken) {
      throw new UnauthorizedException('Refresh token révoqué');
    }

    // Partie 10 : on revalide l'utilisateur en base au lieu de faire
    // confiance au contenu de l'ancien token. Un compte supprimé ne
    // peut plus rafraîchir, et un changement de rôle (ex. chauffeur
    // suspendu) est pris en compte immédiatement.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt) {
      await this.redis.del(sessionKey);
      throw new UnauthorizedException('Compte introuvable ou désactivé');
    }

    // Rotation : l'ancienne session est supprimée, une nouvelle est créée.
    await this.redis.del(sessionKey);
    return this.generateTokens(user.id, user.role);
  }

  /**
   * Déconnecte uniquement la session courante (l'appareil qui appelle),
   * les autres appareils de l'utilisateur restent connectés.
   */
  async logout(
    userId: string,
    jti: string,
    accessToken: string,
  ): Promise<{ loggedOut: true }> {
    await this.redis.del(this.refreshKey(userId, jti));
    // Blackliste l'access token jusqu'à son expiration naturelle (15 min max).
    await this.redis.set(`blacklist:${accessToken}`, '1', 'EX', ACCESS_TOKEN_TTL_SECONDS);
    return { loggedOut: true };
  }

  // ── Génération des tokens ────────────────────────────────────────────

  private async generateTokens(userId: string, role: string): Promise<TokenPair> {
    // Nouvel identifiant de session à chaque émission (login ou rotation).
    const jti = randomUUID();
    const payload = { sub: userId, role, jti };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_TTL,
    });

    await this.redis.set(
      this.refreshKey(userId, jti),
      refreshToken,
      'EX',
      REFRESH_TOKEN_TTL_SECONDS,
    );

    return { accessToken, refreshToken };
  }

  // ── Utilitaires ──────────────────────────────────────────────────────

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  /**
   * Incrémente un compteur Redis et pose son expiration au premier
   * passage (fenêtre glissante simple). Retourne la nouvelle valeur.
   */
  private async hit(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }
}
