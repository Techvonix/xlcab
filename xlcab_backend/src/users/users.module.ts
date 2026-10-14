import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { TrackingModule } from '../tracking/tracking.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSettingsController, UserSettingsService } from './user-settings';
import { ExportFileController, ExportLinkController, ExportLinkService } from './export-link';

@Module({
  // Payments : suppression du client Stripe ; Tracking : retrait du géo-index.
  imports: [PaymentsModule, TrackingModule],
  controllers: [UsersController, UserSettingsController, ExportLinkController, ExportFileController],
  providers: [UsersService, UserSettingsService, ExportLinkService],
  // Anonymisation réutilisée par la purge des comptes inactifs (module Compliance).
  exports: [UsersService],
})
export class UsersModule {}
