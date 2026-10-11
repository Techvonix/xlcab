import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { TwoFactorGuard } from '../two-factor/two-factor.guard';
import { PaymentsService } from './payments.service';

export class TripPaymentDto {
  @IsUUID()
  tripId!: string;
}

export class RefundDto {
  /** Montant en centimes ; absent = tout le reste à rembourser. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents?: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

/** Endpoints "Payments" de la Partie 6. */
@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  /** Feuille de paiement d'une course en attente (création ou reprise). */
  @Post('intent')
  @HttpCode(HttpStatus.OK)
  intent(@Req() req: any, @Body() dto: TripPaymentDto) {
    return this.payments.paymentSheet(req.user.sub, dto.tripId);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: any, @Body() dto: TripPaymentDto) {
    return this.payments.confirm(req.user.sub, dto.tripId);
  }

  /** Remboursement manuel : équipe XLCAB, double authentification exigée. */
  @Post(':id/refund')
  @Roles('admin')
  @UseGuards(TwoFactorGuard)
  @HttpCode(HttpStatus.OK)
  refund(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto) {
    return this.payments.adminRefund(req.user.sub, id, dto.amountCents, dto.reason, AuditService.context(req));
  }

  @Get('methods')
  methods(@Req() req: any) {
    return this.payments.listMethods(req.user.sub);
  }

  @Post('methods')
  @HttpCode(HttpStatus.OK)
  addMethod(@Req() req: any) {
    return this.payments.addMethod(req.user.sub);
  }

  @Delete('methods/:id')
  @HttpCode(HttpStatus.OK)
  deleteMethod(@Req() req: any, @Param('id') id: string) {
    // Identifiant Stripe "pm_…" uniquement, avant tout appel à Stripe.
    if (!/^pm_[A-Za-z0-9]{1,100}$/.test(id)) throw new NotFoundException('Moyen de paiement introuvable');
    return this.payments.deleteMethod(req.user.sub, id);
  }
}

/**
 * POST /api/v1/webhooks/stripe (Partie 6). Pas d'authentification JWT :
 * c'est la signature Stripe (corps brut + STRIPE_WEBHOOK_SECRET) qui
 * prouve l'origine. Nécessite rawBody: true dans main.ts.
 */
@Controller('api/v1/webhooks')
export class StripeWebhookController {
  constructor(private payments: PaymentsService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  stripe(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
