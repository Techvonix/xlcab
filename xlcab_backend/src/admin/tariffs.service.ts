import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_TARIFF, PricingService, TariffValues } from '../matching/pricing.service';
import { SHUTTLE_TYPES } from '../matching/matching.constants';
import { AdminCtx } from './admin.service';

/** Au-delà de ±30 % sur un montant, une confirmation explicite est exigée (faute de frappe). */
const LARGE_CHANGE_RATIO = 0.3;
const MAX_SCHEDULE_DAYS = 365;

export interface NewTariff extends TariffValues {
  jurisdiction: string;
  effectiveFrom?: string;
  reason: string;
  confirmLargeChange?: boolean;
}

/**
 * Tarifs réglables depuis le dashboard admin : le porteur de projet ajuste
 * les prix selon la concurrence et le coût du carburant. Versionnés (jamais
 * modifiés), application immédiate ou programmée, tracés dans l'audit.
 */
@Injectable()
export class TariffsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private audit: AuditService,
  ) {}

  /** Tarif en vigueur, tarifs programmés, historique et valeurs par défaut. */
  async overview(jurisdiction: string) {
    await this.assertJurisdiction(jurisdiction);
    const now = new Date();
    const [current, scheduled, history] = await Promise.all([
      this.prisma.tariff.findFirst({ where: { jurisdiction, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' } }),
      this.prisma.tariff.findMany({ where: { jurisdiction, effectiveFrom: { gt: now } }, orderBy: { effectiveFrom: 'asc' } }),
      this.prisma.tariff.findMany({ where: { jurisdiction, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' }, take: 20 }),
    ]);
    return {
      jurisdiction,
      // Sans tarif saisi : grille par défaut de la Partie 10.
      current: current ?? { ...DEFAULT_TARIFF, id: null, effectiveFrom: null, reason: 'Tarif par défaut (spécification)', createdBy: null },
      scheduled,
      history,
      defaults: DEFAULT_TARIFF,
    };
  }

  async create(input: NewTariff, ctx: AdminCtx) {
    await this.assertJurisdiction(input.jurisdiction);
    const now = new Date();
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) {
      throw new BadRequestException('La date d’effet ne peut pas être dans le passé (les courses déjà réservées gardent leur prix)');
    }
    if (effectiveFrom.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 24 * 3600_000) {
      throw new BadRequestException('Date d’effet à moins d’un an');
    }

    const current = await this.pricing.tariffFor(input.jurisdiction, effectiveFrom);
    const changes = this.largeChanges(current, input);
    if (changes.length > 0 && !input.confirmLargeChange) {
      throw new ConflictException(`Variation de plus de 30 % : ${changes.join(', ')}. Confirmez si c’est voulu.`);
    }

    const created = await this.prisma.tariff.create({
      data: {
        jurisdiction: input.jurisdiction,
        ratesPerKm: input.ratesPerKm,
        childSeatCents: input.childSeatCents,
        wifiCents: input.wifiCents,
        extraLuggageCents: input.extraLuggageCents,
        parcelFeeCents: input.parcelFeeCents,
        sharedParcelCents: input.sharedParcelCents,
        effectiveFrom,
        reason: input.reason,
        createdBy: ctx.adminId,
      },
    });
    this.pricing.clearTariffCache();
    await this.audit.log({
      userId: ctx.adminId, action: 'tariff.create', entity: 'Tariff', entityId: created.id,
      metadata: { jurisdiction: input.jurisdiction, effectiveFrom, reason: input.reason, before: current, after: this.values(input) },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    return created;
  }

  /** Annulation d'un tarif programmé (pas encore en vigueur). */
  async cancelScheduled(id: string, ctx: AdminCtx) {
    const t = await this.prisma.tariff.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tarif introuvable');
    if (t.effectiveFrom <= new Date()) throw new ConflictException('Tarif déjà en vigueur : publiez un nouveau tarif pour le remplacer');
    await this.prisma.tariff.delete({ where: { id } });
    this.pricing.clearTariffCache();
    await this.audit.log({
      userId: ctx.adminId, action: 'tariff.cancel', entity: 'Tariff', entityId: id,
      metadata: { jurisdiction: t.jurisdiction, effectiveFrom: t.effectiveFrom }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    return { cancelled: true };
  }

  private values(t: TariffValues): TariffValues {
    return {
      ratesPerKm: t.ratesPerKm,
      childSeatCents: t.childSeatCents,
      wifiCents: t.wifiCents,
      extraLuggageCents: t.extraLuggageCents,
      parcelFeeCents: t.parcelFeeCents,
      sharedParcelCents: t.sharedParcelCents,
    };
  }

  /** Libellés des montants qui varient de plus de 30 % (garde-fou contre les fautes de frappe). */
  private largeChanges(before: TariffValues, after: TariffValues): string[] {
    const pairs: [string, number, number][] = [
      ...SHUTTLE_TYPES.map((s) => [`tarif km ${s}`, before.ratesPerKm[s], after.ratesPerKm[s]] as [string, number, number]),
      ['siège enfant', before.childSeatCents, after.childSeatCents],
      ['Wi-Fi', before.wifiCents, after.wifiCents],
      ['bagage supplémentaire', before.extraLuggageCents, after.extraLuggageCents],
      ['supplément colis', before.parcelFeeCents, after.parcelFeeCents],
      ['colis navette partagée', before.sharedParcelCents, after.sharedParcelCents],
    ];
    return pairs
      .filter(([, b, a]) => (b === 0 ? a > 0 : Math.abs(a - b) / b > LARGE_CHANGE_RATIO))
      .map(([label]) => label);
  }

  private async assertJurisdiction(code: string) {
    const j = await this.prisma.jurisdictionConfig.findUnique({ where: { code }, select: { code: true } });
    if (!j) throw new NotFoundException('Juridiction inconnue');
  }
}
