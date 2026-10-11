import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { PaymentsModule } from '../payments/payments.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { OperatorsModule } from '../operators/operators.module';
import { LineBookingsModule } from '../line-bookings/line-bookings.module';
import { MarketModule } from '../market/market.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [MatchingModule, PaymentsModule, ParcelsModule, InvoicesModule, ComplianceModule, OperatorsModule, LineBookingsModule, MarketModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
