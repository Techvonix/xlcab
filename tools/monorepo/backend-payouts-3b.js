// Stripe Connect, étape 3 : bourse — cycle de vie d'une proposition avec empreinte de carte.
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

edit('src/market/market.module.ts', [
  ["import { PayoutsModule } from '../payouts/payout-accounts';", "import { PaymentsModule } from '../payments/payments.module';\nimport { PayoutsModule } from '../payouts/payout-accounts';"],
  ['imports: [OperatorsModule, MatchingModule, TwoFactorModule, PayoutsModule]', 'imports: [OperatorsModule, MatchingModule, TwoFactorModule, PayoutsModule, PaymentsModule]'],
]);

edit('src/market/market.controller.ts', [
  [
    "    return this.market.acceptOffer(req.user.sub, id);\n  }",
    "    return this.market.acceptOffer(req.user.sub, id);\n  }\n\n  /** Paiement en ligne : l'app appelle ceci après la feuille de paiement (empreinte de carte validée). */\n  @Post('offers/:id/authorize')\n  @Roles(...CLIENTS)\n  @HttpCode(HttpStatus.OK)\n  authorize(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {\n    return this.market.authorizeOffer(req.user.sub, id);\n  }",
  ],
]);

edit('src/market/market.service.ts', [
  ["import { PayoutAccountsService } from '../payouts/payout-accounts';", "import { PayoutAccountsService } from '../payouts/payout-accounts';\nimport { PaymentsService } from '../payments/payments.service';"],
  ['    private payouts: PayoutAccountsService,\n  ) {}', '    private payouts: PayoutAccountsService,\n    private payments: PaymentsService,\n  ) {}'],
  [
    'export const CONFIRM_WINDOW_MIN = 120;',
    "export const CONFIRM_WINDOW_MIN = 120;\n/** Paiement en ligne : délai laissé au client pour valider son empreinte de carte après son choix. */\nexport const AUTHORIZE_WINDOW_MIN = 15;",
  ],
  [
    "const OPEN = ['published', 'offers_received'];",
    "const OPEN = ['published', 'offers_received'];\n// Proposition choisie par le client : « authorizing » = empreinte de carte en\n// cours (l'opérateur n'est pas encore prévenu), « accepted » = à reconfirmer.\nconst CHOSEN = ['authorizing', 'accepted'];\nconst LIVE = ['pending', ...CHOSEN];",
  ],
  // Annulation de la demande : empreintes levées.
  [
    "    const offers = await this.prisma.transportOffer.findMany({ where: { requestId, status: { in: ['pending', 'accepted'] } } });\n    await this.prisma.transportOffer.updateMany({ where: { requestId, status: { in: ['pending', 'accepted'] } }, data: { status: 'rejected' } });\n    for (const o of offers) {",
    "    const offers = await this.prisma.transportOffer.findMany({ where: { requestId, status: { in: LIVE } } });\n    await this.prisma.transportOffer.updateMany({ where: { requestId, status: { in: LIVE } }, data: { status: 'rejected' } });\n    for (const o of offers) {\n      if (CHOSEN.includes(o.status)) await this.payments.releaseAuthorization(o.id);",
  ],
  // Choix du client.
  [
    "    if (!offer || !request || request.requesterId !== userId) throw new NotFoundException('Proposition introuvable');\n    if (offer.status !== 'pending' || offer.validUntil <= now) throw new ConflictException('Proposition expirée ou déjà traitée');",
    "    if (!offer || !request || request.requesterId !== userId) throw new NotFoundException('Proposition introuvable');\n    const online = linePaymentMode() === 'connect';\n    if (online) this.assertMarketOpen();\n    // Reprise : feuille de paiement fermée par erreur, le client la rouvre.\n    if (online && offer.status === 'authorizing' && request.acceptedOfferId === offer.id && offer.confirmDeadline && offer.confirmDeadline > now) {\n      return this.authorizing(userId, offer, offer.confirmDeadline);\n    }\n    if (offer.status !== 'pending' || offer.validUntil <= now) throw new ConflictException('Proposition expirée ou déjà traitée');",
  ],
  [
    "    if (claimed.count === 0) throw new ConflictException('Une proposition est déjà en cours de confirmation');\n    await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'accepted', confirmDeadline: deadline, respondedAt: now } });",
    "    if (claimed.count === 0) throw new ConflictException('Une proposition est déjà en cours de confirmation');\n    if (online) {\n      // Empreinte de carte d'abord : l'opérateur n'est prévenu qu'une fois la carte autorisée.\n      const authorizeBy = new Date(Math.min(now.getTime() + AUTHORIZE_WINDOW_MIN * MIN, request.expiresAt.getTime()));\n      const held = await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'authorizing', confirmDeadline: authorizeBy } });\n      try {\n        return await this.authorizing(userId, held, authorizeBy);\n      } catch (err) {\n        // Stripe en panne : le choix est défait, le client peut réessayer.\n        await this.dropAuthorization(held, now);\n        throw err;\n      }\n    }\n    await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'accepted', confirmDeadline: deadline, respondedAt: now } });",
  ],
  [
    '  // ── Côté opérateur ──────────────────────────────────────────────────\n\n  /** Demandes ouvertes',
    `  /**
   * Paiement en ligne : l'empreinte de carte est validée (feuille de
   * paiement terminée). Le choix devient ferme côté client et l'opérateur
   * est invité à reconfirmer. Sans effet si c'est déjà fait.
   */
  async authorizeOffer(userId: string, offerId: string, now = new Date()) {
    const offer = await this.prisma.transportOffer.findUnique({ where: { id: offerId } });
    const request = offer && (await this.prisma.transportRequest.findUnique({ where: { id: offer.requestId } }));
    if (!offer || !request || request.requesterId !== userId) throw new NotFoundException('Proposition introuvable');
    if (offer.status === 'accepted') return { offerId, status: 'accepted', confirmDeadline: offer.confirmDeadline };
    if (offer.status !== 'authorizing' || request.acceptedOfferId !== offer.id) throw new ConflictException('Proposition expirée ou déjà traitée');
    if (!(await this.payments.authorizationReady(offer.id))) {
      throw new ConflictException('Carte non autorisée : validez le paiement pour confirmer votre choix');
    }
    const confirmDeadline = await this.markAuthorized(offer, request, now);
    await this.audit.log({ userId, action: 'market.offer.accept', entity: 'TransportOffer', entityId: offer.id, metadata: { payment: 'authorized' } });
    return { offerId, status: 'accepted', confirmDeadline };
  }

  private async authorizing(userId: string, offer: TransportOffer, authorizeBy: Date) {
    const payment = await this.payments.authorizationSheet(userId, offer.id, offer.priceCents);
    return { offerId: offer.id, status: 'authorizing', authorizeDeadline: authorizeBy, payment };
  }

  /** Carte autorisée : la proposition passe à « à reconfirmer » et l'opérateur est prévenu (une seule fois). */
  private async markAuthorized(offer: TransportOffer, request: TransportRequest, now: Date) {
    const deadline = new Date(Math.min(now.getTime() + CONFIRM_WINDOW_MIN * MIN, request.expiresAt.getTime()));
    const { count } = await this.prisma.transportOffer.updateMany({
      where: { id: offer.id, status: 'authorizing' },
      data: { status: 'accepted', confirmDeadline: deadline, respondedAt: now },
    });
    if (count > 0) {
      await this.notifications.notify(offer.operatorId, 'market.offer.accepted', 'Proposition retenue',
        'Le client a choisi votre proposition : confirmez votre disponibilité pour valider la réservation.', { offerId: offer.id });
    }
    return deadline;
  }

  /** Empreinte abandonnée : elle est levée, la proposition redevient disponible et la demande se rouvre. */
  private async dropAuthorization(offer: TransportOffer, now: Date) {
    await this.payments.releaseAuthorization(offer.id);
    await this.prisma.transportOffer.updateMany({
      where: { id: offer.id, status: 'authorizing' },
      data: { status: offer.validUntil > now ? 'pending' : 'expired', confirmDeadline: null },
    });
    await this.prisma.transportRequest.updateMany({
      where: { id: offer.requestId, status: 'accepted', acceptedOfferId: offer.id },
      data: { status: 'offers_received', acceptedOfferId: null },
    });
    await this.refreshStatus(offer.requestId);
  }

  // ── Côté opérateur ──────────────────────────────────────────────────

  /** Demandes ouvertes`,
  ],
  // L'opérateur ne voit pas l'étape « empreinte en cours » : pour lui la proposition est toujours en attente.
  [
    "          myOffer: offer ? { id: offer.id, priceCents: offer.priceCents, status: offer.status } : null,",
    "          myOffer: offer ? { id: offer.id, priceCents: offer.priceCents, status: operatorStatus(offer.status) } : null,",
  ],
  [
    "    const offers = await this.prisma.transportOffer.findMany({ where: { operatorId }, orderBy: { createdAt: 'desc' }, take: 100 });\n    return Promise.all(offers.map((o) => this.offerView(o)));",
    "    const offers = await this.prisma.transportOffer.findMany({ where: { operatorId }, orderBy: { createdAt: 'desc' }, take: 100 });\n    const views = await Promise.all(offers.map((o) => this.offerView(o)));\n    return views.map((v) => ({ ...v, status: operatorStatus(v.status), confirmDeadline: v.status === 'authorizing' ? null : v.confirmDeadline }));",
  ],
  // Confirmation de l'opérateur : débit de l'empreinte avant de créer les courses.
  [
    "    const legs = offer.includesReturn && request.returnAt ? 2 : 1;",
    "    // Paiement en ligne : la carte du client est débitée MAINTENANT. Refus de la\n    // banque : rien n'est réservé, le client est invité à choisir de nouveau.\n    const online = linePaymentMode() === 'connect';\n    if (online) {\n      try {\n        await this.payments.captureAuthorization(offer.id);\n      } catch (err) {\n        await this.prisma.transportOffer.update({ where: { id: offer.id }, data: { status: 'expired', respondedAt: now } });\n        await this.releaseAcceptance(offer, 'Votre carte n’a pas pu être débitée : choisissez de nouveau une proposition.');\n        throw err;\n      }\n    }\n\n    const legs = offer.includesReturn && request.returnAt ? 2 : 1;",
  ],
  [
    "    const tripIds: string[] = [];\n    await this.prisma.$transaction(async (tx) => {",
    "    const tripIds: string[] = [];\n    try {\n    await this.prisma.$transaction(async (tx) => {",
  ],
  [
    "            jurisdiction: vehicle.jurisdiction,\n            priceLines: { create: [{ regime: 'passenger', baseCents: base, ratePercent: rate, vatCents: total - base }] },\n          },\n          select: { id: true },\n        });\n        await tx.passengerBooking.create({\n          data: { tripId: trip.id, seats: request.passengers, extraLuggage: request.luggage > request.passengers, qrCode: randomUUID(), notes: request.needs },\n        });\n        tripIds.push(trip.id);\n      }\n    });",
    "            jurisdiction: vehicle.jurisdiction,\n            // Aller-retour : un seul paiement, porté par l'aller.\n            paidWithTripId: back && online ? tripIds[0] : null,\n            priceLines: { create: [{ regime: 'passenger', baseCents: base, ratePercent: rate, vatCents: total - base }] },\n          },\n          select: { id: true },\n        });\n        await tx.passengerBooking.create({\n          data: { tripId: trip.id, seats: request.passengers, extraLuggage: request.luggage > request.passengers, qrCode: randomUUID(), notes: request.needs },\n        });\n        tripIds.push(trip.id);\n      }\n    });\n    } catch (err) {\n      // Carte débitée mais courses non créées : remboursement intégral immédiat.\n      if (online) await this.payments.refundCapturedOffer(offer.id);\n      throw err;\n    }\n    if (online) await this.payments.attachOfferPayment(offer.id, tripIds[0]);",
  ],
  ["    if (!['pending', 'accepted', 'confirmed'].includes(offer.status)) throw new ConflictException('Échange clos pour cette proposition');", "    if (![...LIVE, 'confirmed'].includes(offer.status)) throw new ConflictException('Échange clos pour cette proposition');"],
  // Planificateur.
  [
    "    // Choix du client non reconfirmé à temps par l'opérateur.",
    "    // Paiement en ligne : empreintes de carte en cours. Validée chez Stripe sans que\n    // l'app l'ait signalé (app fermée) : prise en compte ; délai dépassé : levée.\n    const authorizing = await this.prisma.transportOffer.findMany({ where: { status: 'authorizing' } });\n    for (const o of authorizing) {\n      const request = await this.prisma.transportRequest.findUnique({ where: { id: o.requestId } });\n      let ready = false;\n      try {\n        ready = !!request && (await this.payments.authorizationReady(o.id));\n      } catch {\n        continue; // Stripe injoignable : on réessaie à la minute suivante\n      }\n      if (ready && request) await this.markAuthorized(o, request, now);\n      else if (!o.confirmDeadline || o.confirmDeadline <= now) await this.dropAuthorization(o, now);\n    }\n    // Choix du client non reconfirmé à temps par l'opérateur.",
  ],
  [
    "      await this.prisma.transportOffer.updateMany({ where: { requestId: r.id, status: { in: ['pending', 'accepted'] } }, data: { status: 'expired' } });",
    "      const chosen = await this.prisma.transportOffer.findMany({ where: { requestId: r.id, status: { in: CHOSEN } }, select: { id: true } });\n      for (const o of chosen) await this.payments.releaseAuthorization(o.id);\n      await this.prisma.transportOffer.updateMany({ where: { requestId: r.id, status: { in: LIVE } }, data: { status: 'expired' } });",
  ],
  // Pas de vente réelle sans paiement en ligne.
  [
    "    if (linePaymentMode() !== 'deferred' || process.env.NODE_ENV === 'production') {\n      throw new ServiceUnavailableException('Bourse de transport bientôt disponible');\n    }",
    "    const online = linePaymentMode() === 'connect';\n    if (!online && process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Bourse de transport bientôt disponible');\n    if (online && !this.payments.available()) throw new ServiceUnavailableException('Paiement momentanément indisponible');",
  ],
  // Le choix tombe : l'empreinte est levée.
  [
    "  private async releaseAcceptance(offer: TransportOffer, message: string) {\n",
    "  private async releaseAcceptance(offer: TransportOffer, message: string) {\n    await this.payments.releaseAuthorization(offer.id);\n",
  ],
  ["    const offers = await this.prisma.transportOffer.count({ where: { requestId: r.id, status: { in: ['pending', 'accepted'] } } });", "    const offers = await this.prisma.transportOffer.count({ where: { requestId: r.id, status: { in: LIVE } } });"],
]);

{
  const f = R + 'src/market/market.service.ts';
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(
    "/** Adresse sans numéro ni rue",
    "/** Statut montré à l'opérateur : l'empreinte de carte en cours ne le regarde pas encore. */\nconst operatorStatus = (status: string) => (status === 'authorizing' ? 'pending' : status);\n\n/** Adresse sans numéro ni rue",
  );
  fs.writeFileSync(f, s);
}
console.log('ok');
