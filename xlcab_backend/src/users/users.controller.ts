import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateMeDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Prénom vide' })
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nom vide' })
  @MaxLength(60)
  lastName?: string;

  /** Langues de lancement (Partie 2) : français, anglais, irlandais. */
  @IsOptional()
  @IsIn(['fr', 'en', 'ga'])
  locale?: string;
}

export class DeleteMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

/** Endpoints "Users" de la Partie 6 (profil, export et effacement RGPD). */
@Controller('api/v1/users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  me(@Req() req: any) {
    return this.users.me(req.user);
  }

  @Patch()
  update(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.users.update(req.user, dto, AuditService.context(req));
  }

  /** Partie 8 : "Droit d'accès : GET /users/me/export". */
  @Get('export')
  export(@Req() req: any) {
    return this.users.export(req.user, AuditService.context(req));
  }

  /** Partie 8 : "Droit à l'effacement : DELETE /users/me (anonymisation)". */
  @Delete()
  @HttpCode(HttpStatus.OK)
  remove(@Req() req: any, @Body() dto: DeleteMeDto, @Headers('authorization') auth?: string) {
    return this.users.deleteAccount(req.user, dto.password, auth?.replace('Bearer ', ''), AuditService.context(req));
  }
}
