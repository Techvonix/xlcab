import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { CorporateService } from './corporate.service';
import {
  AddMemberDto,
  CorporateBookingDto,
  CreateCorporateAccountDto,
  MonthQueryDto,
  UpdateCorporateAccountDto,
} from './dto/corporate.dto';

/**
 * Endpoints "Corporate" de la Partie 6. Rôle vérifié ici (RolesGuard),
 * appartenance à l'entreprise revérifiée en base par le service, et
 * double authentification exigée (Partie 8 : obligatoire pour corporate_admin).
 */
@Controller('api/v1/corporate')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('corporate_admin')
export class CorporateController {
  constructor(private corporate: CorporateService) {}

  @Post('accounts')
  @Roles('admin') // ouverture validée par l'équipe XLCAB
  createAccount(@Req() req: any, @Body() dto: CreateCorporateAccountDto) {
    return this.corporate.createAccount(req.user, dto);
  }

  @Get('accounts/me')
  getAccount(@Req() req: any) {
    return this.corporate.getMyAccount(req.user);
  }

  @Patch('accounts/me')
  updateAccount(@Req() req: any, @Body() dto: UpdateCorporateAccountDto) {
    return this.corporate.updateMyAccount(req.user, dto);
  }

  @Get('members')
  listMembers(@Req() req: any) {
    return this.corporate.listMembers(req.user);
  }

  @Post('members')
  addMember(@Req() req: any, @Body() dto: AddMemberDto) {
    return this.corporate.addMember(req.user, dto);
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.OK)
  removeMember(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.corporate.removeMember(req.user, id);
  }

  @Get('analytics')
  analytics(@Req() req: any, @Query() q: MonthQueryDto) {
    return this.corporate.analytics(req.user, q.month);
  }

  @Get('invoices')
  invoices(@Req() req: any, @Query() q: MonthQueryDto) {
    return this.corporate.invoices(req.user, q.month);
  }

  @Post('bookings')
  book(@Req() req: any, @Body() dto: CorporateBookingDto) {
    return this.corporate.book(req.user, dto);
  }
}
