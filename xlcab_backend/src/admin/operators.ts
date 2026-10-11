import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { OPERATOR_STATUSES } from '../operators/line-schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { PageQueryDto } from './dto/admin.dto';

const PAGE_SIZE = 25;

export class OperatorsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(OPERATOR_STATUSES, { message: 'Statut invalide' })
  status?: string;
}

export class ReviewOperatorDto {
  @IsOptional()
  @IsIn(OPERATOR_STATUSES, { message: 'Statut invalide' })
  status?: string;

  /** Vente à la place : licence LOTI / registre vérifiée. */
  @IsOptional()
  @IsBoolean()
  perSeatAllowed?: boolean;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: 'Motif : 5 caractères minimum' })
  @MaxLength(500)
  reason!: string;
}

/**
 * Vérification des opérateurs de la bourse (Module 10) : profil
 * professionnel, licence de transport, suspension. Un opérateur suspendu
 * ou dont la vente à la place est retirée disparaît aussitôt des recherches.
 */
@Injectable()
export class AdminOperatorsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(q: OperatorsQueryDto) {
    const where = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.operatorProfile.findMany({ where, orderBy: { createdAt: 'desc' }, skip: ((q.page ?? 1) - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.operatorProfile.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [users, drivers, lines] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }),
      this.prisma.driverProfile.findMany({ where: { id: { in: ids } }, select: { id: true, approvedAt: true } }),
      this.prisma.recurringLine.findMany({ where: { operatorId: { in: ids }, status: { in: ['active', 'paused'] } }, select: { operatorId: true } }),
    ]);
    return {
      items: rows.map((r) => {
        const u = users.find((x) => x.id === r.id);
        return {
          ...r,
          name: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : null,
          email: u?.email ?? null,
          driverApproved: Boolean(drivers.find((d) => d.id === r.id)?.approvedAt),
          openLines: lines.filter((l) => l.operatorId === r.id).length,
        };
      }),
      total,
      page: q.page ?? 1,
      pageSize: PAGE_SIZE,
    };
  }

  async review(id: string, dto: ReviewOperatorDto, ctx: { adminId: string; ipAddress?: string; userAgent?: string }) {
    const operator = await this.prisma.operatorProfile.findUnique({ where: { id } });
    if (!operator) throw new NotFoundException('Opérateur introuvable');
    if (dto.status === undefined && dto.perSeatAllowed === undefined) throw new BadRequestException('Rien à modifier');

    if (dto.status === 'verified') {
      const driver = await this.prisma.driverProfile.findUnique({ where: { id } });
      if (!driver?.approvedAt) throw new BadRequestException('Le compte chauffeur doit d’abord être validé');
    }
    if (dto.perSeatAllowed && !operator.transportLicense) {
      throw new BadRequestException('Licence de transport non renseignée : vente à la place impossible');
    }

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.verifiedAt = dto.status === 'verified' ? new Date() : operator.verifiedAt;
    }
    if (dto.perSeatAllowed !== undefined) data.perSeatAllowed = dto.perSeatAllowed;
    const updated = await this.prisma.operatorProfile.update({ where: { id }, data });
    await this.audit.log({
      userId: ctx.adminId,
      action: 'operator.review',
      entity: 'OperatorProfile',
      entityId: id,
      metadata: { status: dto.status, perSeatAllowed: dto.perSeatAllowed, reason: dto.reason },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return updated;
  }
}

@Controller('api/v1/admin/operators')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminOperatorsController {
  constructor(private operators: AdminOperatorsService) {}

  @Get()
  list(@Query() q: OperatorsQueryDto) {
    return this.operators.list(q);
  }

  @Patch(':id')
  review(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewOperatorDto) {
    return this.operators.review(id, dto, { adminId: req.user.sub, ...AuditService.context(req) });
  }
}
