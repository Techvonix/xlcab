import { BadRequestException, Body, Controller, HttpCode, HttpException, HttpStatus, Injectable, Module, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Mot de passe oublié. Module à part du Module 2 (figé) : il ne touche pas au code de connexion,
// il remplace seulement le mot de passe enregistré et ferme toutes les sessions.
//
// 1. `POST /auth/password/forgot { email }` : réponse identique que le compte existe ou non (pas
//    d'énumération des adresses) ; si le compte existe, un CODE à 6 chiffres part par e-mail
//    (valable 15 min, 5 essais). Un code plutôt qu'un lien : il se saisit dans l'appli, sans lien
//    profond à configurer.
// 2. `POST /auth/password/reset { email, code, password }` : nouveau mot de passe (règles de
//    l'inscription), toutes les sessions fermées sur tous les appareils, journal d'audit.
// Le code n'est jamais stocké en clair : Redis garde son empreinte (HMAC, clé dérivée de JWT_SECRET).

/** Durée de validité d'un code. */
export const RESET_CODE_TTL_SECONDS = 15 * 60;
/** Essais autorisés par code. */
export const RESET_MAX_ATTEMPTS = 5;
/** Demandes de code par adresse et par heure. */
const REQUESTS_PER_EMAIL_PER_HOUR = 3;
/** Demandes de code par adresse IP et par heure. */
const REQUESTS_PER_IP_PER_HOUR = 10;
/** Comme l'inscription (Partie 8 : « Bcrypt coût 12 »). */
const BCRYPT_COST = 12;


export class ForgotPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Adresse email invalide' })
  @MaxLength(254, { message: 'Adresse email invalide' })
  email!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code reçu par e-mail compte 6 chiffres' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(128, { message: 'Le mot de passe ne doit pas dépasser 128 caractères' })
  password!: string;
}

@Injectable()
export class AccountRecoveryService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mail: MailService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  private digest(userId: string, code: string) {
    const key = createHash('sha256').update(`${this.config.get<string>('JWT_SECRET')}:xlcab-password-reset`).digest();
    return createHmac('sha256', key).update(`${userId}:${code}`).digest('base64url');
  }

  private async limit(key: string, max: number) {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > max) throw new HttpException('Trop de demandes — réessayez dans une heure', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** Demande de code. Même réponse que le compte existe ou non. */
  async forgot(rawEmail: string, ip: string) {
    // Adresse comparée telle quelle, comme à la connexion ; les limites, elles, ignorent la casse.
    const email = rawEmail.trim();
    await this.limit(`pwreset:ip:${ip}`, REQUESTS_PER_IP_PER_HOUR);
    await this.limit(`pwreset:mail:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`, REQUESTS_PER_EMAIL_PER_HOUR);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, passwordHash: true, locale: true },
    });
    if (user?.passwordHash) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // Un nouveau code remplace le précédent (et remet les essais à zéro).
      await this.redis.set(`pwreset:code:${user.id}`, this.digest(user.id, code), 'EX', RESET_CODE_TTL_SECONDS);
      await this.redis.del(`pwreset:tries:${user.id}`);
      await this.audit.log({ userId: user.id, action: 'user.password_reset.request', entity: 'User', entityId: user.id, ipAddress: ip });
      // Envoi sans attendre : la réponse ne doit pas trahir l'existence du compte par sa durée.
      void this.mail.send(resetMail(email, code, user.locale));
    }
    return { message: 'Si un compte existe pour cette adresse, un code vient d’être envoyé par e-mail.' };
  }

  /** Nouveau mot de passe avec le code reçu ; toutes les sessions sont fermées. */
  async reset(dto: ResetPasswordDto, ip: string) {
    const email = dto.email.trim();
    const invalid = new BadRequestException('Code invalide ou expiré : demandez un nouveau code');
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } });
    if (!user) throw invalid;
    const key = `pwreset:code:${user.id}`;
    const triesKey = `pwreset:tries:${user.id}`;
    const stored = await this.redis.get(key);
    if (!stored) throw invalid;
    const expected = Buffer.from(stored);
    const given = Buffer.from(this.digest(user.id, dto.code));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      const tries = await this.redis.incr(triesKey);
      if (tries === 1) await this.redis.expire(triesKey, RESET_CODE_TTL_SECONDS);
      if (tries >= RESET_MAX_ATTEMPTS) {
        await this.redis.del(key, triesKey);
        throw new HttpException('Trop d’essais : demandez un nouveau code', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw invalid;
    }
    await this.redis.del(key, triesKey);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.revokeSessions(user.id);
    await this.audit.log({ userId: user.id, action: 'user.password_reset', entity: 'User', entityId: user.id, ipAddress: ip });
    return { message: 'Mot de passe modifié : connectez-vous avec le nouveau.' };
  }

  /** Toutes les sessions de l'utilisateur (un refresh token par appareil). */
  private async revokeSessions(userId: string) {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `refresh:${userId}:*`, 'COUNT', 100);
      if (keys.length > 0) await this.redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  }
}

/** E-mail du code, dans la langue du compte. */
function resetMail(to: string, code: string, locale: string | null) {
  if (locale === 'en') {
    return {
      to,
      subject: `XLCAB — your code: ${code}`,
      text: `Hello,\n\nYour XLCAB password reset code is: ${code}\n\nIt is valid for 15 minutes. Enter it in the app to choose a new password.\n\nIf you did not ask for it, ignore this e-mail: your password does not change.\n\nThe XLCAB team`,
    };
  }
  return {
    to,
    subject: `XLCAB — votre code : ${code}`,
    text: `Bonjour,\n\nVotre code pour changer de mot de passe XLCAB : ${code}\n\nIl est valable 15 minutes. Saisissez-le dans l’appli pour choisir un nouveau mot de passe.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.\n\nL’équipe XLCAB`,
  };
}

@Controller('api/v1/auth/password')
export class AccountRecoveryController {
  constructor(private recovery: AccountRecoveryService) {}

  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    return this.recovery.forgot(dto.email, req.ip ?? 'inconnue');
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: ResetPasswordDto, @Req() req: any) {
    return this.recovery.reset(dto, req.ip ?? 'inconnue');
  }
}

@Module({ controllers: [AccountRecoveryController], providers: [AccountRecoveryService] })
export class AccountRecoveryModule {}
