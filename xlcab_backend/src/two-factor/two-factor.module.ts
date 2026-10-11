import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TwoFactorGuard, proofFrom } from './two-factor.guard';
import { TWO_FACTOR_COOKIE, isWebClient, setCookie } from '../auth/web-session';

/** Durée de la preuve 2FA (12 h) ; cookie limité aux routes de l'API. */
const PROOF_COOKIE_SECONDS = 12 * 3600;

/**
 * Portail web : la preuve part en cookie HttpOnly (illisible par un script
 * injecté) et n'apparaît pas dans la réponse. App/outil : dans le corps.
 */
function deliverProof(req: any, res: any, proof: { twoFactorToken: string; expiresIn: number }) {
  if (!isWebClient(req)) return proof;
  setCookie(res, TWO_FACTOR_COOKIE, proof.twoFactorToken, PROOF_COOKIE_SECONDS, '/api');
  return { expiresIn: proof.expiresIn };
}
import { TwoFactorService } from './two-factor.service';

class TwoFactorCodeDto {
  @Matches(/^\d{6}$/, { message: 'Code à 6 chiffres' })
  code!: string;
}

/** Endpoints 2FA (en complément de /api/v1/auth du Module 2). */
@Controller('api/v1/auth/2fa')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'corporate_admin')
export class TwoFactorController {
  constructor(private twoFactor: TwoFactorService) {}

  @Get('status')
  async status(@Req() req: any) {
    // proofValid : le portail sait s'il doit afficher l'écran de code (il ne
    // voit pas le cookie HttpOnly).
    return { ...(await this.twoFactor.status(req.user)), proofValid: this.twoFactor.isValidProof(proofFrom(req), req.user.sub) };
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  setup(@Req() req: any) {
    return this.twoFactor.setup(req.user, AuditService.context(req));
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enable(@Req() req: any, @Body() dto: TwoFactorCodeDto, @Res({ passthrough: true }) res: any) {
    return deliverProof(req, res, await this.twoFactor.enable(req.user, dto.code, AuditService.context(req)));
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Req() req: any, @Body() dto: TwoFactorCodeDto, @Res({ passthrough: true }) res: any) {
    return deliverProof(req, res, await this.twoFactor.verify(req.user, dto.code, AuditService.context(req)));
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [TwoFactorController],
  providers: [TwoFactorService, TwoFactorGuard],
  exports: [TwoFactorService, TwoFactorGuard],
})
export class TwoFactorModule {}
