import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MAX_DOCUMENT_BYTES } from './drivers.constants';
import { DriversService, UploadedDocumentFile } from './drivers.service';
import { DriverApplicationDto, UploadDocumentDto } from './dto/driver-application.dto';

/** Endpoints "Drivers" de la Partie 6 couverts par le Module 8. */
@Controller('api/v1/drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private drivers: DriversService) {}

  /** Étape 5 : envoi de la candidature en validation. */
  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  apply(@Req() req: any, @Body() dto: DriverApplicationDto) {
    return this.drivers.apply(req.user, dto);
  }

  /** État de la candidature et des documents envoyés. */
  @Get('me/profile')
  profile(@Req() req: any) {
    return this.drivers.getApplication(req.user);
  }

  /**
   * Étapes 2 et 3 : un document par requête (multipart/form-data :
   * champ "type" + champ "file"). Fichier gardé en mémoire le temps de
   * la vérification, puis écrit dans le stockage privé.
   */
  @Post('me/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 2 },
    }),
  )
  upload(
    @Req() req: any,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ) {
    return this.drivers.uploadDocument(req.user, dto.type, file);
  }
}
