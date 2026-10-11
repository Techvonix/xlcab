import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  TOTP_STEP_SECONDS,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateSecret,
  otpauthUrl,
  verifyTotp,
} from './totp';

// Partie 8 : "2FA obligatoire pour admin + corporate_admin".
export const TWO_FACTOR_ROLES = ['admin', 'corporate_admin'];

// Contre le forçage des 1 000 000 codes possibles.
const MAX_ATTEMPTS = 5;
const ATTEMPTS_WINDOW_SECONDS = 15 * 60;

// Durée de la preuve 2FA : une journée de travail. Indépendante du jeton
// d'accès (15 min), qui tourne à chaque refresh.
const PROOF_TTL = '12h';
const PROOF_TTL_SECONDS = 12 * 3600;

export interface RequestUser {
  sub: string;
  role: string;
}

export interface AuditCtx {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Double authentification par TOTP, en complément du Module 2 (non
 * modifié). Après vérification du code, le client reçoit une "preuve 2FA"
 * (JWT dédié, 12 h) à présenter dans l'en-tête X-2FA-Token.
 *
 * La preuve est signée avec une clé DÉRIVÉE, distincte de JWT_SECRET :
 * elle ne peut donc jamais servir de jeton d'accès.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async status(user: RequestUser) {
    const record = await this.prisma.twoFactorAuth.findUnique({ where: { userId: user.sub } });
    return { enabled: Boolean(record?.enabledAt), required: TWO_FACTOR_ROLES.includes(user.role) };
  }

  /**
   * Première étape de l'activation : secret à scanner. Tant que le code
   * n'est pas confirmé (enable), on peut recommencer. Une fois activée,
   * la 2FA ne peut être réinitialisée que par un autre admin (hors
   * libre-service : un mot de passe volé ne suffit pas à la remplacer).
   */
  async setup(user: RequestUser, ctx: AuditCtx) {
    const existing = await this.prisma.twoFactorAuth.findUnique({ where: { userId: user.sub } });
    if (existing?.enabledAt) throw new ConflictException('La double authentification est déjà activée');

    const account = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { email: true } });
    if (!account) throw new UnauthorizedException('Compte introuvable');

    const secret = generateSecret();
    const secretEnc = encryptSecret(secret, this.encryptionKey());
    await this.prisma.twoFactorAuth.upsert({
      where: { userId: user.sub },
      create: { userId: user.sub, secretEnc },
      update: { secretEnc, enabledAt: null },
    });
    await this.audit.log({ userId: user.sub, action: '2fa.setup', ...ctx });

    return { otpauthUrl: otpauthUrl(secret, account.email), secret: base32Encode(secret) };
  }

  /** Confirme l'activation avec un premier code, et ouvre la session 2FA. */
  async enable(user: RequestUser, code: string, ctx: AuditCtx) {
    const record = await this.prisma.twoFactorAuth.findUnique({ where: { userId: user.sub } });
    if (!record || record.enabledAt) throw new BadRequestException('Aucune activation en cours');

    await this.checkCode(user.sub, record.secretEnc, code, ctx);
    await this.prisma.twoFactorAuth.update({ where: { userId: user.sub }, data: { enabledAt: new Date() } });
    await this.audit.log({ userId: user.sub, action: '2fa.enable', ...ctx });
    return this.issueProof(user.sub);
  }

  /** Vérification à chaque connexion. */
  async verify(user: RequestUser, code: string, ctx: AuditCtx) {
    const record = await this.prisma.twoFactorAuth.findUnique({ where: { userId: user.sub } });
    if (!record?.enabledAt) throw new BadRequestException('Double authentification non activée');

    await this.checkCode(user.sub, record.secretEnc, code, ctx);
    await this.audit.log({ userId: user.sub, action: '2fa.verify.success', ...ctx });
    return this.issueProof(user.sub);
  }

  /** Utilisé par TwoFactorGuard. */
  isValidProof(token: string | undefined, userId: string): boolean {
    if (!token) return false;
    try {
      const payload = this.jwt.verify<{ sub: string; typ: string }>(token, { secret: this.proofSecret(), algorithms: ['HS256'] });
      return payload.typ === 'mfa' && payload.sub === userId;
    } catch {
      return false;
    }
  }

  // ── Interne ─────────────────────────────────────────────────────────

  private async checkCode(userId: string, secretEnc: string, code: string, ctx: AuditCtx) {
    const attemptsKey = `2fa:attempts:${userId}`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) await this.redis.expire(attemptsKey, ATTEMPTS_WINDOW_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      throw new HttpException('Trop de tentatives — réessayez dans 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
    }

    const step = verifyTotp(decryptSecret(secretEnc, this.encryptionKey()), code, Math.floor(Date.now() / 1000));

    // Anti-rejeu : un code déjà utilisé (ou plus ancien) est refusé, même
    // s'il est encore dans sa fenêtre de validité.
    const lastKey = `2fa:last-step:${userId}`;
    const last = Number((await this.redis.get(lastKey)) ?? -1);
    if (step === null || step <= last) {
      await this.audit.log({ userId, action: '2fa.verify.failure', ...ctx });
      // 403 et non 401 : un 401 ferait croire au client que la session a
      // expiré (rafraîchissement puis déconnexion) pour une simple faute de frappe.
      throw new ForbiddenException({ statusCode: 403, code: 'INVALID_TWO_FACTOR_CODE', message: 'Code incorrect ou expiré' });
    }

    await this.redis.set(lastKey, String(step), 'EX', TOTP_STEP_SECONDS * 4);
    await this.redis.del(attemptsKey);
  }

  private issueProof(userId: string) {
    const twoFactorToken = this.jwt.sign({ sub: userId, typ: 'mfa' }, { secret: this.proofSecret(), expiresIn: PROOF_TTL });
    return { twoFactorToken, expiresIn: PROOF_TTL_SECONDS };
  }

  /** Clé de signature des preuves 2FA, dérivée : jamais égale à JWT_SECRET. */
  private proofSecret(): string {
    const base = this.config.get<string>('JWT_SECRET');
    if (!base) throw new ServiceUnavailableException('Configuration JWT absente');
    return createHash('sha256').update(`${base}:xlcab-2fa-proof`).digest('hex');
  }

  /** Clé AES-256 (32 octets, base64) du chiffrement des secrets TOTP. */
  private encryptionKey(): Buffer {
    const raw = this.config.get<string>('TWO_FACTOR_ENC_KEY');
    const key = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) {
      throw new ServiceUnavailableException('Double authentification non configurée sur le serveur');
    }
    return key;
  }
}
