import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { RefreshTokenDto } from './dto/token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { REFRESH_COOKIE, TWO_FACTOR_COOKIE, clearCookie, clearRefreshCookie, isWebClient, readCookie, webTokens } from './web-session';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() dto: SignupDto,
    @Ip() ip: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Headers('user-agent') userAgent?: string,
  ) {
    // Le rôle n'est plus fourni par le client : toujours "passenger".
    // IP et appareil : preuve du consentement (Partie 8, RGPD).
    const tokens = await this.authService.signup(dto.email, dto.password, {
      termsVersion: dto.termsVersion,
      ipAddress: ip,
      userAgent,
    });
    return webTokens(req, res, tokens);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    // L'IP sert au compteur de tentatives email+IP (Partie 8 / 10).
    // Portail web : refresh token en cookie HttpOnly (web-session.ts).
    return webTokens(req, res, await this.authService.login(dto.email, dto.password, ip));
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() dto: SendOtpDto, @Ip() ip: string) {
    // Limitation par numéro ET par IP (Partie 8).
    return this.authService.sendOtp(dto.phone, ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    // App mobile : jeton dans le corps. Portail web : jeton lu dans le cookie
    // HttpOnly (jamais exposé au JavaScript du portail).
    const token = dto.refreshToken ?? (isWebClient(req) ? readCookie(req, REFRESH_COOKIE) : undefined);
    if (!token) throw new UnauthorizedException('Session expirée, reconnectez-vous');
    return webTokens(req, res, await this.authService.refresh(token));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any, @Headers('authorization') authHeader: string, @Res({ passthrough: true }) res: any) {
    const token = authHeader?.replace('Bearer ', '');
    // Portail web : les cookies de session sont effacés.
    if (isWebClient(req)) {
      clearRefreshCookie(res);
      clearCookie(res, TWO_FACTOR_COOKIE, '/api');
    }
    // Ne révoque que la session de cet appareil (jti), pas les autres.
    return this.authService.logout(req.user.sub, req.user.jti, token);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  deleteAccount(@Req() req: any) {
    // Anonymisation RGPD (Partie 8 : "Droit à l'effacement") —
    // implémentation complète dans UsersService, appelée ici.
    return { message: 'Suppression de compte à implémenter dans UsersModule' };
  }

  // Les endpoints forgot-password, reset-password, oauth/google et
  // oauth/apple suivent le même schéma et seront ajoutés avec
  // l'intégration SendGrid / Firebase Auth (hors scope de ce module).
}
