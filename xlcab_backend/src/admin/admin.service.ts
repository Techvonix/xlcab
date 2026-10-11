import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentStorage } from '../drivers/document-storage';
import { requiredDocuments } from '../drivers/drivers.constants';
import { TRIP_STATUSES, UpdateJurisdictionDto, USER_ROLES } from './dto/admin.dto';

const PAGE_SIZE = 25;

export interface AdminCtx {
  adminId: string;
  ipAddress?: string;
  userAgent?: string;
}

const page = (p?: number) => ({ skip: ((p ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE });

/**
 * Dashboard admin (Partie 9, Module 10) : validation des chauffeurs,
 * suivi des courses, incidents, statistiques, juridictions. Toutes les
 * décisions et consultations de documents sont tracées (AuditLog).
 */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private storage: DocumentStorage,
  ) {}

  // ── Chauffeurs à valider ────────────────────────────────────────────

  async pendingDrivers() {
    const profiles = await this.prisma.driverProfile.findMany({ where: { approvedAt: null } });
    const ids = profiles.map((p) => p.id);
    const [users, vehicles, documents, configs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, jurisdiction: true, createdAt: true },
      }),
      this.prisma.vehicle.findMany({ where: { driverId: { in: ids } } }),
      this.prisma.driverDocument.findMany({
        where: { userId: { in: ids } },
        // Jamais la clé de stockage : le fichier passe par l'endpoint dédié (audité).
        select: { id: true, userId: true, type: true, status: true, mimeType: true, sizeBytes: true, uploadedAt: true },
      }),
      this.prisma.jurisdictionConfig.findMany({ select: { code: true, requiresVtcCard: true } }),
    ]);
    const vtcRequired = new Map(configs.map((c) => [c.code, c.requiresVtcCard]));

    return profiles.map((p) => {
      const user = users.find((u) => u.id === p.id);
      return {
        driverId: p.id,
        user,
        profile: {
          licenseNumber: p.licenseNumber,
          licenseExpiry: p.licenseExpiry,
          vtcCardNumber: p.vtcCardNumber,
          vtcCardExpiry: p.vtcCardExpiry,
          revtcNumber: p.revtcNumber,
          pmrTrained: p.pmrTrained,
          languages: p.languages,
          preferredShuttle: p.preferredShuttle,
        },
        vehicle: vehicles.find((v) => v.driverId === p.id) ?? null,
        documents: documents.filter((d) => d.userId === p.id).map(({ userId: _u, ...d }) => d),
        requiredDocuments: requiredDocuments(vtcRequired.get(user?.jurisdiction ?? 'FR') ?? true),
      };
    });
  }

  /** Fichier d'un document, pour affichage dans le dashboard. Chaque consultation est tracée (RGPD). */
  async documentFile(driverId: string, documentId: string, ctx: AdminCtx) {
    const doc = await this.prisma.driverDocument.findFirst({
      where: { id: documentId, userId: driverId },
      select: { id: true, type: true, storageKey: true, mimeType: true },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    const data = await this.storage.get(doc.storageKey);
    await this.audit.log({
      userId: ctx.adminId, action: 'document.view', entity: 'DriverDocument', entityId: doc.id,
      metadata: { driverId, type: doc.type }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    return { data, mimeType: doc.mimeType, filename: `${doc.type}.${doc.mimeType === 'application/pdf' ? 'pdf' : doc.mimeType === 'image/png' ? 'png' : 'jpg'}` };
  }

  async reviewDocument(driverId: string, documentId: string, status: 'approved' | 'rejected', reason: string | undefined, ctx: AdminCtx) {
    const doc = await this.prisma.driverDocument.findFirst({ where: { id: documentId, userId: driverId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    if (status === 'rejected' && !reason) throw new BadRequestException('Motif requis pour refuser un document');

    await this.prisma.driverDocument.update({ where: { id: doc.id }, data: { status } });
    await this.audit.log({
      userId: ctx.adminId, action: `document.${status === 'approved' ? 'approve' : 'reject'}`, entity: 'DriverDocument',
      entityId: doc.id, metadata: { driverId, type: doc.type, reason }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    if (status === 'rejected') {
      await this.notifications.notify(driverId, 'driver.document_rejected', 'Document à renvoyer', reason!, { type: doc.type });
    }
    return { id: doc.id, status };
  }

  /**
   * Validation du dossier : tous les documents obligatoires approuvés,
   * aucune échéance dépassée. Le compte devient "driver", le véhicule
   * entre dans le matching.
   */
  async approveDriver(driverId: string, roseEligible: boolean, ctx: AdminCtx) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!profile) throw new NotFoundException('Candidature introuvable');
    if (profile.approvedAt) throw new ConflictException('Chauffeur déjà validé');

    const user = await this.prisma.user.findUnique({ where: { id: driverId }, select: { jurisdiction: true } });
    const config = await this.prisma.jurisdictionConfig.findUnique({
      where: { code: user?.jurisdiction ?? 'FR' },
      select: { requiresVtcCard: true },
    });
    const required = requiredDocuments(config?.requiresVtcCard ?? true);

    const docs = await this.prisma.driverDocument.findMany({ where: { userId: driverId }, select: { type: true, status: true } });
    const notApproved = required.filter((t) => !docs.some((d) => d.type === t && d.status === 'approved'));
    if (notApproved.length > 0) {
      throw new BadRequestException(`Documents à approuver d’abord : ${notApproved.join(', ')}`);
    }

    const now = new Date();
    const vehicles = await this.prisma.vehicle.findMany({ where: { driverId } });
    const expired = [
      !profile.licenseExpiry || profile.licenseExpiry <= now ? 'permis' : null,
      config?.requiresVtcCard !== false && (!profile.vtcCardExpiry || profile.vtcCardExpiry <= now) ? 'carte VTC' : null,
      vehicles.some((v) => !v.insuranceExpiry || v.insuranceExpiry <= now) ? 'assurance' : null,
      vehicles.some((v) => !v.technicalControlExpiry || v.technicalControlExpiry <= now) ? 'contrôle technique' : null,
    ].filter(Boolean);
    if (expired.length > 0) throw new BadRequestException(`Échéance dépassée : ${expired.join(', ')}`);
    if (vehicles.length === 0) throw new BadRequestException('Aucun véhicule déclaré');

    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { id: driverId },
        data: { approvedAt: now, documentsVerified: true, roseEligible },
      });
      await tx.user.update({ where: { id: driverId }, data: { role: 'driver' } });
      for (const v of vehicles) {
        await tx.vehicle.update({ where: { id: v.id }, data: { isAvailable: true } });
      }
    });

    await this.audit.log({
      userId: ctx.adminId, action: 'driver.approve', entity: 'DriverProfile', entityId: driverId,
      metadata: { roseEligible }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    await this.notifications.notify(
      driverId, 'driver.approved', 'Compte chauffeur validé',
      'Votre dossier est validé. Vous pouvez passer en ligne et recevoir des missions.',
    );
    return { driverId, approvedAt: now };
  }

  /**
   * Refus motivé : la candidature est retirée (le candidat peut en
   * déposer une nouvelle), les documents non approuvés sont marqués
   * refusés, le motif lui est notifié.
   */
  async rejectDriver(driverId: string, reason: string, ctx: AdminCtx) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!profile) throw new NotFoundException('Candidature introuvable');
    if (profile.approvedAt) throw new ConflictException('Chauffeur déjà validé : utilisez la suspension');

    const [vehicles, docs] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { driverId } }),
      this.prisma.driverDocument.findMany({ where: { userId: driverId, status: 'pending' }, select: { id: true } }),
    ]);
    await this.prisma.$transaction(async (tx) => {
      for (const d of docs) await tx.driverDocument.update({ where: { id: d.id }, data: { status: 'rejected' } });
      for (const v of vehicles) await tx.vehicle.delete({ where: { id: v.id } });
      await tx.driverProfile.delete({ where: { id: driverId } });
    });

    await this.audit.log({
      userId: ctx.adminId, action: 'driver.reject', entity: 'DriverProfile', entityId: driverId,
      metadata: { reason }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    await this.notifications.notify(driverId, 'driver.rejected', 'Dossier chauffeur refusé', reason);
    return { driverId, rejected: true };
  }

  // ── Utilisateurs ────────────────────────────────────────────────────

  async users(q: { search?: string; role?: string; page?: number }) {
    const where = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.search ? { email: { contains: q.search.toLowerCase(), mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        // Jamais le hash du mot de passe ni les identifiants externes.
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true, role: true,
          jurisdiction: true, emailVerified: true, phoneVerified: true, createdAt: true, deletedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        ...page(q.page),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: q.page ?? 1, pageSize: PAGE_SIZE };
  }

  // ── Courses ─────────────────────────────────────────────────────────

  async trips(q: { status?: string; page?: number }) {
    const where = q.status ? { status: q.status } : {};
    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        select: {
          id: true, status: true, type: true, shuttleType: true, originAddress: true, destinationAddress: true,
          scheduledAt: true, totalPriceCents: true, passengerId: true, driverId: true, corporateId: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        ...page(q.page),
      }),
      this.prisma.trip.count({ where }),
    ]);
    const ids = [...new Set(trips.flatMap((t) => [t.passengerId, t.driverId]).filter((x): x is string => Boolean(x)))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const name = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : null;
    };
    return {
      items: trips.map((t) => ({ ...t, passengerName: name(t.passengerId), driverName: name(t.driverId) })),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  // ── Statistiques ────────────────────────────────────────────────────

  async analytics() {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [usersByRole, pendingDrivers, tripsByStatus, openIncidents, completed] = await Promise.all([
      Promise.all(USER_ROLES.map(async (role) => ({ role, count: await this.prisma.user.count({ where: { role, deletedAt: null } }) }))),
      this.prisma.driverProfile.count({ where: { approvedAt: null } }),
      Promise.all(TRIP_STATUSES.map(async (status) => ({ status, count: await this.prisma.trip.count({ where: { status, createdAt: { gte: since } } }) }))),
      this.prisma.incident.count({ where: { status: { not: 'resolved' } } }),
      this.prisma.trip.findMany({
        where: { status: 'completed', completedAt: { gte: since } },
        select: { totalPriceCents: true, priceLines: { select: { regime: true, baseCents: true, vatCents: true } } },
      }),
    ]);

    const revenue = { ttcCents: 0, passengerHtCents: 0, parcelHtCents: 0, vatCents: 0 };
    for (const t of completed) {
      revenue.ttcCents += t.totalPriceCents ?? 0;
      for (const l of t.priceLines) {
        if (l.regime === 'parcel') revenue.parcelHtCents += l.baseCents;
        else revenue.passengerHtCents += l.baseCents;
        revenue.vatCents += l.vatCents;
      }
    }
    return { periodDays: 30, usersByRole, pendingDrivers, tripsByStatus, openIncidents, revenue, completedTrips: completed.length };
  }

  // ── Incidents (SOS) ─────────────────────────────────────────────────

  async incidents(q: { status?: string; page?: number }) {
    const where = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({ where, orderBy: { createdAt: 'desc' }, ...page(q.page) }),
      this.prisma.incident.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.userId))] } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    return {
      items: items.map((i) => ({ ...i, reporter: users.find((u) => u.id === i.userId) ?? null })),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  async acknowledgeIncident(id: string, ctx: AdminCtx) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident introuvable');
    if (incident.status !== 'open') throw new ConflictException('Incident déjà pris en charge');
    await this.prisma.incident.update({
      where: { id },
      data: { status: 'acknowledged', acknowledgedBy: ctx.adminId, acknowledgedAt: new Date() },
    });
    await this.audit.log({ userId: ctx.adminId, action: 'incident.acknowledge', entity: 'Incident', entityId: id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { id, status: 'acknowledged' };
  }

  async resolveIncident(id: string, notes: string, ctx: AdminCtx) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Incident introuvable');
    if (incident.status === 'resolved') throw new ConflictException('Incident déjà clôturé');
    await this.prisma.incident.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedBy: ctx.adminId,
        resolvedAt: new Date(),
        notes,
        // Une résolution directe vaut prise en charge.
        acknowledgedBy: incident.acknowledgedBy ?? ctx.adminId,
        acknowledgedAt: incident.acknowledgedAt ?? new Date(),
      },
    });
    await this.audit.log({ userId: ctx.adminId, action: 'incident.resolve', entity: 'Incident', entityId: id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { id, status: 'resolved' };
  }

  // ── Journal d'audit ─────────────────────────────────────────────────

  async auditLogs(q: { action?: string; page?: number }) {
    const where = q.action ? { action: q.action } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...page(q.page) }),
      this.prisma.auditLog.count({ where }),
    ]);
    // BigInt n'est pas sérialisable en JSON.
    return { items: items.map((l) => ({ ...l, id: l.id.toString() })), total, page: q.page ?? 1, pageSize: PAGE_SIZE };
  }

  // ── Juridictions ────────────────────────────────────────────────────

  async updateJurisdiction(code: string, dto: UpdateJurisdictionDto, ctx: AdminCtx) {
    const before = await this.prisma.jurisdictionConfig.findUnique({ where: { code } });
    if (!before) throw new NotFoundException('Juridiction introuvable');
    const after = await this.prisma.jurisdictionConfig.update({ where: { code }, data: dto });
    // Taux de TVA, distance minimale… : changements à fort impact, tracés
    // avec l'état avant/après.
    await this.audit.log({
      userId: ctx.adminId, action: 'jurisdiction.update', entity: 'JurisdictionConfig', entityId: code,
      metadata: { changes: dto, before: JSON.parse(JSON.stringify(before)) }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
    return after;
  }
}
