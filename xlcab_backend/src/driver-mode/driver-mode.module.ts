import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { ParcelsModule } from '../parcels/parcels.module';
import { DriverModeController } from './driver-mode.controller';
import { DriverModeService } from './driver-mode.service';

@Module({
  // Tracking : retrait du géo-index ; Matching : offres en cours.
  // Parcels : checklist colis des missions.
  imports: [TrackingModule, MatchingModule, ParcelsModule],
  controllers: [DriverModeController],
  providers: [DriverModeService],
})
export class DriverModeModule {}
