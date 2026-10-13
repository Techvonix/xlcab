import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LineDeparture, RecurringLine } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TIMEZONES, addDays, localDateOf, localTimeOf, minutesOf } from '../common/local-time';
import { haversineKm } from '../parcels/parcels.constants';
import { PayoutAccountsService } from '../payouts/payout-accounts';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmDeparturesDto,
  CreateLineDto,
  DeparturesQueryDto,
  LineExceptionDto,
  LineSearchDto,
  OperatorProfileDto,
  UpdateLineDto,
} from './dto';
import {
  LINE_BOOKING_LEAD_MIN,
  LINE_HORIZON_DAYS,
  MAX_LINES_PER_OPERATOR,
  PlannedDeparture,
  bookable,
  departureKey,
  operatorTermsVersion,
  plannedDepartures,
  priceFor,
} from './line-schedule';

type Line = RecurringLine;
type Departure = LineDeparture;

/** Écart par défaut autour de l'heure demandée dans la recherche. */
const DEFAULT_FLEX_MIN = 180;
const SEARCH_LIMIT = 20;

/** Raison d'un résultat de recherche, traduite par l'app (jamais de texte ici). */
export type MatchReason =
  | { code: 'pickup'; km: number }
  | { code: 'dropoff'; km: number }
  | { code: 'time'; diffMin: number }
  | { code: 'seats_left'; count: number }
  | { code: 'private_vehicle' }
  | { code: 'verified_operator' };

const round1 = (km: number) => Math.round(km * 10) / 10;

/**
 * Lignes régulières des opérateurs (bourse de transport, étape 1).
 *
 * Une ligne est un trajet type + un calendrier ; ses départs réels sont
 * générés 30 jours à l'avance (`sync`) et ne deviennent réservables qu'une
 * fois confirmés par l'opérateur : une ligne publiée n'est jamais présentée
 * comme disponible à des dates où l'opérateur n'a pas confirmé sa capacité.
 * Un départ qui a des réservations est figé (heure, prix) : modifier ou
 * fermer la ligne ne touche pas l'engagement pris envers les passagers.
 */
