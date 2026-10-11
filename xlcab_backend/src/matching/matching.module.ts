import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module';
import { DispatchService } from './dispatch.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { TripsMatchingController } from './trips-matching.controller';

@Module({
  // TrackingModule : envoi des missions (driver:{id}) et des statuts de course.
  imports: [TrackingModule],
  controllers: [TripsMatchingController],
  providers: [MatchingService, PricingService, DispatchService],
  // PricingService servira aux endpoints /bookings/*/quote (module Bookings).
  exports: [MatchingService, PricingService, DispatchService],
})
export class MatchingModule {}
