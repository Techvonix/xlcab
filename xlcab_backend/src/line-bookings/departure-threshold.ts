import { Injectable } from '@nestjs/common';
import { LineDeparture, RecurringLine } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { localTimeOf } from '../common/local-time';
import { SYSTEM_USER } from '../matching/dispatch.service';
import { TripStatus, driverTripKey } from '../matching/matching.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { LinesService } from '../operators/lines.service';
import { thresholdDeadline } from '../operators/line-schedule';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Pourquoi un départ à seuil est libéré sans avoir eu lieu. */
export type ThresholdRelease = 'threshold_missed' | 'driver_withdrew';

const OPEN_TRIPS = [TripStatus.ACCEPTED, TripStatus.AWAITING_PAYMENT] as string[];

/**
 * Seuil de départ garanti (CLARIFICATION_MODELE.md, section 4.5, décisions
 * D2 à D4 du 2026-10-14). Un départ à seuil n'engage le chauffeur qu'une fois
 * le seuil atteint (LinesService.guaranteeIfReached). Seuil non atteint à
 * l'échéance (24 h avant le départ, réglable par pays) — ou chauffeur qui se
 * retire avant le seuil — : le départ est annulé sans frais pour personne,
 * chaque passager est remboursé intégralement et invité à chercher un autre
 * départ ; aucune pénalité pour le chauffeur, qui ne s'était pas encore engagé.
 */
@Injectable()
export class DepartureThresholdService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private lines: LinesService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  /** Planificateur (chaque minute) : départs à seuil non atteint arrivés à échéance. */
  async tick(now = new Date()) {
    const report = { released: 0, cancelledBookings: 0 };
    const candidates = await this.prisma.lineDeparture.findMany({
      where: { status: 'open', guaranteedAt: null, thresholdMissedAt: null, minPassengers: { not: null }, departureAt: { gt: now } },
      take: 200,
    });
    for (const d of candidates) {
      if (d.minPassengers === null || d.minPassengers === undefined) continue;
      const line = await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } });
      if (!line) continue;
      const deadline = thresholdDeadline(new Date(d.departureAt), await this.lines.thresholdHours(line.jurisdiction));
      if (now < deadline) continue;
      // Dernière chance : un paiement arrivé juste avant l'échéance a pu atteindre le seuil.
      if (await this.lines.guaranteeIfReached(d.id, now)) continue;
      const cancelled = await this.release(d, line, 'threshold_missed', now);
      if (cancelled !== null) {
        report.released++;
        report.cancelledBookings += cancelled;
      }
    }
    return report;
  }

  /**
   * Annule un départ pas encore garanti et toutes ses réservations, sans frais.
   * Renvoie le nombre de réservations annulées, ou null si le départ était
   * déjà garanti ou libéré (écriture conditionnelle : un seul passage).
   */
  async release(d: LineDeparture, line: RecurringLine, reason: ThresholdRelease, now: Date): Promise<number | null> {
    const { count } = await this.prisma.lineDeparture.updateMany({
      where: { id: d.id, guaranteedAt: null, thresholdMissedAt: null },
      data: { status: 'closed', thresholdMissedAt: now },
    });
    if (count === 0) return null;

    const driverId = d.driverId ?? line.operatorId;
    const time = localTimeOf(new Date(d.departureAt), line.timezone);
    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: d.id, status: { in: OPEN_TRIPS } } });
    const cancellationReason = reason === 'threshold_missed'
      ? 'Départ non confirmé : nombre minimum de passagers non atteint'
      : 'Départ retiré par le chauffeur avant d’être confirmé';
    let cancelled = 0;
    for (const t of trips) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: t.id, status: t.status },
        data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason, cancellationFeeCents: 0 },
      });
      if (updated.count === 0) continue;
      cancelled++;
      if (t.type === 'parcel') await this.prisma.parcelBooking.updateMany({ where: { tripId: t.id, status: 'pending' }, data: { status: 'cancelled' } });
      const booking = await this.prisma.passengerBooking.findUnique({ where: { tripId: t.id }, select: { seats: true } });
      await this.lines.releaseSeats(d.id, booking?.seats ?? 0, t.id);
      // Payée : remboursement intégral. Paiement encore en cours : s'il aboutit,
      // markPaid rembourse automatiquement une course déjà annulée.
      if (t.status === TripStatus.ACCEPTED) await this.payments.refundForCancellation(t.id, 0);
      if (t.passengerId) {
        await this.notifications.notify(t.passengerId, 'line.threshold_missed', 'Départ non confirmé',
          reason === 'threshold_missed'
            ? `Le départ de ${time} n’a pas réuni assez de passagers : votre réservation est annulée et intégralement remboursée. D’autres départs vous attendent dans « Trouver une place ».`
            : `Le chauffeur a retiré le départ de ${time} avant qu’il soit confirmé : votre réservation est annulée et intégralement remboursée.`,
          { tripId: t.id, departureId: d.id });
      }
    }
    // Course active déjà posée pour ce chauffeur (départ proche) : retirée.
    const active = await this.redis.get(driverTripKey(driverId));
    if (active && trips.some((t) => t.id === active)) await this.redis.del(driverTripKey(driverId));

    if (reason === 'threshold_missed' && trips.length > 0) {
      await this.notifications.notify(driverId, 'line.threshold_missed.driver', 'Départ non confirmé',
        `Seuil non atteint pour votre départ de ${time} : il est annulé et les passagers sont remboursés. Aucune pénalité.`, { departureId: d.id });
    }
    await this.audit.log({
      userId: reason === 'driver_withdrew' ? driverId : SYSTEM_USER.sub,
      action: 'line.departure.threshold_release', entity: 'LineDeparture', entityId: d.id,
      metadata: { reason, cancelled, minPassengers: d.minPassengers },
    });
    return cancelled;
  }
}
