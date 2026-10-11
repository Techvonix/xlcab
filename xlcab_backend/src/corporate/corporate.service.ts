import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BookingsService } from '../bookings/bookings.service';
import {
  AddMemberDto,
  CorporateBookingDto,
  CreateCorporateAccountDto,
  UpdateCorporateAccountDto,
} from './dto/corporate.dto';

// Valeur proposée : ajout de collaborateurs par un admin corporate.
const MEMBER_ADDS_PER_HOUR = 30;
const ANALYTICS_MONTHS = 6;

export interface RequestUser {
  sub: string;
  role: string;
}

interface AdminContext {
  corporateId: string;
  account: {
    id: string;
    companyName: string;
    vatNumber: string | null;
    siret: string | null;
    billingEmail: string | null;
    billingAddress: string | null;
    costCenter: string | null;
    monthlyLimitCents: number | null;
    jurisdiction: string;
    createdAt: Date;
  };
}

/** Bornes UTC d'un mois "AAAA-MM" (mois courant par défaut). */
export function monthRange(month?: string): { month: string; start: Date; end: Date } {
  const now = new Date();
  const [y, m] = month
    ? month.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { month: `${y}-${String(m).padStart(2, '0')}`, start, end };
}

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

@Injectable()
export class CorporateService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private bookings: BookingsService,
  ) {}

  // ── Comptes ─────────────────────────────────────────────────────────

  /** Ouverture d'un compte entreprise par l'équipe XLCAB. */
  async createAccount(user: RequestUser, dto: CreateCorporateAccountDto) {
    if (user.role !== 'admin') throw new ForbiddenException('Réservé à l’équipe XLCAB');

    const target = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
      select: { id: true, role: true, jurisdiction: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw new NotFoundException('Aucun compte XLCAB avec cet email');
    if (target.role !== 'passenger') {
      throw new ConflictException('Ce compte ne peut pas administrer une entreprise (compte chauffeur, admin ou déjà rattaché)');
    }

    const { adminEmail, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.corporateAccount.create({
        data: { ...fields, jurisdiction: target.jurisdiction },
      });
      await tx.corporateMember.create({
        data: { corporateId: account.id, userId: target.id, role: 'admin' },
      });
      // Le nouveau rôle est pris en compte au prochain refresh du jeton
      // (rôle relu en base, Module 2).
      await tx.user.update({ where: { id: target.id }, data: { role: 'corporate_admin' } });
      return account;
    });
  }

  async getMyAccount(user: RequestUser) {
    const { account, corporateId } = await this.adminContext(user);
    const { start, end } = monthRange();
    return {
      ...account,
      budget: {
        monthlyLimitCents: account.monthlyLimitCents,
        usedCents: await this.spend(corporateId, start, end),
      },
    };
  }

  async updateMyAccount(user: RequestUser, dto: UpdateCorporateAccountDto) {
    const { corporateId } = await this.adminContext(user);
    // Raison sociale, TVA et SIRET : modifiables par XLCAB uniquement
    // (mentions légales des factures).
    return this.prisma.corporateAccount.update({ where: { id: corporateId }, data: dto });
  }

  // ── Équipe ──────────────────────────────────────────────────────────

  async listMembers(user: RequestUser) {
    const { corporateId } = await this.adminContext(user);
    const members = await this.prisma.corporateMember.findMany({
      where: { corporateId, isActive: true },
      orderBy: { addedAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const { start, end } = monthRange();

    return Promise.all(
      members.map(async (m) => {
        const u = byId.get(m.userId);
        return {
          id: m.id,
          role: m.role,
          email: u?.email ?? null,
          firstName: u?.firstName ?? null,
          lastName: u?.lastName ?? null,
          costCenter: m.costCenter,
          monthlyLimitCents: m.monthlyLimitCents,
          monthSpendCents: await this.spend(corporateId, start, end, m.userId),
          addedAt: m.addedAt,
        };
      }),
    );
  }

  async addMember(user: RequestUser, dto: AddMemberDto) {
    const { corporateId } = await this.adminContext(user);
    await this.rateLimit(`corporate:members:rate:${user.sub}`, MEMBER_ADDS_PER_HOUR, 3600);

    const target = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, role: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Aucun compte XLCAB avec cet email : invitez la personne à créer son compte');
    }
    if (!['passenger', 'corporate_member'].includes(target.role)) {
      throw new ConflictException('Ce compte ne peut pas être ajouté (compte chauffeur ou administrateur)');
    }
    const active = await this.prisma.corporateMember.findFirst({
      where: { userId: target.id, isActive: true },
      select: { corporateId: true },
    });
    if (active) {
      throw new ConflictException(
        active.corporateId === corporateId ? 'Déjà membre de votre équipe' : 'Déjà rattaché à une autre entreprise',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Réactive un ancien membre plutôt que de dupliquer la ligne.
      const member = await tx.corporateMember.upsert({
        where: { corporateId_userId: { corporateId, userId: target.id } },
        create: {
          corporateId,
          userId: target.id,
          role: 'member',
          monthlyLimitCents: dto.monthlyLimitCents ?? null,
          costCenter: dto.costCenter ?? null,
        },
        update: {
          isActive: true,
          role: 'member',
          monthlyLimitCents: dto.monthlyLimitCents ?? null,
          costCenter: dto.costCenter ?? null,
          addedAt: new Date(),
        },
      });
      await tx.user.update({ where: { id: target.id }, data: { role: 'corporate_member' } });
      return { id: member.id, role: member.role, email: dto.email };
    });
  }

  async removeMember(user: RequestUser, memberId: string) {
    const { corporateId } = await this.adminContext(user);
    const member = await this.prisma.corporateMember.findFirst({
      where: { id: memberId, corporateId, isActive: true },
    });
    // Même réponse pour "inexistant" et "d'une autre entreprise".
    if (!member) throw new NotFoundException('Collaborateur introuvable');
    if (member.role === 'admin') {
      throw new ForbiddenException('Un administrateur ne peut pas être retiré depuis le portail');
    }

    await this.prisma.$transaction(async (tx) => {
      // Désactivation, pas suppression : l'historique de facturation reste.
      await tx.corporateMember.update({ where: { id: member.id }, data: { isActive: false } });
      await tx.user.update({ where: { id: member.userId }, data: { role: 'passenger' } });
    });
    return { removed: true };
  }

  // ── Réservation pour un collaborateur ───────────────────────────────

  async book(user: RequestUser, dto: CorporateBookingDto) {
    const { corporateId, account } = await this.adminContext(user);
    const member = await this.prisma.corporateMember.findFirst({
      where: { id: dto.memberId, corporateId, isActive: true },
    });
    if (!member) throw new NotFoundException('Collaborateur introuvable');

    const { start, end } = monthRange(dto.trip.scheduledAt.slice(0, 7));

    return this.bookings.createPassengerTrip({
      passengerId: member.userId,
      jurisdiction: account.jurisdiction,
      dto: dto.trip,
      corporateId,
      costCenter: dto.costCenter ?? member.costCenter ?? account.costCenter,
      bookedById: user.sub,
      // Plafonds mensuels (entreprise puis collaborateur), sur le mois de
      // la course, au prix recalculé par le serveur.
      assertAllowed: async (totalCents) => {
        if (account.monthlyLimitCents != null) {
          const used = await this.spend(corporateId, start, end);
          if (used + totalCents > account.monthlyLimitCents) {
            throw new BadRequestException(
              `Plafond mensuel de l’entreprise dépassé (reste ${euros(Math.max(0, account.monthlyLimitCents - used))})`,
            );
          }
        }
        if (member.monthlyLimitCents != null) {
          const used = await this.spend(corporateId, start, end, member.userId);
          if (used + totalCents > member.monthlyLimitCents) {
            throw new BadRequestException(
              `Plafond mensuel du collaborateur dépassé (reste ${euros(Math.max(0, member.monthlyLimitCents - used))})`,
            );
          }
        }
      },
    });
  }

  // ── Tableau de bord ─────────────────────────────────────────────────

  async analytics(user: RequestUser, month?: string) {
    const { corporateId, account } = await this.adminContext(user);
    const range = monthRange(month);
    const trips = await this.monthTrips(corporateId, range.start, range.end);

    const totals = { trips: trips.length, spendTtcCents: 0, spendHtCents: 0, vatCents: 0, passengerHtCents: 0, parcelHtCents: 0 };
    const byMember = new Map<string, { trips: number; spendTtcCents: number }>();
    const byCostCenter = new Map<string, number>();
    const byShuttle = new Map<string, number>();

    for (const t of trips) {
      const ttc = t.totalPriceCents ?? 0;
      totals.spendTtcCents += ttc;
      totals.vatCents += t.vatCents;
      for (const l of t.priceLines) {
        totals.spendHtCents += l.baseCents;
        if (l.regime === 'parcel') totals.parcelHtCents += l.baseCents;
        else totals.passengerHtCents += l.baseCents;
      }
      const m = byMember.get(t.passengerId ?? '') ?? { trips: 0, spendTtcCents: 0 };
      byMember.set(t.passengerId ?? '', { trips: m.trips + 1, spendTtcCents: m.spendTtcCents + ttc });
      const cc = t.costCenter ?? 'Sans centre de coût';
      byCostCenter.set(cc, (byCostCenter.get(cc) ?? 0) + ttc);
      byShuttle.set(t.shuttleType, (byShuttle.get(t.shuttleType) ?? 0) + 1);
    }

    const names = await this.names([...byMember.keys()]);

    // Évolution sur 6 mois (mois demandé inclus).
    const [y, mo] = range.month.split('-').map(Number);
    const historyStart = new Date(Date.UTC(y, mo - ANALYTICS_MONTHS, 1));
    const history = await this.prisma.trip.findMany({
      where: { corporateId, status: { not: 'cancelled' }, scheduledAt: { gte: historyStart, lt: range.end } },
      select: { scheduledAt: true, totalPriceCents: true },
    });
    const monthly = Array.from({ length: ANALYTICS_MONTHS }, (_, i) => {
      const d = new Date(Date.UTC(y, mo - ANALYTICS_MONTHS + i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const inMonth = history.filter((h) => h.scheduledAt && h.scheduledAt.toISOString().startsWith(key));
      return {
        month: key,
        trips: inMonth.length,
        spendTtcCents: inMonth.reduce((s, h) => s + (h.totalPriceCents ?? 0), 0),
      };
    });

    return {
      month: range.month,
      totals,
      budget: { monthlyLimitCents: account.monthlyLimitCents, usedCents: totals.spendTtcCents },
      byMember: [...byMember.entries()]
        .map(([userId, v]) => ({ name: names.get(userId) ?? 'Collaborateur', ...v }))
        .sort((a, b) => b.spendTtcCents - a.spendTtcCents),
      byCostCenter: [...byCostCenter.entries()].map(([costCenter, spendTtcCents]) => ({ costCenter, spendTtcCents })),
      byShuttle: [...byShuttle.entries()].map(([shuttleType, trips]) => ({ shuttleType, trips })),
      monthly,
    };
  }

  // ── Factures / relevé mensuel ───────────────────────────────────────

  /**
   * Relevé du mois : une ligne par course, TVA transport de personnes et
   * TVA marchandises séparées (Partie 11.4). Seules les courses terminées
   * sont facturables ; les autres sont listées pour information.
   */
  async invoices(user: RequestUser, month?: string) {
    const { corporateId, account } = await this.adminContext(user);
    const range = monthRange(month);
    const trips = await this.monthTrips(corporateId, range.start, range.end);
    const names = await this.names(trips.map((t) => t.passengerId ?? ''));

    const lines = trips.map((t) => {
      const passenger = t.priceLines.filter((l) => l.regime !== 'parcel');
      const parcel = t.priceLines.filter((l) => l.regime === 'parcel');
      const sum = (ls: typeof t.priceLines, k: 'baseCents' | 'vatCents') => ls.reduce((s, l) => s + l[k], 0);
      return {
        tripId: t.id,
        date: t.scheduledAt,
        status: t.status,
        billable: t.status === 'completed',
        passengerName: names.get(t.passengerId ?? '') ?? 'Collaborateur',
        costCenter: t.costCenter,
        originAddress: t.originAddress,
        destinationAddress: t.destinationAddress,
        shuttleType: t.shuttleType,
        passengerHtCents: sum(passenger, 'baseCents'),
        passengerVatRate: passenger[0] ? Number(passenger[0].ratePercent) : null,
        passengerVatCents: sum(passenger, 'vatCents'),
        parcelHtCents: sum(parcel, 'baseCents'),
        parcelVatRate: parcel[0] ? Number(parcel[0].ratePercent) : null,
        parcelVatCents: sum(parcel, 'vatCents'),
        totalTtcCents: t.totalPriceCents ?? 0,
      };
    });

    const billable = lines.filter((l) => l.billable);
    const total = (k: 'passengerHtCents' | 'passengerVatCents' | 'parcelHtCents' | 'parcelVatCents' | 'totalTtcCents') =>
      billable.reduce((s, l) => s + l[k], 0);

    return {
      month: range.month,
      company: {
        name: account.companyName,
        vatNumber: account.vatNumber,
        siret: account.siret,
        billingAddress: account.billingAddress,
        billingEmail: account.billingEmail,
      },
      lines,
      totals: {
        billableTrips: billable.length,
        passengerHtCents: total('passengerHtCents'),
        passengerVatCents: total('passengerVatCents'),
        parcelHtCents: total('parcelHtCents'),
        parcelVatCents: total('parcelVatCents'),
        totalTtcCents: total('totalTtcCents'),
      },
    };
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  /**
   * Admin actif d'une entreprise. Le rôle du jeton ne suffit pas : on
   * revérifie l'appartenance en base (Partie 8 : rôle + ownership).
   */
  private async adminContext(user: RequestUser): Promise<AdminContext> {
    const forbidden = new ForbiddenException('Réservé aux administrateurs d’un compte entreprise');
    if (user.role !== 'corporate_admin') throw forbidden;
    const membership = await this.prisma.corporateMember.findFirst({
      where: { userId: user.sub, role: 'admin', isActive: true },
      select: { corporateId: true },
    });
    if (!membership) throw forbidden;
    const account = await this.prisma.corporateAccount.findUnique({ where: { id: membership.corporateId } });
    if (!account) throw forbidden;
    return { corporateId: membership.corporateId, account };
  }

  private monthTrips(corporateId: string, start: Date, end: Date) {
    return this.prisma.trip.findMany({
      where: { corporateId, status: { not: 'cancelled' }, scheduledAt: { gte: start, lt: end } },
      select: {
        id: true,
        status: true,
        passengerId: true,
        shuttleType: true,
        costCenter: true,
        originAddress: true,
        destinationAddress: true,
        scheduledAt: true,
        totalPriceCents: true,
        vatCents: true,
        priceLines: { select: { regime: true, baseCents: true, ratePercent: true, vatCents: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Dépense TTC (courses non annulées) sur une période. */
  private async spend(corporateId: string, start: Date, end: Date, passengerId?: string): Promise<number> {
    const agg = await this.prisma.trip.aggregate({
      _sum: { totalPriceCents: true },
      where: {
        corporateId,
        status: { not: 'cancelled' },
        scheduledAt: { gte: start, lt: end },
        ...(passengerId ? { passengerId } : {}),
      },
    });
    return agg._sum.totalPriceCents ?? 0;
  }

  private async names(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return new Map(
      users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]),
    );
  }

  private async rateLimit(key: string, max: number, windowSeconds: number) {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    if (count > max) {
      throw new HttpException('Trop de demandes — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
