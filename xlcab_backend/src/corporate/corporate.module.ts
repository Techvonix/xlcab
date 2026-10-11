import { Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CorporateController } from './corporate.controller';
import { CorporateService } from './corporate.service';

@Module({
  // BookingsModule : création des courses réservées pour un collaborateur.
  // TwoFactorModule : double authentification des admins d'entreprise.
  imports: [BookingsModule, TwoFactorModule],
  controllers: [CorporateController],
  providers: [CorporateService],
})
export class CorporateModule {}