@Injectable()
export class LinesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private payouts: PayoutAccountsService,
  ) {}

  // ── Profil opérateur ────────────────────────────────────────────────

  async profile(userId: string) {
    const p = await this.prisma.operatorProfile.findUnique({ where: { id: userId } });
    if (p) return publicProfile(p);
    return {
      kind: 'independent', legalName: null, siret: null, transportLicense: null, cities: [], services: [],
      description: null, status: 'pending', perSeatAllowed: false, verifiedAt: null,
      termsAccepted: false, termsVersion: operatorTermsVersion(),
    };
  }

  async saveProfile(userId: string, dto: OperatorProfileDto) {
    await this.driverProfileOf(userId);
    const current = await this.prisma.operatorProfile.findUnique({ where: { id: userId } });
    const license = dto.transportLicense || null;
    const data: Record<string, unknown> = {
      kind: dto.kind,
      legalName: dto.legalName || null,
      siret: dto.siret || null,
      transportLicense: license,
      cities: dto.cities ?? [],
      services: dto.services ?? [],
      description: dto.description || null,
    };
    // Une nouvelle licence doit être revérifiée avant toute vente à la place.
    const licenseChanged = current && (current.transportLicense ?? null) !== license;
    if (licenseChanged) data.perSeatAllowed = false;
    if (dto.acceptTerms) {
      if (dto.termsVersion !== operatorTermsVersion()) {
        throw new BadRequestException('Les conditions générales opérateur ont changé : relisez-les avant de les accepter');
      }
      data.termsAcceptedAt = new Date();
      data.termsVersion = dto.termsVersion;
    }
    const saved = await this.prisma.operatorProfile.upsert({
      where: { id: userId },
      create: { id: userId, ...data },
      update: data,
    });
    if (licenseChanged) {
      await this.audit.log({ userId, action: 'operator.license.change', entity: 'OperatorProfile', entityId: userId });
    }
    if (dto.acceptTerms) {
      await this.audit.log({ userId, action: 'operator.terms.accept', entity: 'OperatorProfile', entityId: userId, metadata: { version: dto.termsVersion } });
    }
    return publicProfile(saved);
  }

  /** Véhicules du chauffeur (choix du véhicule d'une ligne, d'une réserve, d'une proposition). */
  async vehicles(userId: string) {
    const rows = await this.prisma.vehicle.findMany({ where: { driverId: userId }, orderBy: { capacity: 'asc' } });
    return rows.map((v) => ({
      id: v.id, brand: v.brand, model: v.model, plate: v.plate, capacity: v.capacity, shuttleType: v.shuttleType, accessible: v.pmrEquipped,
    }));
  }

  // ── Lignes ──────────────────────────────────────────────────────────

  async lines(userId: string) {
    const lines = await this.prisma.recurringLine.findMany({ where: { operatorId: userId }, orderBy: { createdAt: 'desc' } });
    const ids = lines.map((l: Line) => l.id);
    const [exceptions, pending] = await Promise.all([
      this.prisma.lineException.findMany({ where: { lineId: { in: ids } }, orderBy: { date: 'asc' } }),
      this.prisma.lineDeparture.findMany({ where: { lineId: { in: ids }, status: 'to_confirm' }, select: { lineId: true } }),
    ]);
    return lines.map((l: Line) => ({
      ...lineView(l),
      exceptions: exceptions.filter((e) => e.lineId === l.id).map((e) => ({ date: e.date, seats: e.seats, reason: e.reason })),
      departuresToConfirm: pending.filter((d: Departure) => d.lineId === l.id).length,
    }));
  }

  async create(userId: string, dto: CreateLineDto, now = new Date()) {
    await this.approvedDriver(userId);
    await this.termsAccepted(userId);
    await this.checkPricing(userId, dto.pricingMode);
    const vehicle = await this.ownedVehicle(userId, dto.vehicleId, dto.seats);
    const timezone = TIMEZONES[vehicle.jurisdiction] ?? TIMEZONES.FR;
    const today = localDateOf(now, timezone);
    if (dto.startDate < today) throw new BadRequestException('La date de début ne peut pas être passée');
    checkSchedule({ ...dto, returnTime: dto.returnTime ?? null, endDate: dto.endDate ?? null });

    const open = await this.prisma.recurringLine.count({ where: { operatorId: userId, status: { in: ['active', 'paused'] } } });
    if (open >= MAX_LINES_PER_OPERATOR) {
      throw new BadRequestException(`${MAX_LINES_PER_OPERATOR} lignes au maximum : fermez-en une d’abord`);
    }

    const line = await this.prisma.recurringLine.create({
      data: {
        operatorId: userId,
        vehicleId: dto.vehicleId,
        originAddress: dto.originAddress,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destinationAddress: dto.destinationAddress,
        destinationLat: dto.destinationLat,
        destinationLng: dto.destinationLng,
        pickupRadiusKm: dto.pickupRadiusKm ?? 5,
        departureTime: dto.departureTime,
        returnTime: dto.returnTime ?? null,
        timezone,
        jurisdiction: vehicle.jurisdiction,
        daysOfWeek: [...dto.daysOfWeek].sort(),
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
        seats: dto.seats,
        luggage: dto.luggage,
        pricingMode: dto.pricingMode,
        priceCents: dto.priceCents,
        durationMin: dto.durationMin ?? null,
        conditions: dto.conditions || null,
        status: 'active',
      },
    });
    await this.sync(line, now);
    await this.audit.log({ userId, action: 'line.create', entity: 'RecurringLine', entityId: line.id });
    return lineView(line);
  }

  async update(userId: string, lineId: string, dto: UpdateLineDto, now = new Date()) {
    const line = await this.ownedLine(userId, lineId);
    if (line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');
    const next = { ...line, ...dto };
    if (dto.daysOfWeek) next.daysOfWeek = [...dto.daysOfWeek].sort();
    if (dto.pricingMode) await this.checkPricing(userId, dto.pricingMode);
    if (dto.vehicleId || dto.seats) await this.ownedVehicle(userId, next.vehicleId, next.seats);
    checkSchedule(next);
    if (next.endDate && next.endDate < localDateOf(now, line.timezone)) {
      throw new BadRequestException('La date de fin ne peut pas être passée');
    }

    const data: Record<string, unknown> = {};
    for (const key of Object.keys(dto)) data[key] = (next as Record<string, unknown>)[key] ?? null;
    if (dto.conditions !== undefined) data.conditions = dto.conditions || null;
    const updated = await this.prisma.recurringLine.update({ where: { id: lineId }, data });
    const report = await this.sync(updated, now);
    await this.audit.log({
      userId, action: 'line.update', entity: 'RecurringLine', entityId: lineId, metadata: { fields: Object.keys(dto) },
    });
    // Départs déjà réservés que le nouveau calendrier ne prévoit plus :
    // conservés (les passagers seront transportés), fermés à la vente.
    return { ...lineView(updated), keptBookedDepartures: report.keptBooked };
  }

  async setStatus(userId: string, lineId: string, status: 'active' | 'paused' | 'closed', now = new Date()) {
    const line = await this.ownedLine(userId, lineId);
    if (line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');
    if (line.status === status) return lineView(line);
    const updated = await this.prisma.recurringLine.update({
      where: { id: lineId },
      data: { status, closedAt: status === 'closed' ? now : null },
    });
    const report = await this.sync(updated, now);
    await this.audit.log({ userId, action: `line.${status === 'active' ? 'resume' : status === 'paused' ? 'pause' : 'close'}`, entity: 'RecurringLine', entityId: lineId });
    return { ...lineView(updated), keptBookedDepartures: report.keptBooked };
  }

  async addException(userId: string, lineId: string, dto: LineExceptionDto, now = new Date()) {
    const line = await this.ownedLine(userId, lineId);
    if (line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');
    if (dto.date < localDateOf(now, line.timezone)) throw new BadRequestException('Date passée');

    // Un jour où des places sont vendues ne se ferme pas d'ici : les
    // passagers doivent être prévenus et remboursés (support XLCAB).
    const booked = await this.prisma.lineDeparture.findMany({ where: { lineId, localDate: dto.date } });
    const maxBooked = Math.max(0, ...booked.map((d: Departure) => d.seatsBooked));
    if (dto.seats === undefined && maxBooked > 0) {
      throw new ConflictException(`Des places sont déjà réservées le ${dto.date} : contactez le support XLCAB pour annuler ces réservations`);
    }
    if (dto.seats !== undefined && dto.seats < maxBooked) {
      throw new ConflictException(`${maxBooked} places sont déjà réservées le ${dto.date}`);
    }

    const values = { seats: dto.seats ?? null, reason: dto.reason || null };
    await this.prisma.lineException.upsert({
      where: { lineId_date: { lineId, date: dto.date } },
      create: { lineId, date: dto.date, ...values },
      update: values,
    });
    await this.sync(line, now);
    return { date: dto.date, ...values };
  }

  async removeException(userId: string, lineId: string, date: string, now = new Date()) {
    const line = await this.ownedLine(userId, lineId);
    const { count } = await this.prisma.lineException.deleteMany({ where: { lineId, date } });
    if (count === 0) throw new NotFoundException('Exception introuvable');
    await this.sync(line, now);
    return { deleted: true };
  }

  // ── Départs ─────────────────────────────────────────────────────────

  async departures(userId: string, q: DeparturesQueryDto, now = new Date()) {
    const lineIds = q.lineId ? [(await this.ownedLine(userId, q.lineId)).id] : await this.lineIdsOf(userId);
    const rows = await this.prisma.lineDeparture.findMany({
      where: { lineId: { in: lineIds }, departureAt: { gt: now }, status: q.status },
      orderBy: { departureAt: 'asc' },
      take: 200,
    });
    return rows.map(departureView);
  }

  /** Confirmation groupée : « j'assure ces départs jusqu'au … ». */
  async confirm(userId: string, dto: ConfirmDeparturesDto, now = new Date()) {
    // Paiement en ligne activé : pas de mise en vente sans compte de versement validé.
    await this.payouts.assertReady(userId);
    const lineIds = dto.lineId ? [(await this.ownedLine(userId, dto.lineId)).id] : await this.lineIdsOf(userId);
    const { count } = await this.prisma.lineDeparture.updateMany({
      where: { lineId: { in: lineIds }, status: 'to_confirm', localDate: { lte: dto.until }, departureAt: { gt: now } },
      data: { status: 'open', confirmedAt: now },
    });
    if (count > 0) {
      await this.audit.log({ userId, action: 'line.departures.confirm', metadata: { until: dto.until, count, lineId: dto.lineId ?? null } });
    }
    return { confirmed: count };
  }

  /** Arrêter (« plus de places ») ou reprendre la vente d'un départ. */
  async setDepartureClosed(userId: string, departureId: string, closed: boolean, now = new Date()) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = departure && (await this.prisma.recurringLine.findFirst({ where: { id: departure.lineId, operatorId: userId } }));
    if (!departure || !line) throw new NotFoundException('Départ introuvable');
    if (new Date(departure.departureAt) <= now) throw new ConflictException('Ce départ est déjà passé');
    if (!closed && line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');
    if (!closed) await this.payouts.assertReady(userId);
    const updated = await this.prisma.lineDeparture.update({
      where: { id: departureId },
      // Rouvrir un départ vaut confirmation de la capacité.
      data: closed ? { status: 'closed' } : { status: 'open', confirmedAt: now },
    });
    await this.audit.log({ userId, action: closed ? 'line.departure.close' : 'line.departure.open', entity: 'LineDeparture', entityId: departureId });
    return departureView(updated);
  }

  // ── Places (réservations de la bourse, étape 2) ──────────────────────

  /**
   * Retient des places sur un départ. Mise à jour conditionnelle : deux
   * clients qui prennent la dernière place en même temps ne passent pas
   * tous les deux (PostgreSQL applique le filtre au moment de l'écriture).
   */
  async reserveSeats(departureId: string, seats: number, now = new Date()) {
    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = d && (await this.prisma.recurringLine.findUnique({ where: { id: d.lineId } }));
    const deadline = new Date(now.getTime() + LINE_BOOKING_LEAD_MIN * 60_000);
    if (!d || !line || line.status !== 'active' || d.status !== 'open' || new Date(d.departureAt) <= deadline) {
      throw new ConflictException('Ce départ n’est plus disponible');
    }
    if (!bookable(d, seats)) throw new ConflictException('Plus assez de places sur ce départ');
    const { count } =
      d.pricingMode === 'per_vehicle'
        ? await this.prisma.lineDeparture.updateMany({
            where: { id: d.id, status: 'open', seatsBooked: 0 },
            data: { seatsBooked: d.seatsTotal },
          })
        : await this.prisma.lineDeparture.updateMany({
            where: { id: d.id, status: 'open', seatsBooked: { lte: d.seatsTotal - seats } },
            data: { seatsBooked: { increment: seats } },
          });
    if (count === 0) throw new ConflictException('Plus assez de places sur ce départ');
    return { departureId: d.id, seats: d.pricingMode === 'per_vehicle' ? d.seatsTotal : seats, priceCents: priceFor(d, seats) };
  }

  /** Rend des places (annulation d'une réservation) et libère ses sièges numérotés. */
  async releaseSeats(departureId: string, seats: number, tripId?: string) {
    if (tripId) await this.prisma.lineSeat.deleteMany({ where: { departureId, tripId } });
    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    if (!d) return;
    await this.prisma.lineDeparture.update({
      where: { id: departureId },
      data: { seatsBooked: d.pricingMode === 'per_vehicle' ? 0 : Math.max(0, d.seatsBooked - seats) },
    });
  }

  // ── Recherche ───────────────────────────────────────────────────────

  /**
   * Départs réservables compatibles avec une demande, classés, chacun avec
   * les raisons de sa sélection (règles explicites, pas d'IA).
   */
  async search(q: LineSearchDto, now = new Date()) {
    const deadline = new Date(now.getTime() + LINE_BOOKING_LEAD_MIN * 60_000);
    const departures = await this.prisma.lineDeparture.findMany({
      where: { localDate: q.date, status: 'open', departureAt: { gt: deadline } },
    });
    if (departures.length === 0) return [];

    const lineIds = [...new Set(departures.map((d: Departure) => d.lineId))];
    const lines = await this.prisma.recurringLine.findMany({ where: { id: { in: lineIds }, status: 'active' } });
    const operatorIds = [...new Set(lines.map((l) => l.operatorId))];
    const [operators, drivers, users, vehicles] = await Promise.all([
      this.prisma.operatorProfile.findMany({ where: { id: { in: operatorIds }, status: 'verified' } }),
      this.prisma.driverProfile.findMany({ where: { id: { in: operatorIds }, approvedAt: { not: null } } }),
      this.prisma.user.findMany({ where: { id: { in: operatorIds }, deletedAt: null }, select: { id: true, firstName: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: lines.map((l) => l.vehicleId) } } }),
    ]);
    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
    const lineMap = byId(lines);
    const operatorMap = byId(operators);
    const driverMap = byId(drivers);
    const userMap = byId(users);
    const vehicleMap = byId(vehicles);

    const from = { lat: q.fromLat, lng: q.fromLng };
    const to = { lat: q.toLat, lng: q.toLng };
    const flex = q.flexMin ?? DEFAULT_FLEX_MIN;
    const results = [];
    for (const d of departures) {
      const line = lineMap.get(d.lineId);
      const operator = line && operatorMap.get(line.operatorId);
      const driver = line && driverMap.get(line.operatorId);
      const user = line && userMap.get(line.operatorId);
      const vehicle = line && vehicleMap.get(line.vehicleId);
      if (!line || !operator || !driver || !user || !vehicle) continue;
      // Vente à la place : seulement si la licence est (toujours) vérifiée.
      if (d.pricingMode === 'per_seat' && !operator.perSeatAllowed) continue;
      if (!bookable(d, q.seats)) continue;
      if ((q.luggage ?? 0) > line.luggage) continue;

      const outbound = d.direction === 'outbound';
      const start = outbound ? { lat: line.originLat, lng: line.originLng } : { lat: line.destinationLat, lng: line.destinationLng };
      const end = outbound ? { lat: line.destinationLat, lng: line.destinationLng } : { lat: line.originLat, lng: line.originLng };
      const pickupKm = haversineKm(from, start);
      const dropoffKm = haversineKm(to, end);
      if (pickupKm > line.pickupRadiusKm || dropoffKm > line.pickupRadiusKm) continue;

      const time = localTimeOf(new Date(d.departureAt), line.timezone);
      const diffMin = q.time ? minutesOf(time) - minutesOf(q.time) : 0;
      if (Math.abs(diffMin) > flex) continue;

      const seatsLeft = d.seatsTotal - d.seatsBooked;
      const reasons: MatchReason[] = [
        { code: 'pickup', km: round1(pickupKm) },
        { code: 'dropoff', km: round1(dropoffKm) },
        ...(q.time ? [{ code: 'time' as const, diffMin }] : []),
        d.pricingMode === 'per_vehicle' ? { code: 'private_vehicle' as const } : { code: 'seats_left' as const, count: seatsLeft },
        { code: 'verified_operator' },
      ];
      results.push({
        departureId: d.id,
        lineId: line.id,
        direction: d.direction,
        departureAt: d.departureAt,
        localTime: time,
        durationMin: line.durationMin,
        origin: outbound ? line.originAddress : line.destinationAddress,
        destination: outbound ? line.destinationAddress : line.originAddress,
        pricingMode: d.pricingMode,
        unitPriceCents: d.priceCents,
        totalPriceCents: priceFor(d, q.seats),
        seatsLeft: d.pricingMode === 'per_vehicle' ? d.seatsTotal : seatsLeft,
        luggage: line.luggage,
        conditions: line.conditions,
        // Profil public : jamais de téléphone, d'e-mail ni de plaque avant réservation.
        operator: {
          name: operator.legalName ?? user.firstName,
          kind: operator.kind,
          rating: driver.ratingCount > 0 ? Number(driver.rating) : null,
          ratingCount: driver.ratingCount,
          languages: driver.languages,
        },
        vehicle: { brand: vehicle.brand, model: vehicle.model, capacity: vehicle.capacity },
        reasons,
        rank: { diffMin: Math.abs(diffMin), pickupKm, price: priceFor(d, q.seats) },
      });
    }
    results.sort((a, b) => a.rank.diffMin - b.rank.diffMin || a.rank.pickupKm - b.rank.pickupKm || a.rank.price - b.rank.price);
    return results.slice(0, SEARCH_LIMIT).map(({ rank, ...r }) => r);
  }

  // ── Génération des départs ──────────────────────────────────────────

  /** Passe quotidienne du planificateur : fenêtre glissante de 30 jours. */
  async syncAll(now = new Date()) {
    const lines = await this.prisma.recurringLine.findMany({ where: { status: { in: ['active', 'paused'] } } });
    for (const line of lines) await this.sync(line, now);
    return lines.length;
  }

  /**
   * Aligne les départs à venir d'une ligne sur son calendrier. Ne touche
   * jamais un départ passé ; un départ réservé ne change ni d'heure ni de
   * prix (seulement sa capacité, sans descendre sous les places vendues).
   */
  async sync(line: Line, now: Date): Promise<{ keptBooked: number }> {
    const today = localDateOf(now, line.timezone);
    const existing: Departure[] = await this.prisma.lineDeparture.findMany({ where: { lineId: line.id, localDate: { gte: today } } });
    const future = existing.filter((d) => new Date(d.departureAt) > now);

    let planned: PlannedDeparture[] = [];
    if (line.status !== 'closed') {
      const exceptions = await this.prisma.lineException.findMany({ where: { lineId: line.id } });
      planned = plannedDepartures(
        line,
        new Map(exceptions.map((e) => [e.date, e.seats])),
        today,
        addDays(today, LINE_HORIZON_DAYS),
      ).filter((p) => p.departureAt > now);
    }
    const plannedByKey = new Map(planned.map((p) => [departureKey(p), p]));

    let keptBooked = 0;
    for (const d of future) {
      const p = plannedByKey.get(departureKey(d));
      if (d.seatsBooked > 0) {
        if (!p) {
          keptBooked++;
          if (d.status !== 'closed') await this.prisma.lineDeparture.update({ where: { id: d.id }, data: { status: 'closed' } });
        } else if (p.seatsTotal !== d.seatsTotal && p.seatsTotal >= d.seatsBooked && d.pricingMode === 'per_seat') {
          await this.prisma.lineDeparture.update({ where: { id: d.id }, data: { seatsTotal: p.seatsTotal } });
        }
        continue;
      }
      if (!p) {
        await this.prisma.lineDeparture.delete({ where: { id: d.id } });
      } else if (new Date(d.departureAt).getTime() !== p.departureAt.getTime()) {
        // Nouvel horaire : la capacité doit être reconfirmée.
        await this.prisma.lineDeparture.update({
          where: { id: d.id },
          data: { departureAt: p.departureAt, seatsTotal: p.seatsTotal, priceCents: p.priceCents, pricingMode: p.pricingMode, status: 'to_confirm', confirmedAt: null },
        });
      } else if (p.seatsTotal !== d.seatsTotal || p.priceCents !== d.priceCents || p.pricingMode !== d.pricingMode) {
        await this.prisma.lineDeparture.update({
          where: { id: d.id },
          data: { seatsTotal: p.seatsTotal, priceCents: p.priceCents, pricingMode: p.pricingMode },
        });
      }
    }

    // Une date déjà occupée (même passée dans la journée) ne reçoit pas de second départ.
    const taken = new Set(existing.map(departureKey));
    for (const p of planned) {
      if (taken.has(departureKey(p))) continue;
      await this.prisma.lineDeparture.create({ data: { lineId: line.id, ...p, status: 'to_confirm' } });
    }
    return { keptBooked };
  }

  // ── Contrôles ───────────────────────────────────────────────────────

  private async driverProfileOf(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: userId } });
    if (!driver) throw new ForbiddenException('Réservé aux chauffeurs et opérateurs inscrits');
    return driver;
  }

  private async approvedDriver(userId: string) {
    const driver = await this.driverProfileOf(userId);
    if (!driver.approvedAt) {
      throw new ForbiddenException('Votre compte chauffeur doit être validé par XLCAB avant de publier une ligne');
    }
  }

  /** Conditions générales opérateur acceptées, dans leur version en vigueur. */
  private async termsAccepted(userId: string) {
    const operator = await this.prisma.operatorProfile.findUnique({ where: { id: userId } });
    if (!operator?.termsAcceptedAt || operator.termsVersion !== operatorTermsVersion()) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'OPERATOR_TERMS_REQUIRED',
        message: 'Acceptez les conditions générales opérateur avant de publier une ligne',
      });
    }
  }

  private async checkPricing(userId: string, pricingMode: string) {
    if (pricingMode !== 'per_seat') return;
    const operator = await this.prisma.operatorProfile.findUnique({ where: { id: userId } });
    if (!operator?.perSeatAllowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PER_SEAT_NOT_ALLOWED',
        message: 'Vente à la place réservée aux opérateurs dont la licence de transport collectif a été vérifiée par XLCAB',
      });
    }
  }

  private async ownedVehicle(userId: string, vehicleId: string, seats: number) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, driverId: userId } });
    if (!vehicle) throw new NotFoundException('Véhicule introuvable');
    // `capacity` = places passagers homologuées, conducteur non compris.
    if (seats > vehicle.capacity) {
      throw new BadRequestException(`Ce véhicule compte ${vehicle.capacity} places passagers : impossible d’en vendre davantage`);
    }
    return vehicle;
  }

  private async ownedLine(userId: string, lineId: string): Promise<Line> {
    // Ownership : la ligne d'un autre opérateur est « introuvable » (404).
    const line = await this.prisma.recurringLine.findFirst({ where: { id: lineId, operatorId: userId } });
    if (!line) throw new NotFoundException('Ligne introuvable');
    return line;
  }

  private async lineIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.recurringLine.findMany({ where: { operatorId: userId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
}

function checkSchedule(l: { startDate: string; endDate: string | null; departureTime: string; returnTime: string | null }) {
  const real = (d: string) => addDays(d, 0) === d; // rejette le 31 février
  if (!real(l.startDate) || (l.endDate && !real(l.endDate))) throw new BadRequestException('Date invalide (AAAA-MM-JJ)');
  if (l.endDate && l.endDate < l.startDate) throw new BadRequestException('La date de fin doit suivre la date de début');
  if (l.returnTime && minutesOf(l.returnTime) <= minutesOf(l.departureTime)) {
    throw new BadRequestException('Le retour doit partir après l’aller');
  }
}

function publicProfile(p: Record<string, any>) {
  return {
    kind: p.kind,
    legalName: p.legalName,
    siret: p.siret,
    transportLicense: p.transportLicense,
    cities: p.cities,
    services: p.services,
    description: p.description,
    status: p.status,
    perSeatAllowed: p.perSeatAllowed,
    verifiedAt: p.verifiedAt ?? null,
    // Acceptées dans la version en vigueur ; sinon l'app les présente de nouveau.
    termsAccepted: Boolean(p.termsAcceptedAt) && p.termsVersion === operatorTermsVersion(),
    termsVersion: operatorTermsVersion(),
  };
}

const lineView = (l: Line) => ({
  id: l.id,
  vehicleId: l.vehicleId,
  origin: { address: l.originAddress, lat: l.originLat, lng: l.originLng },
  destination: { address: l.destinationAddress, lat: l.destinationLat, lng: l.destinationLng },
  pickupRadiusKm: l.pickupRadiusKm,
  departureTime: l.departureTime,
  returnTime: l.returnTime,
  timezone: l.timezone,
  daysOfWeek: l.daysOfWeek,
  startDate: l.startDate,
  endDate: l.endDate,
  seats: l.seats,
  luggage: l.luggage,
  pricingMode: l.pricingMode,
  priceCents: l.priceCents,
  durationMin: l.durationMin,
  conditions: l.conditions,
  status: l.status,
});

const departureView = (d: Departure) => ({
  id: d.id,
  lineId: d.lineId,
  direction: d.direction,
  localDate: d.localDate,
  departureAt: d.departureAt,
  seatsTotal: d.seatsTotal,
  seatsBooked: d.seatsBooked,
  priceCents: d.priceCents,
  pricingMode: d.pricingMode,
  status: d.status,
});
