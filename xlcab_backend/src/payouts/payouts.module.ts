import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { stripeProvider } from '../payments/stripe.provider';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { PayoutAccountController, PayoutAccountsService, PayoutReturnController, StripeConnectWebhookController } from './payout-accounts';
import { AdminPayoutsController, OperatorPayoutsController, TripPayoutsService } from './trip-payouts';

// Stripe Connect côté opérateurs : compte de versement et reversements.
// Module autonome (Prisma et Redis sont globaux) : importé par les lignes et
// la bourse (compte exigé avant toute mise en vente), par les courses
// (reversement en fin de trajet) et par le planificateur (reprises).
// TwoFactorModule : 2FA des routes admin.
@Module({
  imports: [NotificationsModule, AuditModule, TwoFactorModule],
  controllers: [PayoutAccountController, StripeConnectWebhookController, PayoutReturnController, OperatorPayoutsController, AdminPayoutsController],
  providers: [PayoutAccountsService, TripPayoutsService, stripeProvider],
  exports: [PayoutAccountsService, TripPayoutsService],
})
export class PayoutsModule {}
