// Stripe Connect, étape 2 : encaissement à la réservation d'une place de ligne.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

edit('src/payments/payments.module.ts', [
  ["import { MatchingModule } from '../matching/matching.module';", "import { MatchingModule } from '../matching/matching.module';\nimport { OperatorsModule } from '../operators/operators.module';"],
  [
    '  imports: [MatchingModule, TwoFactorModule, NotificationsModule, AuditModule, InvoicesModule],',
    "  // OperatorsModule : places d'une ligne rendues quand une réservation n'est pas payée.\n  imports: [MatchingModule, TwoFactorModule, NotificationsModule, AuditModule, InvoicesModule, OperatorsModule],",
  ],
]);

edit('src/payments/payments.service.ts', [
  ["import { InvoicesService } from '../invoices/invoices.service';", "import { InvoicesService } from '../invoices/invoices.service';\nimport { LinesService } from '../operators/lines.service';"],
  [
    'export interface PaymentSheetParams {',
    "/** Groupe Stripe qui relie le paiement d'une course à son reversement (Connect). */\nexport const transferGroupOf = (tripId: string) => `trip_${tripId}`;\n\nexport interface PaymentSheetParams {",
  ],
  [
    '    @Optional() private invoices?: InvoicesService,\n  ) {}',
    '    @Optional() private invoices?: InvoicesService,\n    @Optional() private lines?: LinesService,\n  ) {}\n\n  /** Stripe configuré : à vérifier avant de retenir quoi que ce soit pour un paiement. */\n  available(): boolean {\n    return this.stripe !== null;\n  }',
  ],
  [
    "select: { id: true, passengerId: true, status: true, totalPriceCents: true, corporateId: true },\n    });\n    if (!trip || trip.passengerId !== userId) throw new NotFoundException('Trajet introuvable');",
    "select: { id: true, passengerId: true, status: true, totalPriceCents: true, corporateId: true, source: true },\n    });\n    if (!trip || trip.passengerId !== userId) throw new NotFoundException('Trajet introuvable');",
  ],
  [
    '          metadata: { tripId, userId },\n        },',
    "          metadata: { tripId, userId },\n          // Ligne ou bourse (Stripe Connect) : le reversement à l'opérateur, après le\n          // trajet, sera rattaché à ce paiement par ce groupe.\n          ...(trip.source && trip.source !== 'instant' ? { transfer_group: transferGroupOf(tripId) } : {}),\n        },",
  ],
  [
    '    const updated = await this.prisma.trip.updateMany({\n      where: { id: payment.tripId, status: TripStatus.AWAITING_PAYMENT },\n      data: { status: TripStatus.PENDING },\n    });',
    "    // Place sur une ligne régulière : confirmée auprès du chauffeur du départ, sans recherche.\n    const paidTrip = await this.prisma.trip.findUnique({ where: { id: payment.tripId }, select: { source: true, lineDepartureId: true } });\n    if (paidTrip?.source === 'line' && paidTrip.lineDepartureId) {\n      return this.confirmPaidLineBooking(payment.tripId, paidTrip.lineDepartureId, payment.userId);\n    }\n\n    const updated = await this.prisma.trip.updateMany({\n      where: { id: payment.tripId, status: TripStatus.AWAITING_PAYMENT },\n      data: { status: TripStatus.PENDING },\n    });",
  ],
  ['      select: { id: true, passengerId: true },\n      take: 50,', '      select: { id: true, passengerId: true, lineDepartureId: true },\n      take: 50,'],
  [
    "        await this.prisma.parcelBooking.updateMany({ where: { tripId: trip.id }, data: { status: 'cancelled' } });\n        await this.refundForCancellation(trip.id, 0); // annule la demande de paiement Stripe",
    "        await this.prisma.parcelBooking.updateMany({ where: { tripId: trip.id }, data: { status: 'cancelled' } });\n        // Place sur une ligne : rendue à la vente.\n        if (trip.lineDepartureId) await this.releaseLineSeats(trip.id, trip.lineDepartureId);\n        await this.refundForCancellation(trip.id, 0); // annule la demande de paiement Stripe",
  ],
  [
    '  private async markFailed(intent: Stripe.PaymentIntent) {',
    `  /**
   * Réservation de ligne payée : la course devient « acceptée » par le
   * chauffeur qui assure le départ À CET INSTANT (titulaire, ou secours qui
   * l'a repris pendant le paiement). Départ parti ou annulé entre-temps :
   * réservation annulée et remboursée intégralement.
   */
  private async confirmPaidLineBooking(tripId: string, departureId: string, userId: string | null, now = new Date()) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));

    if (!departure || !line || departure.rescueStatus === 'failed' || new Date(departure.departureAt) <= now) {
      const cancelled = await this.prisma.trip.updateMany({
        where: { id: tripId, status: { in: [TripStatus.AWAITING_PAYMENT, TripStatus.CANCELLED] } },
        data: { status: TripStatus.CANCELLED, cancelledAt: now, cancellationReason: 'Départ indisponible', cancellationFeeCents: 0 },
      });
      if (cancelled.count === 0) return;
      await this.releaseLineSeats(tripId, departureId);
      await this.refundForCancellation(tripId, 0);
      if (userId) {
        await this.notifications.notify(userId, 'line.booking_cancelled', 'Réservation annulée', 'Ce départ n’est plus disponible : vous êtes remboursé intégralement.', { tripId });
      }
      return;
    }

    // Chauffeur en cours de remplacement : la réservation attend le secours, comme les autres.
    const searching = departure.rescueStatus === 'searching';
    const driverId = searching ? null : departure.driverId ?? line.operatorId;
    const vehicleId = searching ? null : departure.vehicleId ?? line.vehicleId;
    const updated = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.AWAITING_PAYMENT },
      data: { status: TripStatus.ACCEPTED, acceptedAt: now, driverId, vehicleId },
    });
    if (updated.count === 0) {
      // Réservation expirée ou annulée pendant la saisie de la carte : remboursement.
      const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
      if (trip?.status === TripStatus.CANCELLED) await this.refundForCancellation(tripId, 0);
      return;
    }
    if (userId) await this.notifications.notify(userId, 'line.booked', 'Réservation confirmée', 'Votre place sur la ligne est réservée.', { tripId });
    if (driverId) {
      await this.notifications.notify(driverId, 'line.new_booking', 'Nouvelle réservation', 'Un passager a réservé sur votre ligne.', { departureId });
    }
  }

  /** Rend à la vente les places (et sièges numérotés) d'une réservation de ligne abandonnée. */
  private async releaseLineSeats(tripId: string, departureId: string) {
    const booking = await this.prisma.passengerBooking.findUnique({ where: { tripId }, select: { seats: true } });
    await this.lines?.releaseSeats(departureId, booking?.seats ?? 0, tripId);
  }

  private async markFailed(intent: Stripe.PaymentIntent) {`,
  ],
]);

