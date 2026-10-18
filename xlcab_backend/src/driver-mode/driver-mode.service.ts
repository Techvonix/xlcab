import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { assertDashcamCharter } from '../dashcam/dashcam';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { DispatchService } from '../matching/dispatch.service';
import { ParcelChecklistItem, ParcelsService } from '../parcels/parcels.service';
import { TRACKING_LEAD_MIN, TripStatus } from '../matching/matching.constants';
// Revenus du jour / de la semaine : en heure locale du chauffeur.
import { TIMEZONES, startOf } from '../common/local-time';

export interface RequestUser {
  sub: string;
  role: string;
}

const RECENT_MISSIONS = 20;

/** Commission XLCAB sur les courses (décision du porteur de projet : 10 %). */
export const DEFAULT_DRIVER_COMMISSION_PERCENT = 10;

export function driverCommissionPercent(): number {
  const raw = Number(process.env.DRIVER_COMMISSION_PERCENT);
  return process.env.DRIVER_COMMISSION_PERCENT && Number.isFinite(raw) && raw >= 0 && raw < 100
    ? raw
    : DEFAULT_DRIVER_COMMISSION_PERCENT;
}

export interface Mission {
  id: string;
  status: string;
  type: string;
  shuttleType: string;
  origin: { address: string; lat: number; lng: number };
  destination: { address: string; lat: number; lng: number };
  scheduledAt: Date | null;
  distanceKm: number | null;
  durationMin: number | null;
  seats: number;
  childSeats: number;
  checkedIn: boolean;
  totalPriceCents: number | null;
  /** Réservation sur un départ de ligne : l'app la regroupe avec son départ (embarquement en bloc). */
  lineDepartureId: string | null;
  /** Colis à enlever / remettre sur cette course (checklist colis, écran 15). */
  parcels: ParcelChecklistItem[];
  /** Prénom après acceptation ; téléphone seulement à l'approche (T − 60 min) ou en course. */
  passenger: { firstName: string | null; phone: string | null } | null;
}

/**
 * Mode chauffeur (Partie 7, écran 15) : disponibilité, missions, revenus.
 * Réservé au rôle driver ; chaque requête ne porte que sur le chauffeur
 * du token (ownership implicite, aucun identifiant dans l'URL).
 */
@Injectable()
export class DriverModeService {
  constructor(
    private prisma: PrismaService,
    private tracking: TrackingService,
    private dispatch: DispatchService,
    private parcels: ParcelsService,
  ) {}

  // ── POST /drivers/me/online ─────────────────────────────────────────

