import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { MatchingModule } from '../matching/matching.module';
import { OperatorsModule } from '../operators/operators.module';
import { PaymentsModule } from '../payments/payments.module';
import { TripsModule } from '../trips/trips.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AdminLineProtocolController } from './admin-line-protocol.controller';
import { LineBookingsController, LineOperationsController } from './line-bookings.controller';
import { LineBookingsService } from './line-bookings.service';
import { RescueService } from './rescue.service';

// Bourse, étape 2 : réservations sur les lignes régulières et protocole
// d'annulation chauffeur. RescueService est exporté pour le planificateur
// (contrôles minute par minute) et l'admin (départs en danger, pénalités).
@Module({
  // OperatorsModule : places des départs ; TripsModule : démarrage / fin des
  // réservations ; MatchingModule : créneau libre d'un secours ; Payments :
  // remboursement quand aucun secours n'est trouvé.
  // TwoFactorModule : 2FA des routes admin du protocole.
  // InvoicesModule : facture du solde d'une pénalité non recouvrée.
  imports: [OperatorsModule, TripsModule, MatchingModule, PaymentsModule, TwoFactorModule, InvoicesModule],
  controllers: [LineBookingsController, LineOperationsController, AdminLineProtocolController],
  providers: [LineBookingsService, RescueService],
  exports: [LineBookingsService, RescueService],
})
export class LineBookingsModule {}
