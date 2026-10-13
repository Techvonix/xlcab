// Facture de pénalité : pénalité non recouvrée sur les reversements au bout de
// 30 jours → facture du solde, payable sous 30 jours ; paiement reçu enregistré par l'équipe.
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

edit('prisma/schema.prisma', [
  [
    '  collectedAt    DateTime? // entièrement recouvrée\n',
    '  collectedAt    DateTime? // entièrement recouvrée\n  // Facture du solde, émise quand les reversements n\'ont pas suffi (30 jours).\n  invoiceId      String?\n  invoicedAt     DateTime?\n',
  ],
]);
{
  const f = R + 'src/testing/memory-prisma.ts';
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('collectedCents: 0, collectedAt: null,')) throw new Error('memory-prisma : pénalité');
  s = s.replace('collectedCents: 0, collectedAt: null,', 'collectedCents: 0, collectedAt: null, invoiceId: null, invoicedAt: null,');
  fs.writeFileSync(f, s);
}

edit('src/line-bookings/protocol.constants.ts', [
  [
    'export const PENALTY_FROM_COUNT = 3;',
    "/** Pénalité non recouvrée sur les reversements au bout de ce délai : facture du solde. */\nexport const penaltyInvoiceAfterDays = () => amount('LINE_PENALTY_INVOICE_AFTER_DAYS', 30);\n/** Délai de paiement de la facture de pénalité. */\nexport const PENALTY_INVOICE_DUE_DAYS = 30;\n\nexport const PENALTY_FROM_COUNT = 3;",
  ],
]);

edit('src/invoices/invoices.service.ts', [
  [
    '  /**\n   * Remboursement après facturation : avoir du montant remboursé,',
    `  /**
   * Facture du solde d'une pénalité d'annulation (protocole des lignes) que
   * les reversements du chauffeur n'ont pas permis de recouvrer. Payable
   * sous 30 jours ; indemnité contractuelle, hors champ de la TVA (à valider,
   * comme les frais d'annulation).
   */
  async issuePenalty(input: { penaltyId: string; driverId: string; amountCents: number; jurisdiction: string; departureAt: Date | null; dueDate: Date }) {
    if (input.amountCents <= 0) return null;
    try {
      return await this.issue({
        kind: 'invoice',
        jurisdiction: input.jurisdiction,
        customerUserId: input.driverId,
        buyer: await this.personBuyer(input.driverId),
        lines: [{
          description: \`Pénalité d’annulation tardive (conditions générales opérateur)\${input.departureAt ? \` — départ du \${day(input.departureAt)}\` : ''}\`,
          quantity: 1, unitCents: input.amountCents, regime: 'penalty', vatRate: 0, vatCents: 0, totalCents: input.amountCents,
        }],
        paymentStatus: 'due',
        dueDate: input.dueDate,
      });
    } catch (err) {
      return this.failed('penalty', input.penaltyId, err);
    }
  }

  /**
   * Remboursement après facturation : avoir du montant remboursé,`,
  ],
]);

edit('src/line-bookings/line-bookings.module.ts', [
  ["import { MatchingModule } from '../matching/matching.module';", "import { InvoicesModule } from '../invoices/invoices.module';\nimport { MatchingModule } from '../matching/matching.module';"],
  [
    '  imports: [OperatorsModule, TripsModule, MatchingModule, PaymentsModule, TwoFactorModule],',
    '  // InvoicesModule : facture du solde d\'une pénalité non recouvrée.\n  imports: [OperatorsModule, TripsModule, MatchingModule, PaymentsModule, TwoFactorModule, InvoicesModule],',
  ],
]);

edit('src/line-bookings/dto.ts', [
  [
    'export class PenaltyDecisionDto {',
    "/** Paiement d'une pénalité reçu hors application (virement bancaire). */\nexport class PenaltyPaymentDto {\n  @IsInt({ message: 'Montant en centimes' })\n  @Min(1, { message: 'Montant en centimes' })\n  @Max(10_000_000, { message: 'Montant en centimes' })\n  amountCents!: number;\n\n  /** Référence du virement (libellé bancaire) : tracée au journal d'audit. */\n  @Transform(trim)\n  @IsString()\n  @MinLength(3, { message: 'Référence du paiement : 3 caractères minimum' })\n  @MaxLength(120, { message: 'Référence du paiement limitée à 120 caractères' })\n  reference!: string;\n}\n\nexport class PenaltyDecisionDto {",
  ],
]);

edit('src/line-bookings/admin-line-protocol.controller.ts', [
  ["import { AssignDepartureDto, PenaltyDecisionDto, ReviewCancellationDto } from './dto';", "import { AssignDepartureDto, PenaltyDecisionDto, PenaltyPaymentDto, ReviewCancellationDto } from './dto';"],
  [
    "    return this.rescue.decidePenalty(req.user.sub, id, dto.decision, dto.reason);\n  }",
    "    return this.rescue.decidePenalty(req.user.sub, id, dto.decision, dto.reason);\n  }\n\n  /** Paiement d'une pénalité reçu par virement (facture de pénalité). */\n  @Post('penalties/:id/payment')\n  @HttpCode(HttpStatus.OK)\n  payment(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PenaltyPaymentDto) {\n    return this.rescue.recordPenaltyPayment(req.user.sub, id, dto.amountCents, dto.reference);\n  }",
  ],
]);

