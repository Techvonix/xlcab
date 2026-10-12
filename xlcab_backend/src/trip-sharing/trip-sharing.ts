import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { coarseAddress } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.service';

// Espace sécurité du passager : contacts de confiance et partage du trajet
// en direct par un lien signé. Le serveur n'envoie rien lui-même (pas de
// service SMS / e-mail branché) : le passager transmet le lien depuis sa
// propre messagerie. Le lien ne montre ni l'adresse exacte, ni le nom de
// famille, ni aucun téléphone.

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Numéro saisi avec espaces, points ou tirets : on ne garde que « + » et les chiffres. */
const phoneDigits = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s.\-()]/g, '') : value);

/** Un cercle de proches, pas un carnet d'adresses. */
export const MAX_TRUSTED_CONTACTS = 5;
/** Durée de vie maximale d'un lien après l'heure de départ prévue. */
export const SHARE_TTL_MS = 24 * 3600_000;
/** Après la fin du trajet, la page affiche « terminé » puis le lien s'éteint. */
export const SHARE_GRACE_AFTER_END_MS = 30 * 60_000;

const ENDED = ['completed', 'cancelled'];
/** Chauffeur engagé : son prénom, son véhicule et sa position peuvent être montrés. */
const LIVE = ['accepted', 'started'];

export class SaveContactDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Donnez un nom à ce contact' })
  @MaxLength(60, { message: 'Nom limité à 60 caractères' })
  name!: string;

  @Transform(phoneDigits)
  @IsString()
  @Matches(/^\+?[0-9]{6,15}$/, { message: 'Numéro de téléphone invalide' })
  phone!: string;
}

const CONTACT_FIELDS = { id: true, name: true, phone: true, createdAt: true } as const;

export interface SharedTripView {
  status: string;
  /** Prénom de la personne qui partage son trajet. */
  travellerFirstName: string | null;
  originArea: string;
  destinationArea: string;
  scheduledAt: Date | null;
  driver: { firstName: string | null; vehicle: { brand: string | null; model: string | null; color: string | null; plate: string } | null } | null;
  position: { lat: number; lng: number; recordedAt: Date } | null;
}

