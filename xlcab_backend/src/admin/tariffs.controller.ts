import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { AdminCtx } from './admin.service';
import { TariffsService } from './tariffs.service';

const ctx = (req: any): AdminCtx => ({ adminId: req.user.sub, ...AuditService.context(req) });

// Bornes larges (centimes HT) : elles bloquent les aberrations, pas les choix commerciaux.
const KM_MIN = 10;
const KM_MAX = 2000;
const OPTION_MAX = 20_000;

export class RatesPerKmDto {
  @IsInt() @Min(KM_MIN) @Max(KM_MAX) rose!: number;
  @IsInt() @Min(KM_MIN) @Max(KM_MAX) bleue!: number;
  @IsInt() @Min(KM_MIN) @Max(KM_MAX) orange!: number;
  @IsInt() @Min(KM_MIN) @Max(KM_MAX) accessibility!: number;
}

export class CreateTariffDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  jurisdiction!: string;

  @ValidateNested()
  @Type(() => RatesPerKmDto)
  ratesPerKm!: RatesPerKmDto;

  @IsInt() @Min(0) @Max(OPTION_MAX) childSeatCents!: number;
  @IsInt() @Min(0) @Max(OPTION_MAX) wifiCents!: number;
  @IsInt() @Min(0) @Max(OPTION_MAX) extraLuggageCents!: number;
  @IsInt() @Min(0) @Max(OPTION_MAX) parcelFeeCents!: number;
  @IsInt() @Min(100) @Max(OPTION_MAX) sharedParcelCents!: number;

  /** Absent : application immédiate. */
  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveFrom?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Indiquez le motif (ex. hausse du carburant)' })
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  confirmLargeChange?: boolean;
}

export class TariffQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  jurisdiction?: string;
}

/** Tarifs réglables (dashboard admin), protégés comme tout l'admin : rôle + 2FA. */
@Controller('api/v1/admin/tariffs')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class TariffsController {
  constructor(private tariffs: TariffsService) {}

  @Get()
  overview(@Query() q: TariffQueryDto) {
    return this.tariffs.overview(q.jurisdiction ?? 'FR');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateTariffDto) {
    return this.tariffs.create({ ...dto, ratesPerKm: { ...dto.ratesPerKm } }, ctx(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.tariffs.cancelScheduled(id, ctx(req));
  }
}
