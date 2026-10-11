import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { CreateOfferDto, CreateRequestDto, MarketQueryDto, MessageDto } from './dto';
import { MarketService } from './market.service';

const CLIENTS = ['passenger', 'corporate_member', 'corporate_admin'];

/** Bourse côté client : demandes, propositions reçues, choix. */
@Controller('api/v1/market')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketController {
  constructor(private market: MarketService) {}

  @Post('requests')
  @Roles(...CLIENTS)
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateRequestDto) {
    return this.market.create(req.user.sub, dto);
  }

  @Get('requests')
  @Roles(...CLIENTS)
  mine(@Req() req: any, @Query() q: MarketQueryDto) {
    return this.market.myRequests(req.user.sub, q);
  }

  @Get('requests/:id')
  @Roles(...CLIENTS)
  get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.getRequest(req.user.sub, id);
  }

  @Post('requests/:id/publish')
  @Roles(...CLIENTS)
  @HttpCode(HttpStatus.OK)
  publish(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.publish(req.user.sub, id);
  }

  @Post('requests/:id/cancel')
  @Roles(...CLIENTS)
  @HttpCode(HttpStatus.OK)
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.cancelRequest(req.user.sub, id);
  }

  @Get('requests/:id/offers')
  @Roles(...CLIENTS)
  offers(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.offersFor(req.user.sub, id);
  }

  @Get('requests/:id/lines')
  @Roles(...CLIENTS)
  lines(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.lineMatches(req.user.sub, id);
  }

  @Post('offers/:id/accept')
  @Roles(...CLIENTS)
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.acceptOffer(req.user.sub, id);
  }

  // ── Côté opérateur ──

  @Get('feed')
  @Roles('driver')
  feed(@Req() req: any) {
    return this.market.feed(req.user.sub);
  }

  @Post('requests/:id/offers')
  @Roles('driver')
  @HttpCode(HttpStatus.CREATED)
  propose(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateOfferDto) {
    return this.market.propose(req.user.sub, id, dto);
  }

  @Get('my-offers')
  @Roles('driver')
  myOffers(@Req() req: any) {
    return this.market.myOffers(req.user.sub);
  }

  @Post('offers/:id/withdraw')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  withdraw(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.withdraw(req.user.sub, id);
  }

  @Post('offers/:id/confirm')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.confirm(req.user.sub, id);
  }

  @Post('offers/:id/decline')
  @Roles('driver')
  @HttpCode(HttpStatus.OK)
  decline(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.decline(req.user.sub, id);
  }

  // ── Messagerie (client ou opérateur de la proposition) ──

  @Get('offers/:id/messages')
  @Roles(...CLIENTS, 'driver')
  messages(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.market.messages(req.user.sub, id);
  }

  @Post('offers/:id/messages')
  @Roles(...CLIENTS, 'driver')
  @HttpCode(HttpStatus.CREATED)
  post(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    return this.market.postMessage(req.user.sub, id, dto.body);
  }
}

/** Suivi de la bourse par l'équipe XLCAB (2FA). */
@Controller('api/v1/admin/market')
@UseGuards(JwtAuthGuard, RolesGuard, TwoFactorGuard)
@Roles('admin')
export class AdminMarketController {
  constructor(private market: MarketService) {}

  @Get('requests')
  list(@Query() q: MarketQueryDto) {
    return this.market.adminList(q);
  }
}