edit('src/line-bookings/line-bookings.service.ts', [
  ["import { LinesService } from '../operators/lines.service';", "import { LinesService } from '../operators/lines.service';\nimport { PaymentsService } from '../payments/payments.service';"],
  ['    private audit: AuditService,\n  ) {}', '    private audit: AuditService,\n    private payments: PaymentsService,\n  ) {}'],
  [
    "    if (linePaymentMode() !== 'deferred') {\n      throw new ServiceUnavailableException('Paiement des lignes régulières pas encore disponible');\n    }\n    if (process.env.NODE_ENV === 'production') {\n      throw new ServiceUnavailableException('Réservation sur les lignes régulières bientôt disponible');\n    }",
    "    // « connect » : le passager paie à la réservation (Stripe). « deferred » : sans\n    // encaissement, pour les tests seulement — jamais de vente réelle ainsi.\n    const online = linePaymentMode() === 'connect';\n    if (!online && process.env.NODE_ENV === 'production') {\n      throw new ServiceUnavailableException('Réservation sur les lignes régulières bientôt disponible');\n    }\n    if (online && !this.payments.available()) throw new ServiceUnavailableException('Paiement momentanément indisponible');",
  ],
  [
    '      where: { lineDepartureId: departure.id, passengerId: userId, status: { in: ACTIVE } },\n    });\n    if (mine > 0)',
    '      // Une réservation en attente de paiement compte : elle retient déjà des places.\n      where: { lineDepartureId: departure.id, passengerId: userId, status: { in: [...ACTIVE, TripStatus.AWAITING_PAYMENT] } },\n    });\n    if (mine > 0)',
  ],
  [
    "            status: TripStatus.ACCEPTED,\n            source: 'line',",
    "            // Paiement en ligne : confirmée (« acceptée ») seulement une fois payée.\n            status: online ? TripStatus.AWAITING_PAYMENT : TripStatus.ACCEPTED,\n            source: 'line',",
  ],
  ['            acceptedAt: now,\n            shuttleType', '            acceptedAt: online ? null : now,\n            shuttleType'],
  [
    "      await this.notifications.notify(userId, 'line.booked', 'Réservation confirmée', 'Votre place sur la ligne est réservée.', { tripId: trip.id });",
    "      if (online) return await this.awaitingPayment(userId, trip, departure, dto.seats, total);\n\n      await this.notifications.notify(userId, 'line.booked', 'Réservation confirmée', 'Votre place sur la ligne est réservée.', { tripId: trip.id });",
  ],
  [
    '  /**\n   * Attribue des sièges à une réservation.',
    `  /**
   * Paiement en ligne : la réservation retient ses places et attend son
   * paiement (feuille Stripe renvoyée à l'app). Confirmée par
   * PaymentsService.markPaid ; non payée au bout de 30 min, elle est
   * annulée par le planificateur et ses places reviennent à la vente.
   */
  private async awaitingPayment(userId: string, trip: { id: string; seatNumbers: number[] }, departure: LineDeparture, seats: number, total: number) {
    let payment;
    try {
      payment = await this.payments.paymentSheet(userId, trip.id);
    } catch (err) {
      // Stripe en panne : la réservation est annulée tout de suite (le bloc
      // appelant rend les places), le passager peut réessayer sans attendre.
      await this.prisma.trip.updateMany({
        where: { id: trip.id, status: TripStatus.AWAITING_PAYMENT },
        data: { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: 'Paiement indisponible', cancellationFeeCents: 0 },
      });
      await this.prisma.lineSeat.deleteMany({ where: { departureId: departure.id, tripId: trip.id } });
      throw err;
    }
    await this.audit.log({
      userId, action: 'line.book', entity: 'Trip', entityId: trip.id, metadata: { departureId: departure.id, seats, totalCents: total, payment: 'connect' },
    });
    return {
      tripId: trip.id,
      status: TripStatus.AWAITING_PAYMENT,
      departureAt: departure.departureAt,
      seats,
      seatNumbers: trip.seatNumbers,
      totalPriceCents: total,
      paymentMode: 'connect',
      payment,
    };
  }

  /**
   * Attribue des sièges à une réservation.`,
  ],
]);
console.log('ok');
