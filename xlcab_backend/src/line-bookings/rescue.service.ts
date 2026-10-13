import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverPenalty, LineDeparture, RecurringLine } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { localTimeOf } from '../common/local-time';
import { SYSTEM_USER } from '../matching/dispatch.service';
import { MatchingService } from '../matching/matching.service';
import { TripStatus, driverSeenKey, driverTripKey } from '../matching/matching.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { InviteBackupDto } from './dto';
import { assignedDriver } from './line-bookings.service';
import {
  CONTEST_DAYS,
  COUNTED_TRIGGERS,
  CREDIT_VALIDITY_DAYS,
  FAILED_RESCUE_CREDIT_PERCENT,
  OPEN_CALL_MAX,
  PENALTY_FROM_COUNT,
  PENALTY_WINDOW_DAYS,
  POSITION_CHECK_MIN,
  READY_DEADLINE_MIN,
  READY_REMINDER_MIN,
  RESCUE_DEADLINE_MIN,
  RESCUE_STAGES,
  RescueStage,
  isLastMinute,
  passengerShareCents,
  penaltyCents,
  rescueBonusCents,
  responseDeadline,
  splitCents,
} from './protocol.constants';

const DAY_MS = 24 * 3600_000;
const ACCEPTED = TripStatus.ACCEPTED as string;
const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

// Supprime driver:trip seulement s'il désigne encore une course du départ.
const DELETE_IF_IN = `
local v = redis.call('get', KEYS[1])
if v then
  for i = 1, #ARGV do
    if v == ARGV[i] then return redis.call('del', KEYS[1]) end
  end
end
return 0`;

export type FailureTrigger = 'driver_cancel' | 'not_ready' | 'no_position';

/**
 * Protocole d'annulation chauffeur sur les lignes régulières
 * (PROTOCOLE_ANNULATION_CHAUFFEUR.md). Quand le chauffeur d'un départ
 * réservé fait défaut, le départ passe « en recherche » : réserve n° 2,
 * puis n° 3, puis alerte à tous les opérateurs compatibles ; un incident
 * prévient l'équipe XLCAB dès le début. Le premier secours qui accepte
 * (écriture conditionnelle) reprend toutes les réservations ; sans secours
 * à T−30 min, les passagers sont remboursés et reçoivent un avoir.
 * Pénalité de 260 € à chaque annulation de dernière minute à partir de la
 * 3e sur 12 mois, après 7 jours de contestation possible.
 */
