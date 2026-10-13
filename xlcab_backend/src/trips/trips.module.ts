import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { PaymentsModule } from '../payments/payments.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OperatorsModule } from '../operators/operators.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  // TrackingModule : statuts diffusés aux abonnés ; MatchingModule :
  // nouvelle recherche après un désistement de chauffeur.
  // PaymentsModule : remboursement automatique à l'annulation.
  // ParcelsModule : colis à bord (démarrage, fin, annulation).
  // InvoicesModule : facture à la fin de course et des frais d'annulation.
  // OperatorsModule : places rendues quand une réservation sur ligne est annulée.
  // PayoutsModule : reversement à l'opérateur en fin de course (lignes, bourse).
  imports: [TrackingModule, MatchingModule, PaymentsModule, ParcelsModule, InvoicesModule, OperatorsModule, PayoutsModule],
  controllers: [TripsController],
  providers: [TripsService],
  // Réservations sur ligne : démarrage / fin d'un départ en bloc.
  exports: [TripsService],
})
export class TripsModule {}
