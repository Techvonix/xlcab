import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { OperatorsModule } from '../operators/operators.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AdminMarketController, MarketController } from './market.controller';
import { MarketService } from './market.service';

// Bourse, étape 2c : demandes de transport et propositions des opérateurs.
// OperatorsModule : départs de lignes qui répondent déjà à une demande ;
// MatchingModule : créneau libre de l'opérateur à la confirmation ;
// TwoFactorModule : 2FA de la route admin. MarketService est exporté pour
// le planificateur (expiration des propositions et des demandes).
@Module({
  imports: [OperatorsModule, MatchingModule, TwoFactorModule],
  controllers: [MarketController, AdminMarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
