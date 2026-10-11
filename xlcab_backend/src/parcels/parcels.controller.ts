import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { MAX_DOCUMENT_BYTES } from '../drivers/drivers.constants';
import { CreateParcelDto, ParcelDeliverDto, ParcelFailDto, ParcelPickupDto, ParcelQuoteDto } from './dto/parcel.dto';
import { ParcelsService, UploadedImage } from './parcels.service';

const imageUpload = FileInterceptor('photo', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 2 } });

/**
 * Endpoints "Bookings colis" de la Partie 6. L'annulation passe par
 * POST /trips/:tripId/cancel (frais CGV et remboursement communs à toutes
 * les courses), d'où l'absence de PATCH /bookings/parcel/:id/cancel.
 */
@Controller('api/v1/bookings/parcel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParcelsController {
  constructor(private parcels: ParcelsService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Req() req: any, @Body() dto: ParcelQuoteDto) {
    return this.parcels.quote(req.user.sub, dto);
  }

  /** Réservation + feuille de paiement Stripe (prépaiement, comme les passagers). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateParcelDto) {
    return this.parcels.create(req.user.sub, dto, AuditService.context(req));
  }

  @Get('history')
  history(@Req() req: any) {
    return this.parcels.history(req.user.sub);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.parcels.get(req.user, id);
  }

  @Post(':id/photo')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(imageUpload)
  photo(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedImage | undefined) {
    return this.parcels.uploadPhoto(req.user, id, file);
  }

  @Post(':id/pickup')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  pickup(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ParcelPickupDto) {
    return this.parcels.pickup(req.user, id, dto.qrCode, AuditService.context(req));
  }

  /** multipart/form-data : champ "code" (4 chiffres) + fichier "photo". */
  @Post(':id/deliver')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUpload)
  deliver(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ParcelDeliverDto,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    return this.parcels.deliver(req.user, id, dto.code, file, AuditService.context(req));
  }

  @Post(':id/fail')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  fail(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ParcelFailDto) {
    return this.parcels.fail(req.user, id, dto.reason, AuditService.context(req));
  }
}
