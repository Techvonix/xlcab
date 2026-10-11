import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { InvoicesService } from './invoices.service';

export class InvoicePageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class MonthlyRunDto {
  @IsUUID()
  corporateId!: string;

  /** Mois facturé, AAAA-MM. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mois au format AAAA-MM' })
  month!: string;
}

/** Réponse PDF (téléchargement), nom de fichier = numéro de facture. */
function pdfFile(res: any, number: string, data: Buffer) {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${number}.pdf"`, 'Cache-Control': 'no-store' });
  return new StreamableFile(data);
}

/** Factures du client connecté, et téléchargement du PDF. */
@Controller('api/v1/invoices')
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  mine(@Req() req: any) {
    return this.invoices.listMine(req.user);
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  async pdf(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: any) {
    const { number, data } = await this.invoices.pdf(req.user, id);
    return pdfFile(res, number, data);
  }

  /** App mobile : lien de 5 min, ouvert dans le navigateur du téléphone. */
  @Post(':id/link')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  link(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    return this.invoices.downloadLink(req.user, id, base);
  }

  /** Sans jeton d'accès : le lien signé (5 min, clé dérivée) fait foi. */
  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Query('token') token: string | undefined, @Res({ passthrough: true }) res: any) {
    const { number, data } = await this.invoices.pdfFromLink(id, token);
    return pdfFile(res, number, data);
  }
}

/**
 * Factures légales d'une entreprise (portail corporate, en plus du relevé
 * détaillé) : rôle corporate_admin + double authentification, comme tout le portail.
 */
@Controller('api/v1/corporate/invoices/issued')
@UseGuards(JwtAuthGuard, TwoFactorGuard)
export class CorporateInvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get()
  async list(@Req() req: any) {
    return this.invoices.listForCorporate(await this.invoices.corporateIdOfAdmin(req.user));
  }

  @Get(':id/pdf')
  async pdf(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: any) {
    const { number, data } = await this.invoices.corporatePdf(await this.invoices.corporateIdOfAdmin(req.user), id);
    return pdfFile(res, number, data);
  }
}

/** Factures côté équipe XLCAB (rôle admin + 2FA). */
@Controller('api/v1/admin/invoices')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminInvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get()
  list(@Query() q: InvoicePageDto) {
    return this.invoices.listAll(q.page ?? 1);
  }

  /** Émission manuelle d'une facture mensuelle d'entreprise (rattrapage). */
  @Post('monthly')
  @HttpCode(HttpStatus.OK)
  monthly(@Body() dto: MonthlyRunDto) {
    const [y, m] = dto.month.split('-').map(Number);
    return this.invoices.issueCorporateMonthly(dto.corporateId, new Date(Date.UTC(y, m - 1, 1)));
  }
}
