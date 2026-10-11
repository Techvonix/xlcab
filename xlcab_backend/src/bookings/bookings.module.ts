import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { GeoController } from './geo.controller';
import { RoutingService } from './routing.service';
import { ShuttlesController, ShuttlesService } from './shuttles';

@Module({
  // MatchingModule exporte PricingService (calcul du prix et de la TVA).
  // PaymentsModule : feuille de paiement Stripe à la réservation.
  imports: [MatchingModule, PaymentsModule],
  controllers: [BookingsController, GeoController, ShuttlesController],
  providers: [BookingsService, RoutingService, ShuttlesService],
  // BookingsService : création de course, réutilisée par le portail
  // corporate. RoutingService : aussi pour /route et /geocode (Utils).
  exports: [BookingsService, RoutingService],
})
export class BookingsModule {}
