import { bankDetailsFrom } from './bank-details';
import { ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentStorage } from '../drivers/document-storage';
import { InvoiceDocument, InvoiceLine, Party, renderInvoicePdf } from './invoice-pdf';

export interface RequestUser {
  sub: string;
  role: string;
}

const SHUTTLE_LABELS: Record<string, string> = {
  rose: 'Navette Rose',
  bleue: 'Navette Bleue',
  orange: 'Navette Orange',
  accessibility: 'Navette Accessibilité',
};
const PAYMENT_TERM_DAYS = 30;
const LINK_TTL = '5m';
const MISSING = '[à compléter]';

const day = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(d) : '';

/**
 * Factures légales (France) : numérotation continue sans trou par série et
 * par année, mentions obligatoires, TVA ventilée par régime, PDF archivé
 * (conservation 10 ans), jamais modifiées — un remboursement donne un avoir.
 *
 * Émission : course particulier terminée (déjà payée : facture acquittée),
 * frais d'annulation, remboursement (avoir) ; entreprises : facture
 * mensuelle récapitulative payable à 30 jours.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private storage: DocumentStorage,
    private audit: AuditService,
    private jwt: JwtService,
  ) {}

  // ── Émission ────────────────────────────────────────────────────────

  /**
   * Facture d'une course de particulier terminée (passager ou colis).
   * Idempotente ; jamais d'erreur remontée (la fin de course ne doit pas
   * échouer pour une facture) : un incident est tracé pour reprise.
   */
  async issueForTrip(tripId: string) {
    try {
      const existing = await this.prisma.invoice.findFirst({ where: { tripId, kind: 'invoice', corporateId: null } });
      if (existing) return existing;
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { priceLines: true, passengerBooking: true } });
      if (!trip || trip.corporateId || !trip.passengerId || !trip.totalPriceCents) return null;
      const lines = this.tripLines(trip);
      return await this.issue({
        kind: 'invoice',
        jurisdiction: trip.jurisdiction,
        tripId,
        customerUserId: trip.passengerId,
        buyer: await this.personBuyer(trip.passengerId),
        lines,
        paymentStatus: 'paid',
      });
    } catch (err) {
      return this.failed('trip', tripId, err);
    }
  }

  /** Frais d'annulation retenus (CGV) : facture de l'indemnité. */
  async issueCancellationFee(tripId: string, feeCents: number) {
    if (feeCents <= 0) return null;
    try {
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.corporateId || !trip.passengerId) return null;
      return await this.issue({
        kind: 'invoice',
        jurisdiction: trip.jurisdiction,
        tripId,
        customerUserId: trip.passengerId,
        buyer: await this.personBuyer(trip.passengerId),
        lines: [{
          description: `Frais d’annulation (conditions générales de vente) — course ${this.route(trip)} prévue le ${day(trip.scheduledAt)}`,
          quantity: 1, unitCents: feeCents, regime: 'cancellation', vatRate: 0, vatCents: 0, totalCents: feeCents,
        }],
        paymentStatus: 'paid',
      });
    } catch (err) {
      return this.failed('cancellation', tripId, err);
    }
  }

  /**
   * Facture du solde d'une pénalité d'annulation (protocole des lignes) que
   * les reversements du chauffeur n'ont pas permis de recouvrer. Payable
   * sous 30 jours ; indemnité contractuelle, hors champ de la TVA (à valider,
   * comme les frais d'annulation).
   */
  async issuePenalty(input: { penaltyId: string; driverId: string; amountCents: number; jurisdiction: string; departureAt: Date | null; dueDate: Date }) {
    if (input.amountCents <= 0) return null;
    try {
      return await this.issue({
        kind: 'invoice',
        jurisdiction: input.jurisdiction,
        customerUserId: input.driverId,
        buyer: await this.personBuyer(input.driverId),
        lines: [{
          description: `Pénalité d’annulation tardive (conditions générales opérateur)${input.departureAt ? ` — départ du ${day(input.departureAt)}` : ''}`,
          quantity: 1, unitCents: input.amountCents, regime: 'penalty', vatRate: 0, vatCents: 0, totalCents: input.amountCents,
        }],
        paymentStatus: 'due',
        dueDate: input.dueDate,
      });
    } catch (err) {
      return this.failed('penalty', input.penaltyId, err);
    }
  }

  /**
   * Remboursement après facturation : avoir du montant remboursé, réparti
   * sur les lignes de la facture d'origine au prorata (TVA juste par taux).
   */
  async issueCreditNote(tripId: string, refundCents: number, reason: string) {
    try {
      const original = await this.prisma.invoice.findFirst({ where: { tripId, kind: 'invoice' }, orderBy: { issuedAt: 'desc' } });
      if (!original || refundCents <= 0) return null;
      const lines = original.lines as unknown as InvoiceLine[];
      const ratio = Math.min(1, refundCents / original.totalCents);
      let remaining = refundCents;
      const credit = lines.map((l, i) => {
        const total = i === lines.length - 1 ? remaining : Math.round(l.totalCents * ratio);
        remaining -= total;
        const base = Math.round(total / (1 + l.vatRate / 100));
        return {
          description: `Remboursement — ${l.description}${reason ? ` (${reason})` : ''}`,
          quantity: 1, unitCents: -base, regime: l.regime, vatRate: l.vatRate, vatCents: -(total - base), totalCents: -total,
        };
      });
      return await this.issue({
        kind: 'credit_note',
        jurisdiction: original.jurisdiction,
        tripId,
        customerUserId: original.customerUserId,
        corporateId: original.corporateId,
        buyer: original.buyer as unknown as Party,
        lines: credit,
        paymentStatus: 'paid',
        creditedInvoiceId: original.id,
      });
    } catch (err) {
      return this.failed('credit_note', tripId, err);
    }
  }

  /**
   * Facture mensuelle d'une entreprise : courses terminées du mois, non
   * encore facturées. Idempotente (une facture par entreprise et par mois).
   */
  async issueCorporateMonthly(corporateId: string, monthStart: Date) {
    const start = new Date(monthStart);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const existing = await this.prisma.invoice.findFirst({ where: { corporateId, periodStart: start, kind: 'invoice' } });
    if (existing) return existing;

    const account = await this.prisma.corporateAccount.findUnique({ where: { id: corporateId } });
    if (!account) throw new NotFoundException('Compte entreprise introuvable');
    const trips = await this.prisma.trip.findMany({
      where: { corporateId, status: 'completed', completedAt: { gte: start, lt: end } },
      include: { priceLines: true, passengerBooking: true },
      orderBy: { completedAt: 'asc' },
    });
    if (trips.length === 0) return null;

    const lines = trips.flatMap((t) => this.tripLines(t, t.costCenter ? ` — centre de coût ${t.costCenter}` : ''));
    return this.issue({
      kind: 'invoice',
      jurisdiction: account.jurisdiction,
      corporateId,
      periodStart: start,
      periodEnd: end,
      tripIds: trips.map((t) => t.id),
      buyer: {
        name: account.companyName,
        lines: [
          account.billingAddress ?? '',
          account.siret ? `SIRET : ${account.siret}` : '',
          account.vatNumber ? `TVA intracommunautaire : ${account.vatNumber}` : '',
          account.billingEmail ?? '',
        ].filter(Boolean),
      },
      lines,
      paymentStatus: 'due',
      dueDate: new Date(Date.now() + PAYMENT_TERM_DAYS * 24 * 3600_000),
    });
  }

  /** Planificateur : factures mensuelles du mois écoulé, une fois par mois. */
  async runMonthly(now = new Date()) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const corporates = await this.prisma.trip.findMany({
      where: { corporateId: { not: null }, status: 'completed', completedAt: { gte: monthStart, lt: end } },
      select: { corporateId: true },
    });
    let issued = 0;
    for (const id of new Set(corporates.map((t) => t.corporateId!))) {
      try {
        const before = await this.prisma.invoice.count({ where: { corporateId: id, periodStart: monthStart } });
        await this.issueCorporateMonthly(id, monthStart);
        if (before === 0) issued++;
      } catch (err) {
        this.failed('corporate', id, err);
      }
    }
    return issued;
  }

  // ── Consultation ────────────────────────────────────────────────────

  async listMine(user: RequestUser) {
    return this.prisma.invoice.findMany({
      where: { customerUserId: user.sub, corporateId: null },
      select: { id: true, number: true, kind: true, tripId: true, totalCents: true, currency: true, issuedAt: true, paymentStatus: true },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
  }

  async listForCorporate(corporateId: string) {
    return this.prisma.invoice.findMany({
      where: { corporateId },
      select: {
        id: true, number: true, kind: true, periodStart: true, periodEnd: true, totalCents: true, vatCents: true,
        subtotalCents: true, currency: true, issuedAt: true, paymentStatus: true, dueDate: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async listAll(page = 1) {
    const take = 50;
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({ orderBy: { issuedAt: 'desc' }, skip: (page - 1) * take, take }),
      this.prisma.invoice.count(),
    ]);
    return { items, total, page, pageSize: take, sellerComplete: this.sellerComplete() };
  }

  /** PDF d'une facture d'entreprise (route protégée par la 2FA du portail). */
  async corporatePdf(corporateId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.corporateId !== corporateId) throw new NotFoundException('Facture introuvable');
    return { number: invoice.number, data: await this.pdfBuffer(invoice) };
  }

  /** PDF d'une facture : client concerné ou équipe XLCAB (entreprises : route du portail, avec 2FA). */
  async pdf(user: RequestUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || !(await this.canRead(user, invoice))) throw new NotFoundException('Facture introuvable');
    return { number: invoice.number, data: await this.pdfBuffer(invoice) };
  }

  /**
   * Lien de téléchargement court (5 min) pour l'app mobile, qui ouvre le PDF
   * dans le navigateur du téléphone (sans en-tête d'authentification).
   */
  async downloadLink(user: RequestUser, invoiceId: string, baseUrl: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || !(await this.canRead(user, invoice))) throw new NotFoundException('Facture introuvable');
    const token = this.jwt.sign({ inv: invoice.id, sub: user.sub }, { secret: this.linkSecret(), expiresIn: LINK_TTL });
    return { url: `${baseUrl}/api/v1/invoices/${invoice.id}/file?token=${encodeURIComponent(token)}` };
  }

  async pdfFromLink(invoiceId: string, token: string | undefined) {
    let payload: { inv?: string };
    try {
      payload = this.jwt.verify(token ?? '', { secret: this.linkSecret() });
    } catch {
      throw new UnauthorizedException('Lien expiré : relancez le téléchargement depuis l’application');
    }
    if (payload.inv !== invoiceId) throw new UnauthorizedException('Lien invalide');
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Facture introuvable');
    return { number: invoice.number, data: await this.pdfBuffer(invoice) };
  }

  /** Facture d'une course (affichée sur l'écran 8 au client). */
  async forTrip(tripId: string) {
    return this.prisma.invoice.findFirst({
      where: { tripId, kind: 'invoice' },
      select: { id: true, number: true },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Mentions du vendeur toutes renseignées (sinon : alerte dans le dashboard admin). */
  sellerComplete(): boolean {
    return ['INVOICE_SELLER_LEGAL_FORM', 'INVOICE_SELLER_CAPITAL', 'INVOICE_SELLER_ADDRESS', 'INVOICE_SELLER_SIREN', 'INVOICE_SELLER_RCS', 'INVOICE_SELLER_VAT_NUMBER', 'INVOICE_SELLER_REVTC']
      .every((k) => !!this.config.get<string>(k)) && bankDetailsFrom((k) => this.config.get<string>(k)) !== null;
  }

  // ── Mécanique interne ───────────────────────────────────────────────

  private async issue(input: {
    kind: 'invoice' | 'credit_note';
    jurisdiction: string;
    tripId?: string;
    corporateId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
    tripIds?: string[];
    customerUserId?: string | null;
    buyer: Party;
    lines: InvoiceLine[];
    paymentStatus: 'paid' | 'due';
    dueDate?: Date;
    creditedInvoiceId?: string;
  }) {
    const subtotalCents = input.lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
    const vatCents = input.lines.reduce((s, l) => s + l.vatCents, 0);
    const seller = this.seller();
    // Facture à régler par virement : compte à créditer, figé avec la facture.
    if (input.kind === 'invoice' && input.paymentStatus === 'due') {
      seller.bank = bankDetailsFrom((k) => this.config.get<string>(k));
      if (!seller.bank) {
        this.logger.warn('Facture à régler émise sans IBAN : INVOICE_SELLER_IBAN absent ou invalide');
        await this.audit.log({ action: 'invoice.bank_details_missing', entity: 'Invoice', metadata: { customerUserId: input.customerUserId ?? null, corporateId: input.corporateId ?? null } });
      }
    }
    const year = new Date().getUTCFullYear();

    // Numéro attribué dans la même transaction que la facture : sans trou.
    const invoice = await this.prisma.$transaction(async (tx) => {
      const series = `${input.kind === 'invoice' ? 'FA' : 'AV'}-${year}`;
      const counter = await tx.invoiceCounter.upsert({
        where: { key: series },
        create: { key: series, last: 1 },
        update: { last: { increment: 1 } },
      });
      return tx.invoice.create({
        data: {
          number: `${series}-${String(counter.last).padStart(6, '0')}`,
          kind: input.kind,
          jurisdiction: input.jurisdiction,
          tripId: input.tripId ?? null,
          corporateId: input.corporateId ?? null,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          tripIds: input.tripIds ?? [],
          customerUserId: input.customerUserId ?? null,
          seller: seller as unknown as Prisma.InputJsonValue,
          buyer: input.buyer as unknown as Prisma.InputJsonValue,
          lines: input.lines as unknown as Prisma.InputJsonValue,
          subtotalCents,
          vatCents,
          totalCents: subtotalCents + vatCents,
          paymentStatus: input.paymentStatus,
          dueDate: input.dueDate ?? null,
          creditedInvoiceId: input.creditedInvoiceId ?? null,
        },
      });
    });

    // PDF archivé ; s'il échoue, il sera régénéré à la première consultation.
    try {
      await this.pdfBuffer(invoice);
    } catch (err) {
      this.logger.error(`PDF de la facture ${invoice.number} non généré : ${(err as Error).message}`);
    }
    await this.audit.log({ action: `invoice.${input.kind}`, entity: 'Invoice', entityId: invoice.id, metadata: { number: invoice.number, totalCents: invoice.totalCents } });
    return invoice;
  }

  private async pdfBuffer(invoice: Prisma.InvoiceGetPayload<object>): Promise<Buffer> {
    if (invoice.pdfKey) {
      try {
        return await this.storage.get(invoice.pdfKey);
      } catch {
        // Fichier manquant : régénéré à l'identique depuis les données figées.
      }
    }
    const credited = invoice.creditedInvoiceId
      ? await this.prisma.invoice.findUnique({ where: { id: invoice.creditedInvoiceId }, select: { number: true } })
      : null;
    const lines = invoice.lines as unknown as InvoiceLine[];
    const doc: InvoiceDocument = {
      number: invoice.number,
      kind: invoice.kind as 'invoice' | 'credit_note',
      issuedAt: invoice.issuedAt,
      seller: invoice.seller as unknown as Party,
      buyer: invoice.buyer as unknown as Party,
      lines,
      subtotalCents: invoice.subtotalCents,
      vatCents: invoice.vatCents,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      paymentStatus: invoice.paymentStatus as 'paid' | 'due',
      dueDate: invoice.dueDate,
      creditedNumber: credited?.number ?? null,
      periodLabel: invoice.periodStart
        ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(invoice.periodStart)
        : null,
      mentions: this.mentions(lines, invoice.paymentStatus === 'due'),
    };
    const data = await renderInvoicePdf(doc);
    const key = `invoice-${invoice.number}-${randomUUID()}.pdf`;
    await this.storage.put(key, data, 'application/pdf');
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { pdfKey: key } });
    return data;
  }

  /** Lignes d'une course, une par régime de TVA (Partie 11.4). */
  private tripLines(
    trip: {
      type: string; shuttleType: string; originAddress: string; destinationAddress: string; scheduledAt: Date | null;
      completedAt: Date | null; totalPriceCents: number | null; vatCents: number;
      priceLines: { regime: string; baseCents: number; ratePercent: Prisma.Decimal | number; vatCents: number }[];
      passengerBooking: { seats: number } | null;
    },
    suffix = '',
  ): InvoiceLine[] {
    const when = day(trip.completedAt ?? trip.scheduledAt);
    const shuttle = SHUTTLE_LABELS[trip.shuttleType] ?? trip.shuttleType;
    const seats = trip.passengerBooking?.seats;
    const label = (regime: string) =>
      regime === 'parcel'
        ? `Transport de colis ${this.route(trip)}, le ${when} (${shuttle})${suffix}`
        : `Transport de personnes ${this.route(trip)}, le ${when} (${shuttle}${seats ? `, ${seats} passager${seats > 1 ? 's' : ''}` : ''})${suffix}`;
    const priceLines = trip.priceLines.length
      ? trip.priceLines
      : [{ regime: trip.type === 'parcel' ? 'parcel' : 'passenger', baseCents: (trip.totalPriceCents ?? 0) - trip.vatCents, ratePercent: 0, vatCents: trip.vatCents }];
    return priceLines.map((l) => ({
      description: label(l.regime),
      quantity: 1,
      unitCents: l.baseCents,
      regime: l.regime,
      vatRate: Number(l.ratePercent),
      vatCents: l.vatCents,
      totalCents: l.baseCents + l.vatCents,
    }));
  }

  private route(t: { originAddress: string; destinationAddress: string }) {
    return `${t.originAddress} → ${t.destinationAddress}`;
  }

  private async personBuyer(userId: string): Promise<Party> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } });
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || 'Client';
    return { name, lines: u?.email ? [u.email] : [] };
  }

  /** Identité du vendeur (mentions obligatoires), depuis la configuration. */
  private seller(): Party {
    const c = (k: string) => this.config.get<string>(k) || MISSING;
    return {
      name: this.config.get<string>('INVOICE_SELLER_NAME') || 'XLCAB France SAS',
      lines: [
        c('INVOICE_SELLER_ADDRESS'),
        `${c('INVOICE_SELLER_LEGAL_FORM')} au capital de ${c('INVOICE_SELLER_CAPITAL')}`,
        `SIREN ${c('INVOICE_SELLER_SIREN')} — RCS ${c('INVOICE_SELLER_RCS')}`,
        `TVA intracommunautaire : ${c('INVOICE_SELLER_VAT_NUMBER')}`,
        `Inscription au registre VTC (REVTC) : ${c('INVOICE_SELLER_REVTC')}`,
        this.config.get<string>('INVOICE_SELLER_EMAIL') || 'facturation@xlcab.com',
      ],
    };
  }

  private mentions(lines: InvoiceLine[], b2bDue: boolean): string[] {
    const m: string[] = [];
    if (lines.some((l) => l.regime === 'passenger' && l.vatRate === 0)) {
      m.push(this.config.get<string>('INVOICE_PASSENGER_VAT_MENTION') || 'Transport de personnes : exonération de TVA (article 261-4-4° du CGI).');
    }
    if (lines.some((l) => l.regime === 'cancellation')) {
      m.push('Indemnité d’annulation prévue par les conditions générales de vente : hors champ de la TVA.');
    }
    if (b2bDue) {
      m.push('En cas de retard de paiement : pénalités au taux de trois fois le taux d’intérêt légal, et indemnité forfaitaire pour frais de recouvrement de 40 € (articles L441-10 et D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.');
    }
    m.push('Facture conservée 10 ans par XLCAB. Données personnelles : voir notre politique de confidentialité.');
    return m;
  }

  private async canRead(user: RequestUser, invoice: { customerUserId: string | null; corporateId: string | null }) {
    if (user.role === 'admin') return true;
    // Factures d'entreprise : uniquement via le portail (double authentification).
    return !!invoice.customerUserId && invoice.customerUserId === user.sub && !invoice.corporateId;
  }

  /** Clé dérivée : un jeton de lien ne vaut ni jeton d'accès ni preuve 2FA. */
  private linkSecret() {
    return createHash('sha256').update(`${this.config.get<string>('JWT_SECRET')}:xlcab-invoice-link`).digest('hex');
  }

  private async failed(kind: string, id: string, err: unknown) {
    this.logger.error(`Facture ${kind} non émise (${id}) : ${(err as Error).message}`);
    try {
      await this.audit.log({ action: 'invoice.failed', entity: 'Trip', entityId: id, metadata: { kind, error: (err as Error).message } });
    } catch {
      // Journal indisponible : l'erreur est déjà dans les logs.
    }
    return null;
  }

  /** Contrôle d'accès des routes « entreprise » (réutilisé par le contrôleur). */
  async corporateIdOfAdmin(user: RequestUser): Promise<string> {
    if (user.role !== 'corporate_admin') throw new ForbiddenException('Réservé aux administrateurs d’entreprise');
    const m = await this.prisma.corporateMember.findFirst({ where: { userId: user.sub, role: 'admin', isActive: true }, select: { corporateId: true } });
    if (!m) throw new ForbiddenException('Réservé aux administrateurs d’entreprise');
    return m.corporateId;
  }
}