@Injectable()
export class TripSharingService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ── Contacts de confiance ───────────────────────────────────────────

  contacts(userId: string) {
    return this.prisma.trustedContact.findMany({ where: { userId }, select: CONTACT_FIELDS, orderBy: { createdAt: 'asc' } });
  }

  async addContact(userId: string, dto: SaveContactDto) {
    const count = await this.prisma.trustedContact.count({ where: { userId } });
    if (count >= MAX_TRUSTED_CONTACTS) {
      throw new BadRequestException(`${MAX_TRUSTED_CONTACTS} contacts de confiance au maximum : supprimez-en un d’abord`);
    }
    return this.prisma.trustedContact.create({ data: { userId, name: dto.name, phone: dto.phone }, select: CONTACT_FIELDS });
  }

  async deleteContact(userId: string, id: string) {
    // Ownership : seul un contact de l'utilisateur peut être supprimé ; sinon 404.
    const { count } = await this.prisma.trustedContact.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Contact introuvable');
    return { deleted: true };
  }

  // ── Partage d'un trajet ─────────────────────────────────────────────

  /** Lien de suivi du trajet : le même tant qu'il est actif (déjà envoyé à un proche). */
  async share(userId: string, tripId: string) {
    const trip = await this.ownTrip(userId, tripId);
    if (ENDED.includes(trip.status)) throw new ConflictException('Ce trajet est terminé : il ne peut plus être partagé');
    const now = new Date();
    const active = await this.activeShare(userId, tripId, now);
    const share =
      active ??
      (await this.prisma.tripShare.create({
        data: {
          tripId,
          userId,
          expiresAt: new Date(Math.max(now.getTime(), trip.scheduledAt?.getTime() ?? 0) + SHARE_TTL_MS),
        },
      }));
    return { active: true, url: this.urlFor(share.id), expiresAt: share.expiresAt };
  }

  async shareStatus(userId: string, tripId: string) {
    await this.ownTrip(userId, tripId);
    const share = await this.activeShare(userId, tripId, new Date());
    return share ? { active: true, url: this.urlFor(share.id), expiresAt: share.expiresAt } : { active: false, url: null, expiresAt: null };
  }

  /** Coupe le lien tout de suite : la page de suivi répond « introuvable ». */
  async stopSharing(userId: string, tripId: string) {
    await this.ownTrip(userId, tripId);
    await this.prisma.tripShare.updateMany({ where: { tripId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { active: false, url: null, expiresAt: null };
  }

  /**
   * Ce que voit le proche. null = lien inconnu, coupé ou expiré (même
   * réponse dans tous les cas : rien ne permet de deviner un lien valide).
   */
  async publicView(token: string): Promise<SharedTripView | null> {
    const shareId = this.verify(token);
    if (!shareId) return null;
    const now = new Date();
    const share = await this.prisma.tripShare.findUnique({ where: { id: shareId } });
    if (!share || share.revokedAt || share.expiresAt <= now) return null;

    const trip = await this.prisma.trip.findUnique({
      where: { id: share.tripId },
      select: {
        status: true, passengerId: true, driverId: true, vehicleId: true, originAddress: true, destinationAddress: true,
        scheduledAt: true, completedAt: true, cancelledAt: true,
      },
    });
    // Le partage appartient au passager de la course : il s'éteint si la course change de main.
    if (!trip || trip.passengerId !== share.userId) return null;
    const endedAt = trip.completedAt ?? trip.cancelledAt;
    if (ENDED.includes(trip.status) && (!endedAt || now.getTime() - endedAt.getTime() > SHARE_GRACE_AFTER_END_MS)) return null;

    const live = LIVE.includes(trip.status);
    const [traveller, driver, vehicle, point] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: share.userId }, select: { firstName: true } }),
      live && trip.driverId ? this.prisma.user.findUnique({ where: { id: trip.driverId }, select: { firstName: true } }) : null,
      live && trip.vehicleId
        ? this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId }, select: { brand: true, model: true, color: true, plate: true } })
        : null,
      live
        ? this.prisma.trackingPoint.findFirst({
            where: { tripId: share.tripId },
            orderBy: { recordedAt: 'desc' },
            select: { lat: true, lng: true, recordedAt: true },
          })
        : null,
    ]);

    return {
      status: trip.status,
      travellerFirstName: traveller?.firstName ?? null,
      // Ville seulement : l'adresse exacte du voyageur n'est jamais dans la page.
      originArea: coarseAddress(trip.originAddress),
      destinationArea: coarseAddress(trip.destinationAddress),
      scheduledAt: trip.scheduledAt,
      driver: live && trip.driverId ? { firstName: driver?.firstName ?? null, vehicle: vehicle ?? null } : null,
      position: point ? { lat: point.lat, lng: point.lng, recordedAt: point.recordedAt } : null,
    };
  }

  // ── Interne ─────────────────────────────────────────────────────────

  /** La course, seulement pour son passager (sinon 404 : son existence n'est pas révélée). */
  private async ownTrip(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { status: true, passengerId: true, scheduledAt: true } });
    if (!trip || trip.passengerId !== userId) throw new NotFoundException('Trajet introuvable');
    return trip;
  }

  private activeShare(userId: string, tripId: string, now: Date) {
    return this.prisma.tripShare.findFirst({ where: { tripId, userId, revokedAt: null, expiresAt: { gt: now } } });
  }

  private urlFor(shareId: string) {
    const base = (this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/suivi/${shareId}.${this.signature(shareId)}`;
  }

  /** Clé dérivée de JWT_SECRET (comme les liens de facture) : un jeton d'accès ne peut pas servir de lien. */
  private signature(shareId: string) {
    const key = createHash('sha256').update(`${this.config.get<string>('JWT_SECRET')}:xlcab-trip-share`).digest();
    return createHmac('sha256', key).update(shareId).digest('base64url');
  }

  /** Identifiant du partage si la signature est bonne, sinon null. */
  private verify(token: string): string | null {
    const [shareId, sig, ...rest] = (token ?? '').split('.');
    if (!shareId || !sig || rest.length > 0 || !/^[0-9a-f-]{36}$/i.test(shareId)) return null;
    const expected = Buffer.from(this.signature(shareId));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? shareId : null;
  }
}

@Controller('api/v1/users/me/contacts')
@UseGuards(JwtAuthGuard)
export class TrustedContactsController {
  constructor(private sharing: TripSharingService) {}

  @Get()
  list(@Req() req: any) {
    return this.sharing.contacts(req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@Req() req: any, @Body() dto: SaveContactDto) {
    return this.sharing.addContact(req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.sharing.deleteContact(req.user.sub, id);
  }
}

@Controller('api/v1/trips/:id/share')
@UseGuards(JwtAuthGuard)
export class TripShareController {
  constructor(private sharing: TripSharingService) {}

  @Get()
  status(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    return this.sharing.shareStatus(req.user.sub, tripId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  share(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    return this.sharing.share(req.user.sub, tripId);
  }

  @Delete()
  stop(@Req() req: any, @Param('id', ParseUUIDPipe) tripId: string) {
    return this.sharing.stopSharing(req.user.sub, tripId);
  }
}

// ── Page publique de suivi (sans compte ni application) ───────────────

const TEXTS = {
  fr: {
    title: 'Suivi de trajet XLCAB',
    notFoundTitle: 'Lien de suivi indisponible',
    notFound: 'Ce lien n’existe pas, a expiré ou a été désactivé par la personne qui l’a partagé.',
    heading: (name: string | null) => (name ? `${name} voyage avec XLCAB` : 'Trajet XLCAB partagé'),
    route: 'Trajet',
    departure: 'Départ prévu',
    driver: 'Chauffeur',
    vehicle: 'Véhicule',
    plate: 'immatriculation',
    position: 'Dernière position',
    seeOnMap: 'Voir sur la carte',
    at: 'à',
    noPosition: 'La position s’affichera quand le chauffeur sera en route.',
    waitingPosition: 'Position du véhicule pas encore reçue.',
    refresh: 'Cette page se met à jour toute seule.',
    emergency: 'En cas d’urgence, appelez le 112.',
    status: {
      awaiting_payment: 'Réservation en cours',
      pending: 'Trajet réservé',
      searching: 'Recherche d’un chauffeur',
      no_driver: 'Recherche d’un chauffeur',
      attached: 'Trajet réservé',
      accepted: 'Chauffeur en route',
      started: 'Trajet en cours',
      completed: 'Trajet terminé',
      cancelled: 'Trajet annulé',
    } as Record<string, string>,
  },
  en: {
    title: 'XLCAB trip tracking',
    notFoundTitle: 'Tracking link unavailable',
    notFound: 'This link does not exist, has expired or was turned off by the person who shared it.',
    heading: (name: string | null) => (name ? `${name} is travelling with XLCAB` : 'Shared XLCAB trip'),
    route: 'Trip',
    departure: 'Scheduled departure',
    driver: 'Driver',
    vehicle: 'Vehicle',
    plate: 'plate',
    position: 'Last position',
    seeOnMap: 'See on the map',
    at: 'at',
    noPosition: 'The position will appear once the driver is on the way.',
    waitingPosition: 'Vehicle position not received yet.',
    refresh: 'This page refreshes automatically.',
    emergency: 'In an emergency, call 112.',
    status: {
      awaiting_payment: 'Booking in progress',
      pending: 'Trip booked',
      searching: 'Looking for a driver',
      no_driver: 'Looking for a driver',
      attached: 'Trip booked',
      accepted: 'Driver on the way',
      started: 'Trip in progress',
      completed: 'Trip completed',
      cancelled: 'Trip cancelled',
    } as Record<string, string>,
  },
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Page HTML sans script (compatible avec la politique de sécurité de Helmet), couleurs de l'identité Orbite. */
export function renderSharedTripPage(view: SharedTripView | null, lang: 'fr' | 'en'): string {
  const t = TEXTS[lang];
  const when = (d: Date) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d);
  const row = (label: string, value: string) => `<p><span class="l">${esc(label)}</span><br>${value}</p>`;

  let body: string;
  if (!view) {
    body = `<h1>${esc(t.notFoundTitle)}</h1><p>${esc(t.notFound)}</p>`;
  } else {
    const v = view.driver?.vehicle;
    const map = view.position ? `https://www.google.com/maps?q=${view.position.lat},${view.position.lng}` : null;
    body = [
      `<h1>${esc(t.heading(view.travellerFirstName))}</h1>`,
      `<p class="s">${esc(t.status[view.status] ?? view.status)}</p>`,
      row(t.route, `${esc(view.originArea)} → ${esc(view.destinationArea)}`),
      view.scheduledAt ? row(t.departure, esc(when(view.scheduledAt))) : '',
      view.driver ? row(t.driver, esc(view.driver.firstName ?? '—')) : '',
      v ? row(t.vehicle, `${esc([[v.brand, v.model].filter(Boolean).join(" "), v.color].filter(Boolean).join(" · "))}<br>${esc(t.plate)} <strong>${esc(v.plate)}</strong>`) : '',
      view.position && map
        ? row(t.position, `${esc(t.at)} ${esc(when(view.position.recordedAt))}<br><a href="${esc(map)}" rel="noopener noreferrer">${esc(t.seeOnMap)}</a>`)
        : ['completed', 'cancelled'].includes(view.status) ? '' : `<p>${esc(view.driver ? t.waitingPosition : t.noPosition)}</p>`,
      `<p class="m">${esc(t.refresh)}<br>${esc(t.emergency)}</p>`,
    ].join('');
  }

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${view ? '<meta http-equiv="refresh" content="20">' : ''}
<title>${esc(t.title)}</title>
<link rel="stylesheet" href="/suivi/style.css">
</head>
<body><main><p class="b">XLCAB</p>${body}</main></body>
</html>`;
}

export const SHARED_TRIP_CSS = `body{margin:0;background:#070B1A;color:#E8F1FF;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
main{max-width:520px;margin:0 auto;padding:24px 16px}
.b{letter-spacing:.3em;color:#22D3EE;font-weight:700;margin:0 0 16px}
h1{font-size:1.5rem;margin:0 0 8px}
.s{display:inline-block;background:#111936;border:1px solid #2A3A66;border-radius:999px;padding:4px 14px;font-weight:600;margin:0 0 8px}
p{margin:16px 0}
.l{color:#A9B8D6;font-size:.875rem}
.m{color:#A9B8D6;font-size:.875rem;border-top:1px solid #2A3A66;padding-top:16px}
a{color:#22D3EE;font-weight:600}
strong{letter-spacing:.05em}`;

@Controller()
export class SharedTripPublicController {
  constructor(private sharing: TripSharingService) {}

  /** Données de la page (pour une future carte intégrée) : même contenu que la page. */
  @Get('api/v1/shared-trips/:token')
  @Header('Cache-Control', 'no-store')
  async json(@Param('token') token: string) {
    const view = await this.sharing.publicView(token);
    if (!view) throw new NotFoundException('Lien de suivi indisponible');
    return view;
  }

  @Get('suivi/style.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  style() {
    return SHARED_TRIP_CSS;
  }

  @Get('suivi/:token')
  async page(@Param('token') token: string, @Query('lang') lang: string | undefined, @Req() req: any, @Res() res: any) {
    const view = await this.sharing.publicView(token);
    const accept = String(req.headers?.['accept-language'] ?? '').toLowerCase();
    const chosen: 'fr' | 'en' = lang === 'en' || lang === 'fr' ? lang : accept.startsWith('fr') || accept === '' ? 'fr' : 'en';
    res
      .status(view ? 200 : 404)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        // Position d'une personne : jamais mise en cache, jamais indexée, jamais transmise en référent.
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
      })
      .send(renderSharedTripPage(view, chosen));
  }
}

@Module({
  controllers: [TrustedContactsController, TripShareController, SharedTripPublicController],
  providers: [TripSharingService],
})
export class TripSharingModule {}
