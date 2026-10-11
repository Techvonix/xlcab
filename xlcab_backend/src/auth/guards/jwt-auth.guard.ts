import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * À poser sur tout endpoint nécessitant une authentification :
 *
 *   @UseGuards(JwtAuthGuard)
 *   @Get('me')
 *   getMe(@Req() req) { return req.user; }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
