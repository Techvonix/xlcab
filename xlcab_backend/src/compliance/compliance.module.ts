import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NotificationsModule } from '../notifications/notifications.service';
import { TrackingModule } from '../tracking/tracking.module';
import { UsersModule } from '../users/users.module';
import { ActivityInterceptor } from './activity.interceptor';
import { ComplianceService } from './compliance.service';

@Module({
  // Users : anonymisation ; Tracking : retrait du géo-index ; Notifications : rappels.
  imports: [UsersModule, TrackingModule, NotificationsModule],
  providers: [
    ComplianceService,
    // Dernière activité de chaque utilisateur authentifié (toutes les routes HTTP).
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
  exports: [ComplianceService],
})
export class ComplianceModule {}