  async setOnline(user: RequestUser, online: boolean) {
    if (!online) return this.goOffline(user.sub);

    const now = new Date();
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: user.sub },
      select: { approvedAt: true, documentsVerified: true, licenseExpiry: true, vtcCardExpiry: true },
    });
    // Message précis : le chauffeur doit savoir quoi faire pour débloquer.
    if (!profile?.approvedAt || !profile.documentsVerified) {
      throw new ForbiddenException('Compte chauffeur pas encore validé par XLCAB');
    }
    if (!profile.licenseExpiry || profile.licenseExpiry <= now) {
      throw new ForbiddenException('Permis de conduire expiré : envoyez le nouveau document');
    }
    if (profile.vtcCardExpiry && profile.vtcCardExpiry <= now) {
      throw new ForbiddenException('Carte VTC expirée : envoyez le nouveau document');
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { driverId: user.sub, isAvailable: true },
      select: { dashcamActive: true, insuranceExpiry: true, technicalControlExpiry: true },
    });
    if (vehicles.length === 0) throw new ForbiddenException('Aucun véhicule validé sur votre compte');
    const usable = vehicles.filter(
      (v) => v.insuranceExpiry && v.insuranceExpiry > now && v.technicalControlExpiry && v.technicalControlExpiry > now,
    );
    if (usable.length === 0) {
      throw new ForbiddenException('Assurance ou contrôle technique expiré : envoyez le nouveau document');
    }
    // Partie 8 : dashcam obligatoire.
    if (!usable.some((v) => v.dashcamActive)) {
      throw new ForbiddenException('Dashcam inactive : obligatoire pour recevoir des missions');
    }
    // Charte caméra embarquée (CHARTE_CAMERA_EMBARQUEE.md) acceptée dans sa version en vigueur.
    await assertDashcamCharter(this.prisma, user.sub);

    await this.prisma.driverProfile.update({ where: { id: user.sub }, data: { isOnline: true } });
    // Les missions n'arrivent qu'une fois les positions reçues (WebSocket,
    // driver:location toutes les 10 s) : c'est l'app qui les envoie.
    return { online: true };
  }

  private async goOffline(driverId: string) {
    // Pendant une course, l'app doit continuer d'envoyer la position
    // (suivi passager, SOS) : on ne la laisse pas se couper.
    const running = await this.prisma.trip.findFirst({
      where: { driverId, status: TripStatus.STARTED },
      select: { id: true },
    });
    if (running) throw new ConflictException('Terminez la course en cours avant de passer hors ligne');

    await this.prisma.driverProfile.update({ where: { id: driverId }, data: { isOnline: false } });
    await this.tracking.removeDriverFromIndex(driverId);
    // Offre reçue juste avant : passée tout de suite au chauffeur suivant.
    await this.dispatch.releaseOffersOf(driverId);
    return { online: false };
  }

  // ── GET /drivers/me/status ──────────────────────────────────────────

  async status(user: RequestUser) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: user.sub },
      select: { isOnline: true, approvedAt: true, rating: true, ratingCount: true, totalTrips: true },
    });
    if (!profile) throw new ForbiddenException('Compte chauffeur introuvable');
    return {
      online: profile.isOnline,
      approved: profile.approvedAt !== null,
      // null tant qu'aucun passager n'a noté : l'app affiche « Pas encore de note ».
      rating: profile.ratingCount > 0 ? Number(profile.rating) : null,
      ratingCount: profile.ratingCount,
      totalTrips: profile.totalTrips,
      // Offre en cours (app revenue au premier plan pendant les 30 s).
      offer: await this.dispatch.currentOffer(user.sub),
    };
  }

  // ── GET /drivers/me/trips ───────────────────────────────────────────

  async missions(user: RequestUser): Promise<{ upcoming: Mission[]; recent: Mission[] }> {
    const select = {
      id: true, status: true, type: true, shuttleType: true, passengerId: true,
      originAddress: true, originLat: true, originLng: true,
      destinationAddress: true, destinationLat: true, destinationLng: true,
      scheduledAt: true, distanceKm: true, durationMin: true, totalPriceCents: true, lineDepartureId: true,
      passengerBooking: { select: { seats: true, childSeats: true, checkedIn: true } },
    } as const;
    const [active, completed] = await Promise.all([
      this.prisma.trip.findMany({
        where: { driverId: user.sub, status: { in: [TripStatus.ACCEPTED, TripStatus.STARTED] } },
        select,
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.trip.findMany({
        where: { driverId: user.sub, status: TripStatus.COMPLETED },
        select,
        orderBy: { completedAt: 'desc' },
        take: RECENT_MISSIONS,
      }),
    ]);
    // Course aller terminée dont les colis du retour restent à traiter : elle
    // reste dans les missions (étape "retour") jusqu'à leur remise.
    const returning = await this.prisma.parcelBooking.findMany({
      where: { carrierTripId: { in: completed.map((t) => t.id) }, onReturnLeg: true, status: { in: ['pending', 'in_transit'] } },
      select: { carrierTripId: true },
    });
    const returningIds = new Set(returning.map((p) => p.carrierTripId));
    const upcoming = [...completed.filter((t) => returningIds.has(t.id)), ...active];
    const recent = completed.filter((t) => !returningIds.has(t.id));

    const passengerIds = [...new Set(upcoming.map((t) => t.passengerId).filter((id): id is string => !!id))];
    const passengers = passengerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: passengerIds } }, select: { id: true, firstName: true, phone: true } })
      : [];
    const byId = new Map(passengers.map((p) => [p.id, p]));
    const now = Date.now();
    // Téléphones : uniquement quand ils servent (prise en charge imminente
    // ou course en cours), pas des jours à l'avance (minimisation RGPD).
    const isNear = (t: (typeof upcoming)[number]) =>
      t.status === TripStatus.STARTED || !t.scheduledAt || t.scheduledAt.getTime() - now <= TRACKING_LEAD_MIN * 60_000;
    const checklists = await this.parcels.checklistFor(
      upcoming.map((t) => t.id),
      new Set(upcoming.filter(isNear).map((t) => t.id)),
    );

    const toMission = (t: (typeof upcoming)[number], withPassenger: boolean): Mission => {
      // Course colis : passengerId = expéditeur, présenté dans la checklist colis.
      const p = withPassenger && t.passengerId && t.type !== 'parcel' ? byId.get(t.passengerId) : undefined;
      const near = isNear(t);
      return {
        id: t.id,
        status: t.status,
        type: t.type,
        shuttleType: t.shuttleType,
        origin: { address: t.originAddress, lat: t.originLat, lng: t.originLng },
        destination: { address: t.destinationAddress, lat: t.destinationLat, lng: t.destinationLng },
        scheduledAt: t.scheduledAt,
        distanceKm: t.distanceKm == null ? null : Number(t.distanceKm),
        durationMin: t.durationMin,
        seats: t.passengerBooking?.seats ?? 0,
        childSeats: t.passengerBooking?.childSeats ?? 0,
        checkedIn: t.passengerBooking?.checkedIn ?? false,
        totalPriceCents: t.totalPriceCents,
        lineDepartureId: t.lineDepartureId,
        passenger: p ? { firstName: p.firstName, phone: near ? p.phone : null } : null,
        parcels: withPassenger ? checklists.get(t.id) ?? [] : [],
      };
    };

    return {
      upcoming: upcoming.map((t) => toMission(t, true)),
      // Courses passées : plus aucune donnée du passager.
      recent: recent.map((t) => toMission(t, false)),
    };
  }

  // ── GET /drivers/me/earnings ────────────────────────────────────────

  /**
   * Revenus des courses terminées : aujourd'hui, semaine (depuis lundi) et
   * mois, en heure locale de la juridiction du chauffeur.
   * Commission XLCAB (10 %, DRIVER_COMMISSION_PERCENT) calculée sur le
   * montant HT : la TVA (colis) est reversée à l'État et ne fait pas
   * partie du revenu du chauffeur. Net = HT − commission.
   */
  async earnings(user: RequestUser, now = new Date()) {
    const account = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { jurisdiction: true } });
    const tz = TIMEZONES[account?.jurisdiction ?? 'FR'] ?? TIMEZONES.FR;
    const commissionPercent = driverCommissionPercent();

    const period = async (start: Date) => {
      const where = { driverId: user.sub, status: TripStatus.COMPLETED, completedAt: { gte: start } };
      const [count, sum] = await Promise.all([
        this.prisma.trip.count({ where }),
        this.prisma.trip.aggregate({ where, _sum: { totalPriceCents: true, vatCents: true } }),
      ]);
      const grossCents = sum._sum.totalPriceCents ?? 0;
      const exVatCents = grossCents - (sum._sum.vatCents ?? 0);
      const commissionCents = Math.round((exVatCents * commissionPercent) / 100);
      return { trips: count, grossCents, exVatCents, commissionCents, netCents: exVatCents - commissionCents };
    };

    const [today, week, month] = await Promise.all([
      period(startOf('day', now, tz)),
      period(startOf('week', now, tz)),
      period(startOf('month', now, tz)),
    ]);
    return { currency: 'EUR', commissionPercent, today, week, month };
  }
}

// Dates en heure locale : src/common/local-time.ts (réexporté pour les tests).
export { startOf } from '../common/local-time';
