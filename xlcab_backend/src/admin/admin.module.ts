import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { MatchingModule } from '../matching/matching.module';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';
import { AdminController, JurisdictionsController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRatingsController, AdminRatingsService } from './ratings';
import { AdminOperatorsController, AdminOperatorsService } from './operators';

@Module({
  // DriversModule : lecture des documents ; TwoFactorModule : TwoFactorGuard ;
  // MatchingModule : PricingService (tarif en vigueur, cache des devis).
  imports: [DriversModule, TwoFactorModule, MatchingModule],
  controllers: [AdminController, JurisdictionsController, TariffsController, AdminRatingsController, AdminOperatorsController],
  providers: [AdminService, TariffsService, AdminRatingsService, AdminOperatorsService],
})
export class AdminModule {}
