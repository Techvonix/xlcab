import { Body, Controller, Get, Global, HttpCode, HttpStatus, Inject, Injectable, Logger, Module, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { toEnglish, wantsEnglish } from '../i18n/translate';
import { PrismaService } from '../prisma/prisma.service';
import { FcmPushSender, PUSH_SENDER, PushSender } from './push';

/**
 * Notifications utilisateur (Partie 4 : Notification). Enregistrées en base — boîte de réception
 * des applis (`GET /users/me/notifications`) — puis envoyées en push sur les téléphones du compte
 * (Firebase Cloud Messaging, `push.ts`), dans la langue du compte, sauf si l'utilisateur a coupé les
 * notifications push dans ses préférences. L'envoi push ne retarde jamais la décision qui l'a
 * déclenché et une erreur ne la fait jamais échouer.
 */

/** Téléphones gardés par compte (les plus anciens sont oubliés au-delà). */
const MAX_DEVICES_PER_USER = 10;
const INBOX_PAGE_SIZE = 30;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Envois push en cours (attendus par les tests). */
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private prisma: PrismaService,
    @Inject(PUSH_SENDER) private push: PushSender,
  ) {}

  async notify(userId: string, type: string, title: string, body: string, data?: Record<string, unknown>) {
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, body, data: (data as object) ?? undefined },
      });
    } catch (err) {
      // Une notification ratée ne doit pas annuler la décision qui l'a déclenchée.
      this.logger.error(`Notification non enregistrée (${type}) : ${(err as Error).message}`);
      return;
    }
    if (!this.push.enabled) return;
    const sending = this.sendPush(userId, type, title, body, data).catch((err) =>
      this.logger.warn(`Push non envoyé (${type}) : ${(err as Error).message}`),
    );
    this.inflight.add(sending);
    void sending.finally(() => this.inflight.delete(sending));
  }

  /** Tests : attend la fin des envois push lancés. */
  async settled() {
    await Promise.all([...this.inflight]);
  }

  private async sendPush(userId: string, type: string, title: string, body: string, data?: Record<string, unknown>) {
    const pref = await this.prisma.userPreference.findUnique({ where: { userId } });
    if (pref && pref.notifyPush === false) return;
    const devices = await this.prisma.pushDevice.findMany({ where: { userId } });
    if (devices.length === 0) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
    const en = !!user?.locale && !user.locale.startsWith('fr');
    const message = {
      title: en ? toEnglish(title) : title,
      body: en ? toEnglish(body) : body,
      // FCM n'accepte que du texte : l'appli s'en sert pour ouvrir le bon écran.
      data: Object.fromEntries(
        Object.entries({ type, ...(data ?? {}) })
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
      ),
    };
    for (const device of devices) {
      const result = await this.push.send(device.token, message);
      if (result === 'invalid') await this.prisma.pushDevice.deleteMany({ where: { id: device.id } });
    }
  }
}

export class RegisterDeviceDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios'])
  platform!: string;

  @IsIn(['passenger', 'driver'])
  app!: string;
}

export class RemoveDeviceDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}

export class MarkReadDto {
  /** Absent : toutes les notifications du compte. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids?: string[];
}

export class InboxQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;
}

/** Boîte de réception et téléphones de l'utilisateur connecté (tous les rôles). */
@Controller('api/v1/users/me')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get('notifications')
  async inbox(@Req() req: any, @Query() q: InboxQueryDto) {
    const userId = req.user.sub as string;
    const page = q.page ?? 1;
    const en = wantsEnglish(req.headers?.['x-locale']);
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * INBOX_PAGE_SIZE,
        take: INBOX_PAGE_SIZE,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      page,
      unread,
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: en ? toEnglish(n.title) : n.title,
        body: en ? toEnglish(n.body) : n.body,
        data: n.data ?? null,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() req: any, @Body() dto: MarkReadDto) {
    const userId = req.user.sub as string;
    // Propriété vérifiée par le filtre : seules les notifications du compte sont touchées.
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(dto.ids ? { id: { in: dto.ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  /** Téléphone qui reçoit les notifications : à chaque ouverture connectée de l'appli. */
  @Put('devices')
  async register(@Req() req: any, @Body() dto: RegisterDeviceDto) {
    const userId = req.user.sub as string;
    const now = new Date();
    const existing = await this.prisma.pushDevice.findUnique({ where: { token: dto.token } });
    if (existing) {
      // Même téléphone, peut-être un autre compte : le jeton change de propriétaire.
      await this.prisma.pushDevice.update({ where: { id: existing.id }, data: { userId, platform: dto.platform, app: dto.app, lastSeenAt: now } });
    } else {
      await this.prisma.pushDevice.create({ data: { userId, token: dto.token, platform: dto.platform, app: dto.app, lastSeenAt: now } });
    }
    const mine = await this.prisma.pushDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
    const stale = mine.slice(MAX_DEVICES_PER_USER).map((d) => d.id);
    if (stale.length > 0) await this.prisma.pushDevice.deleteMany({ where: { id: { in: stale } } });
    return { registered: true };
  }

  /** Déconnexion : ce téléphone ne reçoit plus les notifications du compte. */
  @Post('devices/remove')
  @HttpCode(HttpStatus.OK)
  async remove(@Req() req: any, @Body() dto: RemoveDeviceDto) {
    const { count } = await this.prisma.pushDevice.deleteMany({ where: { token: dto.token, userId: req.user.sub } });
    return { removed: count };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: PUSH_SENDER, useClass: FcmPushSender }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
