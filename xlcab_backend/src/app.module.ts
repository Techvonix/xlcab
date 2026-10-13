import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TrackingModule } from './tracking/tracking.module';
import { MatchingModule } from './matching/matching.module';
import { BookingsModule } from './bookings/bookings.module';
import { DriversModule } from './drivers/drivers.module';
import { CorporateModule } from './corporate/corporate.module';
import { AuditModule } from './audit/audit.service';
import { NotificationsModule } from './notifications/notifications.service';
import { TwoFactorModule } from './two-factor/two-factor.module';
import { AdminModule } from './admin/admin.module';
import { TripsModule } from './trips/trips.module';
import { PaymentsModule } from './payments/payments.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DriverModeModule } from './driver-mode/driver-mode.module';
import { UsersModule } from './users/users.module';
import { TripSharingModule } from './trip-sharing/trip-sharing';
import { ImpactModule } from './impact/impact';
import { PayoutsModule } from './payouts/payouts.module';
import { ParcelsModule } from './parcels/parcels.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ComplianceModule } from './compliance/compliance.module';
import { SecurityModule } from './security/security.module';
import { HealthModule } from './health/health.controller';
import { I18nModule } from './i18n/localized-exception.filter';
import { FeedbackModule } from './feedback/feedback.controller';
import { OperatorsModule } from './operators/operators.module';
import { LineBookingsModule } from './line-bookings/line-bookings.module';
import { MarketModule } from './market/market.module';
import { validateEnv } from './security/env.validation';

@Module({
  imports: [
    // .env.local (secrets : JWT, 2FA, Stripe…) puis .env (DATABASE_URL, aussi
    // lu par Prisma). Séparés car le client Prisma charge .env dans
    // process.env : des secrets réels y écraseraient ceux des tests.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'], validate: validateEnv }),
    // Limitation de débit globale (Partie 8 : 100 req/min/utilisateur, 1000/min/IP).
    SecurityModule,
    I18nModule,
    HealthModule,
    FeedbackModule,
    OperatorsModule,
    LineBookingsModule,
    MarketModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    TrackingModule,
    MatchingModule,
    BookingsModule,
    DriversModule,
    CorporateModule,
    AuditModule,
    NotificationsModule,
    TwoFactorModule,
    AdminModule,
    TripsModule,
    PaymentsModule,
    DriverModeModule,
    UsersModule,
    TripSharingModule,
    ImpactModule,
    PayoutsModule,
    ParcelsModule,
    InvoicesModule,
    ComplianceModule,
    // Tâches minute : réservations impayées, recherches de chauffeur différées.
    SchedulerModule,
  ],
})
export class AppModule {}
