import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Au-delà, la liste n'est plus « favorite » et la saisie devient pénible. */
export const MAX_SAVED_ADDRESSES = 10;

export const DEFAULT_PREFERENCES = { notifyPush: true, notifyEmail: true, notifySms: false, marketing: false, autoShareTrips: false, preferWomanDriver: false };

export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() notifyPush?: boolean;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsBoolean() notifySms?: boolean;
  /** Offres et nouveautés XLCAB : consentement explicite (RGPD), désactivé par défaut. */
  @IsOptional() @IsBoolean() marketing?: boolean;
  /** Espace sécurité : proposer le partage du trajet à mes contacts de confiance à chaque course. */
  @IsOptional() @IsBoolean() autoShareTrips?: boolean;
  /** Préférence, pas exigence : une conductrice habilitée est sollicitée en premier quand il y en a une. */
  @IsOptional() @IsBoolean() preferWomanDriver?: boolean;
}

export class SaveAddressDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Donnez un nom à cette adresse (ex. Maison)' })
  @MaxLength(40, { message: 'Nom limité à 40 caractères' })
  label!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Adresse invalide' })
  @MaxLength(300)
  address!: string;

  @IsLatitude({ message: 'Latitude invalide' })
  lat!: number;

  @IsLongitude({ message: 'Longitude invalide' })
  lng!: number;
}

const ADDRESS_FIELDS = { id: true, label: true, address: true, lat: true, lng: true, createdAt: true } as const;

/** Préférences de notification et adresses favorites (Partie 6, écran 13). */
@Injectable()
export class UserSettingsService {
  constructor(private prisma: PrismaService) {}

  async preferences(userId: string) {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    return pick(row ?? DEFAULT_PREFERENCES);
  }

  async updatePreferences(userId: string, data: UpdatePreferencesDto) {
    const row = await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...data },
      update: data,
    });
    return pick(row);
  }

  addresses(userId: string) {
    return this.prisma.savedAddress.findMany({ where: { userId }, select: ADDRESS_FIELDS, orderBy: { createdAt: 'asc' } });
  }

  async saveAddress(userId: string, dto: SaveAddressDto) {
    const count = await this.prisma.savedAddress.count({ where: { userId } });
    if (count >= MAX_SAVED_ADDRESSES) {
      throw new BadRequestException(`${MAX_SAVED_ADDRESSES} adresses favorites au maximum : supprimez-en une d’abord`);
    }
    return this.prisma.savedAddress.create({
      data: { userId, label: dto.label, address: dto.address, lat: dto.lat, lng: dto.lng },
      select: ADDRESS_FIELDS,
    });
  }

  async deleteAddress(userId: string, id: string) {
    // Ownership : seule une adresse de l'utilisateur peut être supprimée ; sinon 404.
    const { count } = await this.prisma.savedAddress.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Adresse introuvable');
    return { deleted: true };
  }
}

const pick = (p: typeof DEFAULT_PREFERENCES) => ({
  notifyPush: p.notifyPush,
  notifyEmail: p.notifyEmail,
  notifySms: p.notifySms,
  marketing: p.marketing,
  autoShareTrips: p.autoShareTrips,
  preferWomanDriver: p.preferWomanDriver,
});

@Controller('api/v1/users/me')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(private settings: UserSettingsService) {}

  @Get('preferences')
  preferences(@Req() req: any) {
    return this.settings.preferences(req.user.sub);
  }

  @Patch('preferences')
  updatePreferences(@Req() req: any, @Body() dto: UpdatePreferencesDto) {
    return this.settings.updatePreferences(req.user.sub, dto);
  }

  @Get('addresses')
  addresses(@Req() req: any) {
    return this.settings.addresses(req.user.sub);
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  saveAddress(@Req() req: any, @Body() dto: SaveAddressDto) {
    return this.settings.saveAddress(req.user.sub, dto);
  }

  @Delete('addresses/:id')
  deleteAddress(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.settings.deleteAddress(req.user.sub, id);
  }
}