edit('src/line-bookings/rescue.service.ts', [
  ["import { AuditService } from '../audit/audit.service';", "import { AuditService } from '../audit/audit.service';\nimport { InvoicesService } from '../invoices/invoices.service';"],
  ['    private audit: AuditService,\n  ) {}', '    private audit: AuditService,\n    // Optionnel : certains tests construisent ce service sans facturation.\n    @Optional() private invoices?: InvoicesService,\n  ) {}'],
  ['    const report = { advanced: 0, failed: 0, reminders: 0, failures: 0, penaltiesApplied: 0 };', '    const report = { advanced: 0, failed: 0, reminders: 0, failures: 0, penaltiesApplied: 0, penaltiesInvoiced: 0 };'],
  [
    "    for (const p of due) report.penaltiesApplied += await this.applyPenalty(p, now, SYSTEM_USER.sub, null);\n    return report;",
    "    for (const p of due) report.penaltiesApplied += await this.applyPenalty(p, now, SYSTEM_USER.sub, null);\n\n    // 5. Pénalités que les reversements n'ont pas recouvrées en 30 jours : facture du solde.\n    report.penaltiesInvoiced = await this.invoiceOverduePenalties(now);\n    return report;",
  ],
  [
    '  async myCancellations(driverId: string) {',
    `  /**
   * « À défaut de retenue, facture de pénalité payable sous 30 jours »
   * (protocole). La retenue sur les reversements continue ensuite : jamais
   * plus que le solde n'est recouvré, quel que soit le moyen.
   */
  private async invoiceOverduePenalties(now: Date): Promise<number> {
    if (!this.invoices) return 0;
    const since = new Date(now.getTime() - penaltyInvoiceAfterDays() * DAY_MS);
    const overdue = await this.prisma.driverPenalty.findMany({
      where: { status: 'applied', collectedAt: null, invoiceId: null, decidedAt: { lte: since } },
      take: 50,
    });
    let issued = 0;
    for (const p of overdue) {
      const remaining = p.amountCents - p.collectedCents;
      if (remaining <= 0) continue;
      const cancellation = await this.prisma.driverCancellation.findUnique({ where: { id: p.cancellationId } });
      const departure = cancellation && (await this.prisma.lineDeparture.findUnique({ where: { id: cancellation.departureId } }));
      const line = departure && (await this.prisma.recurringLine.findUnique({ where: { id: departure.lineId } }));
      const dueDate = new Date(now.getTime() + PENALTY_INVOICE_DUE_DAYS * DAY_MS);
      const invoice = await this.invoices.issuePenalty({
        penaltyId: p.id, driverId: p.driverId, amountCents: remaining, jurisdiction: line?.jurisdiction ?? 'FR', departureAt: departure?.departureAt ?? null, dueDate,
      });
      if (!invoice) continue; // émission échouée (tracée) : nouvel essai au tour suivant
      await this.prisma.driverPenalty.update({ where: { id: p.id }, data: { invoiceId: invoice.id, invoicedAt: now } });
      await this.notifications.notify(p.driverId, 'line.penalty.invoiced', 'Facture de pénalité',
        \`Une facture de \${euros(remaining)} € (pénalité d’annulation) est à régler sous \${PENALTY_INVOICE_DUE_DAYS} jours.\`, { penaltyId: p.id, invoiceId: invoice.id });
      await this.audit.log({ userId: SYSTEM_USER.sub, action: 'line.penalty.invoice', entity: 'DriverPenalty', entityId: p.id, metadata: { invoiceId: invoice.id, number: invoice.number, amountCents: remaining } });
      issued++;
    }
    return issued;
  }

  /**
   * L'équipe enregistre un paiement reçu hors application (virement de la
   * facture de pénalité). Jamais plus que le solde ; la pénalité soldée
   * finance le bonus du chauffeur de secours.
   */
  async recordPenaltyPayment(adminId: string, id: string, amountCents: number, reference: string, now = new Date()) {
    const p = await this.prisma.driverPenalty.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pénalité introuvable');
    if (p.status !== 'applied') throw new ConflictException('Seule une pénalité appliquée peut être réglée');
    const remaining = p.amountCents - p.collectedCents;
    if (remaining <= 0) throw new ConflictException('Cette pénalité est déjà soldée');
    if (amountCents > remaining) throw new BadRequestException(\`Montant supérieur au solde dû (\${euros(remaining)} €)\`);
    const collected = p.collectedCents + amountCents;
    // Écriture conditionnelle : une retenue sur reversement au même instant ne se cumule pas au-delà du solde.
    const { count } = await this.prisma.driverPenalty.updateMany({
      where: { id, status: 'applied', collectedCents: p.collectedCents },
      data: { collectedCents: collected, collectedAt: collected >= p.amountCents ? now : null },
    });
    if (count === 0) throw new ConflictException('Le solde de cette pénalité vient de changer : rechargez la page');
    await this.audit.log({ userId: adminId, action: 'line.penalty.payment', entity: 'DriverPenalty', entityId: id, metadata: { amountCents, reference, collectedCents: collected } });
    await this.notifications.notify(p.driverId, 'line.penalty.payment', 'Paiement reçu',
      collected >= p.amountCents
        ? \`Votre paiement de \${euros(amountCents)} € est enregistré : votre pénalité est soldée.\`
        : \`Votre paiement de \${euros(amountCents)} € est enregistré. Reste dû : \${euros(p.amountCents - collected)} €.\`, { penaltyId: id });
    return { id, collectedCents: collected, remainingCents: p.amountCents - collected, settled: collected >= p.amountCents };
  }

  async myCancellations(driverId: string) {`,
  ],
  [
    "    const penalties = await this.prisma.driverPenalty.findMany({ where: { cancellationId: { in: rows.map((r) => r.id) } } });\n    return rows.map((r) => {\n      const p = penalties.find((x) => x.cancellationId === r.id);",
    "    const penalties = await this.prisma.driverPenalty.findMany({ where: { cancellationId: { in: rows.map((r) => r.id) } } });\n    const invoices = await this.invoicesOf(penalties);\n    return rows.map((r) => {\n      const p = penalties.find((x) => x.cancellationId === r.id);",
  ],
  [
    'penalty: p ? { id: p.id, amountCents: p.amountCents, status: p.status, contestUntil: p.contestUntil, collectedCents: p.collectedCents } : null,',
    'penalty: p\n          ? { id: p.id, amountCents: p.amountCents, status: p.status, contestUntil: p.contestUntil, collectedCents: p.collectedCents, invoice: invoices.get(p.invoiceId ?? \'\') ?? null }\n          : null,',
  ],
  [
    "    const names = await this.names(rows.map((r) => r.driverId));\n    return rows.map((r) => ({ ...r, driverName: names.get(r.driverId) ?? null }));",
    "    const names = await this.names(rows.map((r) => r.driverId));\n    const invoices = await this.invoicesOf(rows);\n    return rows.map((r) => ({ ...r, driverName: names.get(r.driverId) ?? null, invoice: invoices.get(r.invoiceId ?? '') ?? null }));\n  }\n\n  /** Factures de pénalité (numéro, échéance) par identifiant. */\n  private async invoicesOf(penalties: { invoiceId: string | null }[]) {\n    const ids = penalties.map((p) => p.invoiceId).filter((x): x is string => !!x);\n    if (ids.length === 0) return new Map<string, { id: string; number: string; totalCents: number; dueDate: Date | null }>();\n    const rows = await this.prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, totalCents: true, dueDate: true } });\n    return new Map(rows.map((i) => [i.id, i]));",
  ],
]);

