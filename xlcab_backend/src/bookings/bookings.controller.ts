import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from './bookings.service';
import { CreatePassengerBookingDto, HistoryQueryDto, PassengerQuoteDto } from './dto/passenger-quote.dto';

/**
 * Endpoints "Bookings passager" de la Partie 6 : devis et réservation.
 * Annulation : POST /trips/:id/cancel (module Trips).
 */
@Controller('api/v1/bookings/passenger')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private bookings: BookingsService,
    private payments: PaymentsService,
  ) {}

  /** Historique des courses du passager connecté (ownership : passengerId = token). */
  @Get('history')
  history(@Req() req: any, @Query() q: HistoryQueryDto) {
    return this.bookings.history(req.user.sub, q.limit ?? 20, q.page ?? 1);
  }

  /** Devis : appelé par l'app à chaque modification du formulaire (écran 6). */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Req() req: any, @Body() dto: PassengerQuoteDto) {
    return this.bookings.quotePassenger(req.user.sub, dto);
  }

  /**
   * Réservation : course créée au prix recalculé par le serveur, puis
   * paramètres de la feuille de paiement Stripe (écran 7).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: any, @Body() dto: CreatePassengerBookingDto) {
    const trip = await this.bookings.createForPassenger(req.user.sub, dto);
    const payment = await this.payments.paymentSheet(req.user.sub, trip.tripId);
    return { ...trip, payment };
  }
}
