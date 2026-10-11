import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { TrackingModule } from '../tracking/tracking.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSettingsController, UserSettingsService } from './user-settings';

@Module({
  // Payments : suppression du client Stripe ; Tracking : retrait du géo-index.
  imports: [PaymentsModule, TrackingModule],
  controllers: [UsersController, UserSettingsController],
  providers: [UsersService, UserSettingsService],
  // Anonymisation réutilisée par la purge des comptes inactifs (module Compliance).
  exports: [UsersService],
})
export class UsersModule {}