edit('src/i18n/messages.en.ts', [
  [
    "  'Reversement introuvable': 'Payout not found',",
    "  'Reversement introuvable': 'Payout not found',\n  'Montant en centimes': 'Amount in cents',\n  'Référence du paiement : 3 caractères minimum': 'Payment reference: at least 3 characters',\n  'Référence du paiement limitée à 120 caractères': 'Payment reference limited to 120 characters',\n  'Seule une pénalité appliquée peut être réglée': 'Only an applied penalty can be paid',\n  'Cette pénalité est déjà soldée': 'This penalty is already settled',\n  'Montant supérieur au solde dû ({} €)': 'Amount higher than the balance due (€{})',\n  'Le solde de cette pénalité vient de changer : rechargez la page': 'The balance of this penalty has just changed: reload the page',\n  'Facture de pénalité': 'Penalty invoice',\n  'Une facture de {} € (pénalité d’annulation) est à régler sous {} jours.': 'An invoice of €{} (cancellation penalty) is payable within {} days.',\n  'Paiement reçu': 'Payment received',\n  'Votre paiement de {} € est enregistré : votre pénalité est soldée.': 'Your payment of €{} has been recorded: your penalty is settled.',\n  'Votre paiement de {} € est enregistré. Reste dû : {} €.': 'Your payment of €{} has been recorded. Still due: €{}.',",
  ],
]);
console.log('ok');

// Imports de rescue.service.ts.
{
  const f = R + 'src/line-bookings/rescue.service.ts';
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace("import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';", "import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';");
  s = s.replace('  PENALTY_FROM_COUNT,\n', '  PENALTY_FROM_COUNT,\n  PENALTY_INVOICE_DUE_DAYS,\n');
  s = s.replace('  penaltyCents,\n  rescueBonusCents,', '  penaltyCents,\n  penaltyInvoiceAfterDays,\n  rescueBonusCents,');
  for (const needle of ['Optional }', 'PENALTY_INVOICE_DUE_DAYS,', 'penaltyInvoiceAfterDays,']) if (!s.includes(needle)) throw new Error('import : ' + needle);
  fs.writeFileSync(f, s);
}
console.log('imports ok');
