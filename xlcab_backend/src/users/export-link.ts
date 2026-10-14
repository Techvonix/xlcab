import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EXPORTS_PER_DAY, UsersService, exportRateKey } from './users.service';

// Export RGPD depuis l'application mobile (droit d'accès, Partie 8).
//
// L'app ne peut pas enregistrer elle-même un fichier : elle demande un lien
// court, puis l'ouvre dans le navigateur du téléphone, qui télécharge le
// fichier JSON. Le lien vaut 5 minutes et ne sert QU'UNE fois : il reste dans
// l'historique du navigateur, il ne doit plus rien ouvrir ensuite.
//
// Jeton : `{userId}.{expiration}.{nonce}.{signature}`, signature HMAC avec une
// clé dérivée de JWT_SECRET (rien n'est stocké en base) ; l'usage unique est
// tenu dans Redis par le nonce.

const LINK_TTL_MS = 5 * 60_000;

@Injectable()
export class ExportLinkService {
  constructor(
    private config: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
    private users: UsersService,
  ) {}

  /** Lien de téléchargement. Le quota quotidien est vérifié ici, pour que le refus s'affiche dans l'app. */
  async create(userId: string, baseUrl: string, now = Date.now()) {
    const used = Number(await this.redis.get(exportRateKey(userId))) || 0;
    if (used >= EXPORTS_PER_DAY) throw new HttpException('Trop d’exports aujourd’hui — réessayez demain', HttpStatus.TOO_MANY_REQUESTS);
    const expires = now + LINK_TTL_MS;
    const nonce = randomBytes(16).toString('hex');
    const payload = `${userId}.${expires}.${nonce}`;
    const token = `${payload}.${this.sign(payload)}`;
    return { url: `${baseUrl.replace(/\/+$/, '')}/api/v1/users/export/file?token=${encodeURIComponent(token)}`, expiresAt: new Date(expires) };
  }

  /** Vérifie le lien (signature, échéance, usage unique) et renvoie l'export du compte. */
  async consume(token: string | undefined, ctx: { ipAddress?: string; userAgent?: string }, now = Date.now()) {
    const parts = (token ?? '').split('.');
    const invalid = () => new UnauthorizedException('Lien expiré ou déjà utilisé : relancez le téléchargement depuis l’application');
    if (parts.length !== 4) throw invalid();
    const [userId, expires, nonce, signature] = parts;
    const expected = Buffer.from(this.sign(`${userId}.${expires}.${nonce}`));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid();
    if (!/^\d+$/.test(expires) || Number(expires) < now) throw invalid();
    // Usage unique : le premier téléchargement « consomme » le lien.
    if ((await this.redis.set(`users:export:link:${nonce}`, '1', 'EX', Math.ceil(LINK_TTL_MS / 1000) + 60, 'NX')) !== 'OK') throw invalid();

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
    if (!user || user.deletedAt) throw invalid();
    return this.users.export({ sub: userId, role: user.role }, ctx);
  }

  private sign(payload: string): string {
    const key = createHash('sha256').update(`${this.config.get<string>('JWT_SECRET')}:xlcab-export-link`).digest();
    return createHmac('sha256', key).update(payload).digest('base64url');
  }
}

@Controller('api/v1/users/me/export')
@UseGuards(JwtAuthGuard)
export class ExportLinkController {
  constructor(private links: ExportLinkService) {}

  /** L'app ouvre ensuite ce lien dans le navigateur du téléphone. */
  @Post('link')
  @HttpCode(HttpStatus.OK)
  link(@Req() req: any) {
    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    return this.links.create(req.user.sub, base);
  }
}

/** Sans authentification : c'est le lien signé, à usage unique, qui prouve l'accès. */
@Controller('api/v1/users/export')
export class ExportFileController {
  constructor(private links: ExportLinkService) {}

  @Get('file')
  async file(@Query('token') token: string | undefined, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const data = await this.links.consume(token, AuditService.context(req));
    const day = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="xlcab-mes-donnees-${day}.json"`,
      // Données personnelles : jamais en cache, jamais indexées, jamais transmises en référent.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    });
    return JSON.stringify(data, null, 2);
  }
}
