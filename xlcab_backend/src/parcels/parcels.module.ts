import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { DriversModule } from '../drivers/drivers.module';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

@Module({
  // Bookings : itinéraire (RoutingService) ; Matching : prix ; Payments :
  // prépaiement et remboursements ; Drivers : stockage privé des photos.
  imports: [BookingsModule, MatchingModule, PaymentsModule, DriversModule, InvoicesModule],
  controllers: [ParcelsController],
  providers: [ParcelsService],
  // Utilisé par Trips (démarrage, fin, annulation), le mode chauffeur
  // (checklist colis) et le planificateur.
  exports: [ParcelsService],
})
export class ParcelsModule {}
