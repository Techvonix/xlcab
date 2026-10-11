import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { MatchingModule } from '../matching/matching.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { AuditModule } from '../audit/audit.service';
import { PaymentsController, StripeWebhookController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { stripeProvider } from './stripe.provider';

@Module({
  // MatchingModule : recherche de chauffeur lancée après paiement ;
  // TwoFactorModule : remboursement manuel réservé aux admins avec 2FA.
  // Notifications et audit déclarés explicitement : le module fonctionne
  // même chargé seul (tests, futurs microservices).
  imports: [MatchingModule, TwoFactorModule, NotificationsModule, AuditModule, InvoicesModule],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [PaymentsService, stripeProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