@Injectable()
export class RescueService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matching: MatchingService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  // ── Chauffeurs de réserve ───────────────────────────────────────────

  async backups(operatorId: string, lineId: string) {
    await this.ownedLine(operatorId, lineId);
    const rows = await this.prisma.lineBackup.findMany({ where: { lineId }, orderBy: { rank: 'asc' } });
    const [users, vehicles] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.driverId) } }, select: { id: true, firstName: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: rows.map((r) => r.vehicleId!).filter(Boolean) } } }),
    ]);
    return rows.map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicleId);
      return {
        id: r.id,
        rank: r.rank,
        status: r.status,
        firstName: users.find((u) => u.id === r.driverId)?.firstName ?? null,
        vehicle: v ? { brand: v.brand, model: v.model, capacity: v.capacity } : null,
      };
    });
  }

  async inviteBackup(operatorId: string, lineId: string, dto: InviteBackupDto) {
    const line = await this.ownedLine(operatorId, lineId);
    if (line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, role: 'driver', deletedAt: null } });
    if (!user) throw new NotFoundException('Aucun chauffeur XLCAB avec cet e-mail');
    if (user.id === operatorId) throw new BadRequestException('Le titulaire ne peut pas être sa propre réserve');
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: user.id } });
    if (!driver?.approvedAt) throw new BadRequestException('Ce chauffeur n’est pas encore validé par XLCAB');
    const other = await this.prisma.lineBackup.findFirst({ where: { lineId, driverId: user.id, rank: { not: dto.rank } } });
    if (other) throw new BadRequestException('Ce chauffeur est déjà réserve de cette ligne');

    const values = { driverId: user.id, status: 'invited', vehicleId: null, respondedAt: null };
    await this.prisma.lineBackup.upsert({
      where: { lineId_rank: { lineId, rank: dto.rank } },
      create: { lineId, rank: dto.rank, ...values },
      update: values,
    });
    await this.notifications.notify(user.id, 'line.backup.invite', 'Invitation chauffeur de réserve',
      'Un opérateur vous propose d’être chauffeur de réserve sur sa ligne.', { lineId });
    await this.audit.log({ userId: operatorId, action: 'line.backup.invite', entity: 'RecurringLine', entityId: lineId, metadata: { rank: dto.rank, driverId: user.id } });
    return this.backups(operatorId, lineId);
  }

  async removeBackup(operatorId: string, lineId: string, rank: number) {
    await this.ownedLine(operatorId, lineId);
    const { count } = await this.prisma.lineBackup.deleteMany({ where: { lineId, rank } });
    if (count === 0) throw new NotFoundException('Réserve introuvable');
    return { deleted: true };
  }

  /** Rôles de réserve proposés à ce chauffeur, avec la ligne concernée. */
  async myBackupRoles(driverId: string) {
    const rows = await this.prisma.lineBackup.findMany({ where: { driverId, status: { in: ['invited', 'accepted'] } } });
    const lines = await this.prisma.recurringLine.findMany({ where: { id: { in: rows.map((r) => r.lineId) } } });
    return rows.map((r) => {
      const l = lines.find((x) => x.id === r.lineId);
      return {
        id: r.id,
        rank: r.rank,
        status: r.status,
        vehicleId: r.vehicleId,
        line: l && {
          origin: l.originAddress, destination: l.destinationAddress, departureTime: l.departureTime,
          returnTime: l.returnTime, daysOfWeek: l.daysOfWeek, seats: l.seats, status: l.status,
        },
      };
    });
  }

  async respondBackup(driverId: string, backupId: string, accept: boolean, vehicleId?: string) {
    const backup = await this.prisma.lineBackup.findUnique({ where: { id: backupId } });
    if (!backup || backup.driverId !== driverId || !['invited', 'accepted'].includes(backup.status)) {
      throw new NotFoundException('Invitation introuvable');
    }
    const line = await this.prisma.recurringLine.findUnique({ where: { id: backup.lineId } });
    if (!line) throw new NotFoundException('Invitation introuvable');
    let data: Record<string, unknown> = { status: 'declined', respondedAt: new Date() };
    if (accept) {
      if (!vehicleId) throw new BadRequestException('Choisissez le véhicule de réserve');
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, driverId } });
      if (!vehicle) throw new NotFoundException('Véhicule introuvable');
      if (vehicle.capacity < line.seats) {
        throw new BadRequestException(`Il faut un véhicule d’au moins ${line.seats} places passagers pour cette ligne`);
      }
      data = { status: 'accepted', vehicleId, respondedAt: new Date() };
    }
    await this.prisma.lineBackup.update({ where: { id: backupId }, data });
    await this.notifications.notify(line.operatorId, 'line.backup.answer',
      accept ? 'Chauffeur de réserve confirmé' : 'Chauffeur de réserve indisponible',
      accept ? 'Un chauffeur a accepté d’être réserve sur votre ligne.' : 'Un chauffeur a décliné votre invitation de réserve.', { lineId: line.id });
    await this.audit.log({ userId: driverId, action: accept ? 'line.backup.accept' : 'line.backup.decline', entity: 'LineBackup', entityId: backupId });
    return { id: backupId, status: data.status };
  }

  // ── Défaillance du chauffeur ────────────────────────────────────────

  /** Le chauffeur annule son départ depuis l'app. */
  async cancelDeparture(driverId: string, departureId: string, reason: string, now = new Date()) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));
    if (!departure || !line || assignedDriver(departure, line) !== driverId || departure.rescueStatus === 'searching') {
      throw new NotFoundException('Départ introuvable');
    }
    if (departure.departureAt <= now) throw new ConflictException('Ce départ est déjà passé');
    const started = await this.prisma.trip.count({ where: { lineDepartureId: departureId, status: TripStatus.STARTED } });
    if (started > 0) throw new ConflictException('Course en cours : terminez-la ou contactez le support');

    if ((await this.passengerSeats(departureId)) === 0) {
      // Personne à transporter : le départ est simplement fermé à la vente.
      await this.prisma.lineDeparture.update({ where: { id: departureId }, data: { status: 'closed' } });
      await this.audit.log({ userId: driverId, action: 'line.departure.close', entity: 'LineDeparture', entityId: departureId, metadata: { reason } });
      return { departureId, rescue: false };
    }
    const result = await this.registerFailure(departure, line, driverId, 'driver_cancel', reason, now);
    return { departureId, rescue: true, ...result };
  }

  /**
   * Défaillance constatée (annulation, pas « en route » à T−60, plus de
   * position) : départ en recherche, annulation enregistrée (et pénalisée
   * s'il y a lieu), incident pour l'équipe, première étape de la cascade.
   */
  async registerFailure(d: LineDeparture, line: RecurringLine, driverId: string, trigger: FailureTrigger, reason: string | null, now: Date) {
    const { count } = await this.prisma.lineDeparture.updateMany({
      where: { id: d.id, rescueStatus: { in: ['none', 'rescued'] } },
      // driverId garde le chauffeur défaillant pendant la recherche (jamais re-sollicité).
      data: { rescueStatus: 'searching', rescueStage: null, driverId, driverReadyAt: null },
    });
    if (count === 0) return { counted: false, penaltyId: null };

    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: d.id, status: ACCEPTED }, select: { id: true } });
    // Les réservations quittent son planning ; le passager voit « chauffeur en cours de remplacement ».
    await this.prisma.trip.updateMany({ where: { lineDepartureId: d.id, status: ACCEPTED }, data: { driverId: null, vehicleId: null } });
    if (trips.length > 0) await this.redis.eval(DELETE_IF_IN, 1, driverTripKey(driverId), ...trips.map((t) => t.id));

    const lastMinute = isLastMinute(d.departureAt, now, line.timezone);
    const counted = lastMinute && COUNTED_TRIGGERS.includes(trigger);
    const cancellation = await this.prisma.driverCancellation.create({
      data: {
        driverId,
        departureId: d.id,
        trigger,
        reason,
        minutesBefore: Math.round((d.departureAt.getTime() - now.getTime()) / 60_000),
        lastMinute,
        status: counted ? 'counted' : 'not_counted',
      },
    });

    // L'équipe XLCAB est prévenue dès la défaillance (même canal que les SOS).
    if (trips[0]) {
      const outbound = d.direction === 'outbound';
      await this.prisma.incident.create({
        data: {
          type: 'departure_at_risk',
          tripId: trips[0].id,
          userId: driverId,
          role: 'driver',
          lat: outbound ? line.originLat : line.destinationLat,
          lng: outbound ? line.originLng : line.destinationLng,
          notes: `Départ ${d.id} (${d.localDate} ${localTimeOf(d.departureAt, line.timezone)}) : ${trigger}`,
        },
      });
    }

    const penaltyId = counted ? await this.countCancellation(driverId, cancellation.id, now) : null;
    if (!counted) {
      await this.notifications.notify(driverId, 'line.cancel.recorded', 'Annulation enregistrée',
        'Votre départ est confié à un chauffeur de secours.', { departureId: d.id });
    }
    await this.audit.log({
      userId: driverId, action: 'line.departure.failure', entity: 'LineDeparture', entityId: d.id,
      metadata: { trigger, lastMinute, counted, penaltyId, reason },
    });
    await this.advance(d.id, now);
    return { cancellationId: cancellation.id, counted, penaltyId };
  }

  /** Compteur sur 12 mois : avertissement, dernier avertissement, puis 260 € à chaque fois. */
  private async countCancellation(driverId: string, cancellationId: string, now: Date): Promise<string | null> {
    const counted = await this.prisma.driverCancellation.count({
      where: { driverId, status: 'counted', createdAt: { gte: new Date(now.getTime() - PENALTY_WINDOW_DAYS * DAY_MS) } },
    });
    if (counted < PENALTY_FROM_COUNT) {
      await this.notifications.notify(driverId, 'line.cancel.warning',
        counted === 1 ? 'Avertissement' : 'Dernier avertissement',
        counted === 1
          ? 'Annulation de dernière minute : vos passagers comptent sur vous. Au bout de la 3e, une pénalité s’applique.'
          : 'Deuxième annulation de dernière minute : la prochaine entraînera une pénalité.',
        { cancellationId });
      return null;
    }
    // Pénalité seulement si les conditions générales opérateur ont été acceptées.
    const operator = await this.prisma.operatorProfile.findUnique({ where: { id: driverId } });
    if (!operator?.termsAcceptedAt) {
      await this.audit.log({ action: 'line.penalty.not_applicable', entity: 'DriverCancellation', entityId: cancellationId, metadata: { reason: 'operator_terms_missing' } });
      return null;
    }
    const amountCents = penaltyCents();
    const penalty = await this.prisma.driverPenalty.create({
      data: { driverId, cancellationId, amountCents, contestUntil: new Date(now.getTime() + CONTEST_DAYS * DAY_MS) },
    });
    await this.notifications.notify(driverId, 'line.penalty', 'Pénalité d’annulation',
      `Annulation de dernière minute : pénalité de ${euros(amountCents)} €. Vous pouvez la contester pendant 7 jours.`, { penaltyId: penalty.id });
    return penalty.id;
  }

  // ── Cascade ─────────────────────────────────────────────────────────

  /** Étape suivante : réserve n° 2, n° 3, puis alerte générale. */
  async advance(departureId: string, now = new Date()) {
    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    if (!d || d.rescueStatus !== 'searching') return;
    const line = await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } });
    if (!line) return;
    const seats = await this.passengerSeats(d.id);
    if (seats === 0) {
      // Tous les passagers ont annulé entre-temps.
      await this.prisma.lineDeparture.update({ where: { id: d.id }, data: { rescueStatus: 'none', rescueStage: null, status: 'closed' } });
      return;
    }

    const excluded = new Set([
      ...(await this.prisma.driverCancellation.findMany({ where: { departureId: d.id }, select: { driverId: true } })).map((c) => c.driverId),
      ...(await this.prisma.rescueOffer.findMany({ where: { departureId: d.id }, select: { driverId: true } })).map((o) => o.driverId),
    ]);
    const from = d.rescueStage ? RESCUE_STAGES.indexOf(d.rescueStage as RescueStage) + 1 : 0;
    for (const stage of RESCUE_STAGES.slice(from)) {
      const candidates = await this.candidates(stage, line);
      const offers: { driverId: string; vehicleId: string | null }[] = [];
      for (const c of candidates) {
        if (excluded.has(c.driverId)) continue;
        const vehicleId = await this.eligibleVehicle(c.driverId, c.vehicleId, d, line, seats);
        if (vehicleId) offers.push({ driverId: c.driverId, vehicleId });
        if (offers.length >= OPEN_CALL_MAX) break;
      }
      if (offers.length === 0) continue;

      const hardStop = new Date(d.departureAt.getTime() - RESCUE_DEADLINE_MIN * 60_000);
      const expiresAt = stage === 'open' ? hardStop : responseDeadline(d.departureAt, now);
      for (const o of offers) {
        await this.prisma.rescueOffer.create({ data: { departureId: d.id, driverId: o.driverId, vehicleId: o.vehicleId, stage, expiresAt } });
        await this.notifications.notify(o.driverId, 'line.rescue.offer', 'Départ à reprendre en urgence',
          `${seats} passagers attendent un chauffeur à ${localTimeOf(d.departureAt, line.timezone)}. Répondez vite.`, { departureId: d.id });
      }
      await this.prisma.lineDeparture.update({ where: { id: d.id }, data: { rescueStage: stage } });
      await this.audit.log({ action: 'line.rescue.stage', entity: 'LineDeparture', entityId: d.id, metadata: { stage, offers: offers.length } });
      return;
    }
    // Plus personne à solliciter : l'équipe XLCAB (incident ouvert) prend la main jusqu'à T−30 min.
    if (d.rescueStage !== 'open') await this.prisma.lineDeparture.update({ where: { id: d.id }, data: { rescueStage: 'open' } });
  }

  private async candidates(stage: RescueStage, line: RecurringLine): Promise<{ driverId: string; vehicleId: string | null }[]> {
    if (stage !== 'open') {
      const backup = await this.prisma.lineBackup.findFirst({ where: { lineId: line.id, rank: stage === 'backup2' ? 2 : 3, status: 'accepted' } });
      return backup ? [{ driverId: backup.driverId, vehicleId: backup.vehicleId }] : [];
    }
    const operators = await this.prisma.operatorProfile.findMany({ where: { status: 'verified' }, select: { id: true } });
    return operators.filter((o) => o.id !== line.operatorId).map((o) => ({ driverId: o.id, vehicleId: null }));
  }

  /**
   * Le chauffeur peut-il reprendre ce départ ? Compte validé, opérateur
   * vérifié (licence pour la vente à la place), véhicule assez grand aux
   * documents valides au jour du départ, créneau libre. Renvoie le véhicule.
   */
  private async eligibleVehicle(driverId: string, vehicleId: string | null, d: LineDeparture, line: RecurringLine, seats: number): Promise<string | null> {
    const [driver, operator, user] = await Promise.all([
      this.prisma.driverProfile.findUnique({ where: { id: driverId } }),
      this.prisma.operatorProfile.findUnique({ where: { id: driverId } }),
      this.prisma.user.findUnique({ where: { id: driverId }, select: { deletedAt: true } }),
    ]);
    if (!driver?.approvedAt || !user || user.deletedAt || operator?.status !== 'verified') return null;
    if (d.pricingMode === 'per_seat' && !operator.perSeatAllowed) return null;

    const vehicles = await this.prisma.vehicle.findMany({ where: vehicleId ? { id: vehicleId, driverId } : { driverId }, orderBy: { capacity: 'asc' } });
    const valid = (date: Date | null) => !date || new Date(date) > d.departureAt;
    const vehicle = vehicles.find((v) => v.capacity >= seats && valid(v.insuranceExpiry) && valid(v.technicalControlExpiry));
    if (!vehicle) return null;
    const busy = await this.matching.busyDrivers([driverId], d.departureAt, line.durationMin);
    return busy.has(driverId) ? null : vehicle.id;
  }

  /** Offres de reprise en attente pour ce chauffeur. */
  async myOffers(driverId: string, now = new Date()) {
    const offers = await this.prisma.rescueOffer.findMany({ where: { driverId, status: 'pending', expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' } });
    const result = [];
    for (const o of offers) {
      const d = await this.prisma.lineDeparture.findUnique({ where: { id: o.departureId } });
      const line = d && (await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } }));
      if (!d || !line || d.rescueStatus !== 'searching') continue;
      const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: d.id, status: ACCEPTED }, select: { totalPriceCents: true } });
      const outbound = d.direction === 'outbound';
      result.push({
        id: o.id,
        stage: o.stage,
        expiresAt: o.expiresAt,
        departureId: d.id,
        departureAt: d.departureAt,
        localTime: localTimeOf(d.departureAt, line.timezone),
        origin: outbound ? line.originAddress : line.destinationAddress,
        destination: outbound ? line.destinationAddress : line.originAddress,
        passengers: await this.passengerSeats(d.id),
        totalPriceCents: trips.reduce((n, t) => n + (t.totalPriceCents ?? 0), 0),
        vehicleId: o.vehicleId,
      });
    }
    return result;
  }

  async respondOffer(driverId: string, offerId: string, accept: boolean, vehicleId?: string, now = new Date()) {
    const offer = await this.prisma.rescueOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) throw new NotFoundException('Offre introuvable');
    if (offer.status !== 'pending' || offer.expiresAt <= now) throw new ConflictException('Offre expirée ou déjà traitée');

    if (!accept) {
      await this.prisma.rescueOffer.update({ where: { id: offerId }, data: { status: 'declined', respondedAt: now } });
      await this.audit.log({ userId: driverId, action: 'line.rescue.decline', entity: 'RescueOffer', entityId: offerId });
      const pending = await this.prisma.rescueOffer.count({ where: { departureId: offer.departureId, status: 'pending' } });
      if (pending === 0) await this.advance(offer.departureId, now);
      return { declined: true };
    }
    const result = await this.takeOver(offer.departureId, driverId, vehicleId ?? offer.vehicleId, now, driverId);
    await this.prisma.rescueOffer.update({ where: { id: offerId }, data: { status: 'accepted', respondedAt: now } });
    return result;
  }

  /** Affectation manuelle par l'équipe XLCAB (dashboard admin). */
  async assignManually(adminId: string, departureId: string, driverId: string, vehicleId: string, now = new Date()) {
    return this.takeOver(departureId, driverId, vehicleId, now, adminId);
  }

  /** Reprise effective : le premier qui passe l'écriture conditionnelle gagne. */
  private async takeOver(departureId: string, driverId: string, vehicleId: string | null, now: Date, by: string) {
    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = d && (await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } }));
    if (!d || !line) throw new NotFoundException('Départ introuvable');
    if (d.rescueStatus !== 'searching') throw new ConflictException('Ce départ a déjà été repris');
    const failed = await this.prisma.driverCancellation.count({ where: { departureId, driverId } });
    const seats = await this.passengerSeats(departureId);
    const chosen = failed === 0 ? await this.eligibleVehicle(driverId, vehicleId, d, line, seats) : null;
    if (!chosen) throw new ConflictException('Votre véhicule ou votre planning ne permet pas de reprendre ce départ');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: chosen } });
    const { count } = await this.prisma.lineDeparture.updateMany({
      where: { id: departureId, rescueStatus: 'searching' },
      data: {
        rescueStatus: 'rescued',
        driverId,
        vehicleId: chosen,
        // Accepter une reprise vaut « je suis en route ».
        driverReadyAt: now,
        // Plus de vente au-delà de la capacité du véhicule de secours.
        seatsTotal: Math.max(d.seatsBooked, Math.min(d.seatsTotal, vehicle?.capacity ?? d.seatsTotal)),
      },
    });
    if (count === 0) throw new ConflictException('Ce départ a déjà été repris');

    await this.prisma.rescueOffer.updateMany({ where: { departureId, status: 'pending', driverId: { not: driverId } }, data: { status: 'cancelled' } });
    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: departureId, status: ACCEPTED }, select: { id: true, passengerId: true } });
    await this.prisma.trip.updateMany({ where: { lineDepartureId: departureId, status: ACCEPTED }, data: { driverId, vehicleId: chosen } });
    await this.prisma.incident.updateMany({
      where: { type: 'departure_at_risk', tripId: { in: trips.map((t) => t.id) }, status: { in: ['open', 'acknowledged'] } },
      data: { status: 'resolved', resolvedBy: by, resolvedAt: now },
    });

    const rescuer = await this.prisma.user.findUnique({ where: { id: driverId }, select: { firstName: true } });
    const model = vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') : '';
    for (const t of trips) {
      if (!t.passengerId) continue;
      await this.notifications.notify(t.passengerId, 'line.driver_changed', 'Votre chauffeur a changé',
        `${rescuer?.firstName ?? 'Un chauffeur XLCAB'} assurera votre trajet, à l’heure prévue${model ? ` (${model})` : ''}.`, { tripId: t.id });
    }
    await this.notifications.notify(driverId, 'line.rescue.confirmed', 'Départ repris',
      `Merci ! ${seats} passagers vous attendent à ${localTimeOf(d.departureAt, line.timezone)}.`, { departureId });
    await this.audit.log({ userId: by, action: 'line.rescue.takeover', entity: 'LineDeparture', entityId: departureId, metadata: { driverId, vehicleId: chosen } });
    return { departureId, rescued: true, passengers: seats, departureAt: d.departureAt };
  }

  /** Aucun secours à T−30 min : annulation sans frais, remboursement intégral, avoir de 20 %. */
  private async fail(d: LineDeparture, now: Date) {
    const { count } = await this.prisma.lineDeparture.updateMany({
      where: { id: d.id, rescueStatus: 'searching' },
      data: { rescueStatus: 'failed', status: 'closed' },
    });
    if (count === 0) return 0;
    await this.prisma.rescueOffer.updateMany({ where: { departureId: d.id, status: 'pending' }, data: { status: 'cancelled' } });
    const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: d.id, status: ACCEPTED } });
    for (const t of trips) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: t.id, status: ACCEPTED },
        data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason: 'Aucun chauffeur de remplacement disponible', cancellationFeeCents: 0 },
      });
      if (updated.count === 0) continue;
      await this.payments.refundForCancellation(t.id, 0);
      const credit = Math.round(((t.totalPriceCents ?? 0) * FAILED_RESCUE_CREDIT_PERCENT) / 100);
      if (t.passengerId && credit > 0) {
        await this.prisma.passengerCredit.create({
          data: { userId: t.passengerId, tripId: t.id, amountCents: credit, reason: 'rescue_failed', expiresAt: new Date(now.getTime() + CREDIT_VALIDITY_DAYS * DAY_MS) },
        });
      }
      if (t.passengerId) {
        await this.notifications.notify(t.passengerId, 'line.cancelled_no_driver', 'Trajet annulé',
          `Votre chauffeur n’a pas pu être remplacé : vous êtes remboursé intégralement et recevez un avoir de ${euros(credit)} €.`, { tripId: t.id });
      }
    }
    await this.audit.log({ userId: SYSTEM_USER.sub, action: 'line.rescue.failed', entity: 'LineDeparture', entityId: d.id, metadata: { trips: trips.length } });
    return 1;
  }

  // ── Contrôles du planificateur (chaque minute) ──────────────────────

  async tick(now = new Date()) {
    const report = { advanced: 0, failed: 0, reminders: 0, failures: 0, penaltiesApplied: 0 };

    // 1. Offres expirées : étape suivante quand plus aucune n'est en attente.
    const expired = await this.prisma.rescueOffer.findMany({ where: { status: 'pending', expiresAt: { lte: now } } });
    if (expired.length > 0) {
      await this.prisma.rescueOffer.updateMany({ where: { id: { in: expired.map((o) => o.id) } }, data: { status: 'expired' } });
      for (const departureId of new Set(expired.map((o) => o.departureId))) {
        const pending = await this.prisma.rescueOffer.count({ where: { departureId, status: 'pending' } });
        if (pending === 0) {
          await this.advance(departureId, now);
          report.advanced++;
        }
      }
    }

    // 2. Toujours sans secours à T−30 min : échec du protocole.
    const deadline = new Date(now.getTime() + RESCUE_DEADLINE_MIN * 60_000);
    const late = await this.prisma.lineDeparture.findMany({ where: { rescueStatus: 'searching', departureAt: { lte: deadline } } });
    for (const d of late) report.failed += await this.fail(d, now);

    // 3. Contrôles avant départ : rappel T−75, « en route » à T−60, position à T−45.
    const soon = await this.prisma.lineDeparture.findMany({
      where: { departureAt: { gt: now, lte: new Date(now.getTime() + READY_REMINDER_MIN * 60_000) }, seatsBooked: { gt: 0 }, rescueStatus: { in: ['none', 'rescued'] } },
    });
    for (const d of soon) {
      const line = await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } });
      if (!line) continue;
      const accepted = await this.prisma.trip.count({ where: { lineDepartureId: d.id, status: ACCEPTED } });
      const started = await this.prisma.trip.count({ where: { lineDepartureId: d.id, status: TripStatus.STARTED } });
      if (accepted === 0 || started > 0) continue;
      const driverId = assignedDriver(d, line);
      const minutesLeft = (d.departureAt.getTime() - now.getTime()) / 60_000;

      if (!d.driverReadyAt) {
        if (minutesLeft <= READY_DEADLINE_MIN) {
          await this.registerFailure(d, line, driverId, 'not_ready', null, now);
          report.failures++;
        } else if ((await this.redis.set(`line:ready:remind:${d.id}`, '1', 'EX', 3 * 3600, 'NX')) === 'OK') {
          await this.notifications.notify(driverId, 'line.ready.reminder', 'Confirmez votre départ',
            `Départ à ${localTimeOf(d.departureAt, line.timezone)} : appuyez sur « Je suis en route » avant ${READY_DEADLINE_MIN} min du départ, sinon un chauffeur de secours sera sollicité.`, { departureId: d.id });
          report.reminders++;
        }
        continue;
      }
      if (minutesLeft <= POSITION_CHECK_MIN) {
        const key = `line:nopos:${d.id}`;
        if (await this.redis.exists(driverSeenKey(driverId))) {
          await this.redis.del(key);
        } else {
          // Deux contrôles d'affilée sans position : pas de déclenchement sur une simple coupure.
          const misses = await this.redis.incr(key);
          if (misses === 1) await this.redis.expire(key, 15 * 60);
          if (misses >= 2) {
            await this.registerFailure(d, line, driverId, 'no_position', null, now);
            report.failures++;
          }
        }
      }
    }

    // 4. Pénalités non contestées dans le délai : appliquées.
    const due = await this.prisma.driverPenalty.findMany({ where: { status: 'pending', contestUntil: { lte: now } } });
    for (const p of due) report.penaltiesApplied += await this.applyPenalty(p, now, SYSTEM_USER.sub, null);
    return report;
  }

  // ── Pénalités et justificatifs ──────────────────────────────────────

  /** 260 € dus ; 160 € au chauffeur qui a repris le départ, 100 € d'avoirs aux passagers. */
  private async applyPenalty(p: DriverPenalty, now: Date, by: string, reason: string | null): Promise<number> {
    const { count } = await this.prisma.driverPenalty.updateMany({
      where: { id: p.id, status: { in: ['pending', 'contested'] } },
      data: { status: 'applied', decidedAt: now, decidedBy: by, decisionReason: reason },
    });
    if (count === 0) return 0;
    const cancellation = await this.prisma.driverCancellation.findUnique({ where: { id: p.cancellationId } });
    const d = cancellation && (await this.prisma.lineDeparture.findUnique({ where: { id: cancellation.departureId } }));
    if (d?.rescueStatus === 'rescued' && d.driverId && d.driverId !== p.driverId) {
      await this.prisma.driverBonus.create({ data: { driverId: d.driverId, departureId: d.id, penaltyId: p.id, amountCents: rescueBonusCents() } });
      await this.notifications.notify(d.driverId, 'line.rescue.bonus', 'Bonus de reprise',
        `Merci d’avoir sauvé un départ : bonus de ${euros(rescueBonusCents())} €.`, { departureId: d.id });
    }
    if (d) {
      const trips = await this.prisma.trip.findMany({ where: { lineDepartureId: d.id }, select: { id: true, passengerId: true } });
      const passengers = [...new Set(trips.map((t) => t.passengerId).filter((x): x is string => Boolean(x)))];
      const shares = splitCents(passengerShareCents(), passengers.length);
      for (const [i, userId] of passengers.entries()) {
        await this.prisma.passengerCredit.create({
          data: { userId, amountCents: shares[i], reason: 'driver_penalty', expiresAt: new Date(now.getTime() + CREDIT_VALIDITY_DAYS * DAY_MS) },
        });
        await this.notifications.notify(userId, 'line.credit', 'Avoir XLCAB',
          `Suite au changement de chauffeur sur votre trajet, un avoir de ${euros(shares[i])} € vous est offert.`, {});
      }
    }
    await this.notifications.notify(p.driverId, 'line.penalty.applied', 'Pénalité appliquée',
      `La pénalité de ${euros(p.amountCents)} € sera retenue sur vos prochains versements.`, { penaltyId: p.id });
    await this.audit.log({ userId: by, action: 'line.penalty.apply', entity: 'DriverPenalty', entityId: p.id, metadata: { amountCents: p.amountCents, reason } });
    return 1;
  }

  async myCancellations(driverId: string) {
    const rows = await this.prisma.driverCancellation.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const penalties = await this.prisma.driverPenalty.findMany({ where: { cancellationId: { in: rows.map((r) => r.id) } } });
    return rows.map((r) => {
      const p = penalties.find((x) => x.cancellationId === r.id);
      return {
        id: r.id, departureId: r.departureId, trigger: r.trigger, minutesBefore: r.minutesBefore, lastMinute: r.lastMinute,
        status: r.status, createdAt: r.createdAt,
        penalty: p ? { id: p.id, amountCents: p.amountCents, status: p.status, contestUntil: p.contestUntil, collectedCents: p.collectedCents } : null,
      };
    });
  }

  /** Force majeure : justificatif soumis à l'équipe ; la pénalité éventuelle est suspendue. */
  async justify(driverId: string, cancellationId: string, justification: string, now = new Date()) {
    const c = await this.prisma.driverCancellation.findUnique({ where: { id: cancellationId } });
    if (!c || c.driverId !== driverId) throw new NotFoundException('Annulation introuvable');
    if (c.status !== 'counted') throw new ConflictException('Cette annulation n’attend pas de justificatif');
    if (now.getTime() - c.createdAt.getTime() > CONTEST_DAYS * DAY_MS) throw new ConflictException('Délai de 7 jours dépassé');
    await this.prisma.driverCancellation.update({ where: { id: c.id }, data: { status: 'justification_pending', justification } });
    await this.prisma.driverPenalty.updateMany({ where: { cancellationId: c.id, status: 'pending' }, data: { status: 'contested', contestReason: justification } });
    await this.audit.log({ userId: driverId, action: 'line.cancellation.justify', entity: 'DriverCancellation', entityId: c.id });
    return { id: c.id, status: 'justification_pending' };
  }

  async contest(driverId: string, penaltyId: string, reason: string, now = new Date()) {
    const p = await this.prisma.driverPenalty.findUnique({ where: { id: penaltyId } });
    if (!p || p.driverId !== driverId) throw new NotFoundException('Pénalité introuvable');
    if (p.status !== 'pending' || p.contestUntil <= now) throw new ConflictException('Cette pénalité ne peut plus être contestée');
    await this.prisma.driverPenalty.update({ where: { id: p.id }, data: { status: 'contested', contestReason: reason } });
    await this.audit.log({ userId: driverId, action: 'line.penalty.contest', entity: 'DriverPenalty', entityId: p.id });
    return { id: p.id, status: 'contested' };
  }

  // ── Équipe XLCAB ────────────────────────────────────────────────────

  async atRisk(now = new Date()) {
    const rows = await this.prisma.lineDeparture.findMany({
      where: { rescueStatus: { in: ['searching', 'failed'] }, departureAt: { gt: new Date(now.getTime() - DAY_MS) } },
      orderBy: { departureAt: 'asc' },
    });
    const result = [];
    for (const d of rows) {
      const line = await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } });
      const offers = await this.prisma.rescueOffer.findMany({ where: { departureId: d.id } });
      const names = await this.names([d.driverId, ...offers.map((o) => o.driverId)]);
      const outbound = d.direction === 'outbound';
      result.push({
        departureId: d.id,
        departureAt: d.departureAt,
        rescueStatus: d.rescueStatus,
        rescueStage: d.rescueStage,
        failedDriverId: d.driverId,
        failedDriverName: d.driverId ? names.get(d.driverId) ?? null : null,
        origin: line ? (outbound ? line.originAddress : line.destinationAddress) : null,
        destination: line ? (outbound ? line.destinationAddress : line.originAddress) : null,
        passengers: await this.passengerSeats(d.id),
        offers: offers.map((o) => ({ driverId: o.driverId, name: names.get(o.driverId) ?? null, stage: o.stage, status: o.status, expiresAt: o.expiresAt })),
      });
    }
    return result;
  }

  /** Chauffeurs qui peuvent reprendre ce départ (affectation manuelle par l'équipe). */
  async rescueCandidates(departureId: string) {
    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = d && (await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } }));
    if (!d || !line) throw new NotFoundException('Départ introuvable');
    const seats = await this.passengerSeats(departureId);
    const failed = new Set((await this.prisma.driverCancellation.findMany({ where: { departureId }, select: { driverId: true } })).map((c) => c.driverId));
    const operators = await this.prisma.operatorProfile.findMany({ where: { status: 'verified' }, select: { id: true } });
    const result = [];
    for (const o of operators) {
      if (failed.has(o.id)) continue;
      const vehicleId = await this.eligibleVehicle(o.id, null, d, line, seats);
      if (!vehicleId) continue;
      const [user, vehicle] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: o.id }, select: { firstName: true, lastName: true, phone: true } }),
        this.prisma.vehicle.findUnique({ where: { id: vehicleId } }),
      ]);
      result.push({
        driverId: o.id,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
        // Téléphone : l'équipe doit pouvoir appeler le chauffeur en urgence.
        phone: user?.phone ?? null,
        vehicleId,
        vehicle: vehicle ? [vehicle.brand, vehicle.model].filter(Boolean).join(' ') : null,
        capacity: vehicle?.capacity ?? null,
      });
    }
    return result;
  }

  async listCancellations(status?: string) {
    const rows = await this.prisma.driverCancellation.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 100 });
    const names = await this.names(rows.map((r) => r.driverId));
    return rows.map((r) => ({ ...r, driverName: names.get(r.driverId) ?? null }));
  }

  async listPenalties(status?: string) {
    const rows = await this.prisma.driverPenalty.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 100 });
    const names = await this.names(rows.map((r) => r.driverId));
    return rows.map((r) => ({ ...r, driverName: names.get(r.driverId) ?? null }));
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true, email: true } });
    return new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));
  }

  async reviewCancellation(adminId: string, id: string, status: 'counted' | 'justified' | 'waived', reason: string, now = new Date()) {
    const c = await this.prisma.driverCancellation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Annulation introuvable');
    if (!c.lastMinute && status === 'counted') throw new BadRequestException('Annulation prévenue à temps : elle ne peut pas compter');
    await this.prisma.driverCancellation.update({ where: { id }, data: { status, reviewedBy: adminId, reviewedAt: now } });
    if (status !== 'counted') {
      await this.prisma.driverPenalty.updateMany({
        where: { cancellationId: id, status: { in: ['pending', 'contested'] } },
        data: { status: 'cancelled', decidedBy: adminId, decidedAt: now, decisionReason: reason },
      });
    }
    await this.notifications.notify(c.driverId, 'line.cancellation.review', 'Annulation examinée',
      status === 'counted' ? 'Votre justificatif n’a pas été retenu.' : 'Votre annulation n’est pas comptée.', { cancellationId: id });
    await this.audit.log({ userId: adminId, action: 'line.cancellation.review', entity: 'DriverCancellation', entityId: id, metadata: { status, reason } });
    return { id, status };
  }

  async decidePenalty(adminId: string, id: string, decision: 'uphold' | 'cancel', reason: string, now = new Date()) {
    const p = await this.prisma.driverPenalty.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pénalité introuvable');
    if (!['pending', 'contested'].includes(p.status)) throw new ConflictException('Pénalité déjà tranchée');
    if (decision === 'uphold') {
      await this.applyPenalty(p, now, adminId, reason);
      return { id, status: 'applied' };
    }
    await this.prisma.driverPenalty.update({ where: { id }, data: { status: 'cancelled', decidedBy: adminId, decidedAt: now, decisionReason: reason } });
    await this.notifications.notify(p.driverId, 'line.penalty.cancelled', 'Pénalité annulée', 'Votre contestation a été acceptée.', { penaltyId: id });
    await this.audit.log({ userId: adminId, action: 'line.penalty.cancel', entity: 'DriverPenalty', entityId: id, metadata: { reason } });
    return { id, status: 'cancelled' };
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  /** Passagers à transporter (places des réservations encore actives). */
  private async passengerSeats(departureId: string): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: { lineDepartureId: departureId, status: { in: [ACCEPTED, TripStatus.STARTED] } },
      include: { passengerBooking: true },
    });
    return trips.reduce((n, t) => n + (t.passengerBooking?.seats ?? 0), 0);
  }

  private async ownedLine(operatorId: string, lineId: string) {
    const line = await this.prisma.recurringLine.findFirst({ where: { id: lineId, operatorId } });
    if (!line) throw new NotFoundException('Ligne introuvable');
    return line;
  }
}
