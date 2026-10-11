import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DriversModule } from '../drivers/drivers.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AdminInvoicesController, CorporateInvoicesController, InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  // Drivers : stockage privé (PDF archivés) ; Jwt : liens de téléchargement
  // signés (clé dérivée) ; TwoFactor : routes admin.
  imports: [DriversModule, TwoFactorModule, JwtModule.register({})],
  controllers: [InvoicesController, CorporateInvoicesController, AdminInvoicesController],
  providers: [InvoicesService],
  // Utilisé par Trips, Parcels, Payments (émission) et le planificateur.
  exports: [InvoicesService],
})
export class InvoicesModule {}
