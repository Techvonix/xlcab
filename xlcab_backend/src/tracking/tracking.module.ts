import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrackingController } from './tracking.controller';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

@Module({
  // Pas de secret par défaut : TrackingService passe JWT_SECRET
  // explicitement à verify(), comme AuthService.
  imports: [JwtModule.register({})],
  controllers: [TrackingController],
  providers: [TrackingGateway, TrackingService],
  // Gateway : emitTripStatus() pour Trips ; service : retrait du géo-index
  // au passage hors ligne (mode chauffeur).
  exports: [TrackingGateway, TrackingService],
})
export class TrackingModule {}
