// Stripe Connect, étape 6 : bonus de reprise viré au chauffeur de secours.
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
    'model DriverBonus {\n  id          String   @id @default(uuid())\n  driverId    String\n  departureId String\n  penaltyId   String?\n  amountCents Int\n  createdAt   DateTime @default(now())\n\n  @@index([driverId])\n}',
    `model DriverBonus {
  id               String    @id @default(uuid())
  driverId         String
  departureId      String
  penaltyId        String?
  amountCents      Int
  // Virement Stripe Connect, une fois la pénalité recouvrée à hauteur du bonus :
  // pending : à virer ; paid : viré ; blocked : compte de versement pas prêt ;
  // failed : incident Stripe (repris automatiquement).
  status           String    @default("pending")
  stripeTransferId String?
  stripeAccountId  String?
  attempts         Int       @default(0)
  nextAttemptAt    DateTime?
  lastError        String?
  paidAt           DateTime?
  createdAt        DateTime  @default(now())

  @@index([driverId])
  @@index([status, nextAttemptAt])
}`,
  ],
]);

edit('src/testing/memory-prisma.ts', [
  [
    'driverBonus: new Table(() => ({ penaltyId: null, createdAt: new Date() })),',
    "driverBonus: new Table(() => ({\n      penaltyId: null, status: 'pending', stripeTransferId: null, stripeAccountId: null, attempts: 0, nextAttemptAt: null, lastError: null, paidAt: null,\n      createdAt: new Date(),\n    })),",
  ],
]);

edit('src/payouts/trip-payouts.ts', [
  // Planificateur : bonus dus.
  [
    "      const status = await this.attempt(payout, now);\n      if (status !== 'pending') report[status as 'paid' | 'blocked' | 'failed']++;\n    }\n    return report;",
    "      const status = await this.attempt(payout, now);\n      if (status !== 'pending') report[status as 'paid' | 'blocked' | 'failed']++;\n    }\n    report.bonusesPaid = await this.payBonuses(now);\n    return report;",
  ],
  ['    const report = { paid: 0, blocked: 0, failed: 0, registered: 0 };', '    const report = { paid: 0, blocked: 0, failed: 0, registered: 0, bonusesPaid: 0 };'],
  [
    '  // ── Vues ────────────────────────────────────────────────────────────',
    `  // ── Bonus de reprise du chauffeur de secours ────────────────────────
  //
  // Le bonus (160 €) est financé par la pénalité du chauffeur défaillant :
  // « pas de bonus sans pénalité encaissée ». Il est viré dès que la
  // pénalité a été recouvrée à hauteur du bonus (le secours passe avant la
  // part des avoirs passagers) — règle À VALIDER par le porteur de projet.
  // Le virement vient du solde de la plateforme (pas d'encaissement lié).

  /** Bonus dont la pénalité est suffisamment recouvrée : virés. Renvoie le nombre de bonus versés. */
  async payBonuses(now = new Date()): Promise<number> {
    if (!this.stripe) return 0;
    const bonuses = (await this.prisma.driverBonus.findMany({
      where: { status: { in: ['pending', 'blocked', 'failed'] }, penaltyId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })) as BonusRow[];
    let paid = 0;
    for (const bonus of bonuses) {
      if (bonus.nextAttemptAt && bonus.nextAttemptAt > now) continue;
      try {
        if (!(await this.bonusFunded(bonus))) continue;
        if ((await this.attemptBonus(bonus, now)) === 'paid') paid++;
      } catch (err) {
        this.logger.error(\`Bonus \${bonus.id} non traité : \${(err as Error).message}\`);
      }
    }
    return paid;
  }

  /** La pénalité qui finance ce bonus est due (appliquée) et recouvrée à hauteur du bonus. */
  private async bonusFunded(bonus: BonusRow): Promise<boolean> {
    const penalty = bonus.penaltyId ? await this.prisma.driverPenalty.findUnique({ where: { id: bonus.penaltyId } }) : null;
    return !!penalty && penalty.status === 'applied' && penalty.collectedCents >= Math.min(bonus.amountCents, penalty.amountCents);
  }

  private async attemptBonus(bonus: BonusRow, now: Date): Promise<'paid' | 'blocked' | 'failed'> {
    const accountId = await this.accounts.readyAccountId(bonus.driverId);
    if (!accountId) {
      await this.prisma.driverBonus.update({ where: { id: bonus.id }, data: { status: 'blocked', nextAttemptAt: new Date(now.getTime() + BLOCKED_RETRY_MS) } });
      if (bonus.status !== 'blocked') {
        await this.notifications.notify(
          bonus.driverId, 'payout.blocked', 'Revenu en attente',
          \`\${euros(bonus.amountCents)} € vous attendent : ouvrez ou complétez votre compte de versement pour les recevoir.\`, { departureId: bonus.departureId },
        );
      }
      return 'blocked';
    }
    try {
      const transfer = await this.stripe!.transfers.create(
        {
          amount: bonus.amountCents,
          currency: 'eur',
          destination: accountId,
          description: \`Bonus de reprise XLCAB \${bonus.departureId}\`,
          metadata: { bonusId: bonus.id, departureId: bonus.departureId },
        },
        { idempotencyKey: \`bonus-\${bonus.id}-\${accountId}\` },
      );
      await this.prisma.driverBonus.update({
        where: { id: bonus.id },
        data: { status: 'paid', stripeTransferId: transfer.id, stripeAccountId: accountId, paidAt: now, nextAttemptAt: null, lastError: null, attempts: bonus.attempts + 1 },
      });
      await this.audit.log({ action: 'bonus.paid', entity: 'DriverBonus', entityId: bonus.id, metadata: { departureId: bonus.departureId, amountCents: bonus.amountCents } });
      await this.notifications.notify(
        bonus.driverId, 'bonus.paid', 'Bonus de reprise versé', \`\${euros(bonus.amountCents)} € ont été versés sur votre compte de versement.\`, { departureId: bonus.departureId },
      );
      return 'paid';
    } catch (err) {
      const attempts = bonus.attempts + 1;
      const delay = Math.min(FAILED_BASE_RETRY_MS * 2 ** (attempts - 1), FAILED_MAX_RETRY_MS);
      await this.prisma.driverBonus.update({
        where: { id: bonus.id },
        data: {
          status: 'failed', attempts, lastError: String((err as Error).message).slice(0, 300),
          nextAttemptAt: attempts >= PAYOUT_MAX_ATTEMPTS ? null : new Date(now.getTime() + delay),
        },
      });
      this.logger.error(\`Bonus \${bonus.id} non viré (essai \${attempts}) : \${(err as Error).message}\`);
      if (attempts === PAYOUT_MAX_ATTEMPTS) {
        await this.audit.log({ action: 'bonus.abandoned', entity: 'DriverBonus', entityId: bonus.id, metadata: { amountCents: bonus.amountCents } });
      }
      return 'failed';
    }
  }

  /** Équipe XLCAB : bonus de reprise et où en est leur virement. */
  async adminBonuses() {
    const rows = (await this.prisma.driverBonus.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })) as BonusRow[];
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.driverId) } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const penalties = await this.prisma.driverPenalty.findMany({ where: { id: { in: rows.map((r) => r.penaltyId).filter((x): x is string => !!x) } } });
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.driverId);
      const p = penalties.find((x) => x.id === r.penaltyId);
      return {
        id: r.id, driverId: r.driverId, departureId: r.departureId, amountCents: r.amountCents, status: r.status, attempts: r.attempts, lastError: r.lastError,
        createdAt: r.createdAt, paidAt: r.paidAt,
        driverName: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null,
        // Ce qui a déjà été recouvré sur la pénalité qui finance ce bonus.
        penaltyCollectedCents: p?.collectedCents ?? 0,
        penaltyCents: p?.amountCents ?? 0,
        needsAttention: r.status === 'failed' && r.attempts >= PAYOUT_MAX_ATTEMPTS,
      };
    });
  }

  /** Équipe XLCAB : relance immédiate du virement d'un bonus (seulement s'il est financé). */
  async adminRetryBonus(adminId: string, bonusId: string, ctx: { ipAddress?: string; userAgent?: string }, now = new Date()) {
    const bonus = (await this.prisma.driverBonus.findUnique({ where: { id: bonusId } })) as BonusRow | null;
    if (!bonus) throw new NotFoundException('Bonus introuvable');
    if (bonus.status === 'paid') throw new ConflictException('Ce bonus est déjà versé');
    if (!(await this.bonusFunded(bonus))) throw new ConflictException('La pénalité qui finance ce bonus n’est pas encore recouvrée');
    if (!this.stripe) throw new ConflictException('Paiement momentanément indisponible');
    const status = await this.attemptBonus(bonus, now);
    await this.audit.log({ userId: adminId, action: 'bonus.retry', entity: 'DriverBonus', entityId: bonusId, metadata: { status }, ...ctx });
    return { id: bonusId, status };
  }

  // ── Vues ────────────────────────────────────────────────────────────`,
  ],
  // Vue de l'opérateur : ses bonus.
  [
    "    const sum = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amountCents, 0);\n    return {",
    "    const sum = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amountCents, 0);\n    const bonuses = (await this.prisma.driverBonus.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' }, take: 20 })) as BonusRow[];\n    return {\n      // Bonus de reprise (départs sauvés) : versés quand la pénalité du chauffeur défaillant est recouvrée.\n      bonuses: bonuses.map((b) => ({ id: b.id, amountCents: b.amountCents, status: b.status === 'paid' ? 'paid' : b.status === 'blocked' ? 'blocked' : 'pending', createdAt: b.createdAt, paidAt: b.paidAt })),",
  ],
  // Routes admin.
  [
    "  @Post(':id/retry')\n  @HttpCode(HttpStatus.OK)\n  retry(",
    "  @Get('bonuses')\n  bonuses() {\n    return this.payouts.adminBonuses();\n  }\n\n  @Post('bonuses/:id/retry')\n  @HttpCode(HttpStatus.OK)\n  retryBonus(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {\n    return this.payouts.adminRetryBonus(req.user.sub, id, AuditService.context(req));\n  }\n\n  @Post(':id/retry')\n  @HttpCode(HttpStatus.OK)\n  retry(",
  ],
  [
    "/** Part de l'opérateur : prix hors taxes",
    "type BonusRow = {\n  id: string;\n  driverId: string;\n  departureId: string;\n  penaltyId: string | null;\n  amountCents: number;\n  status: string;\n  attempts: number;\n  nextAttemptAt: Date | null;\n  lastError: string | null;\n  createdAt: Date;\n  paidAt: Date | null;\n};\n\n/** Part de l'opérateur : prix hors taxes",
  ],
]);

edit('src/i18n/messages.en.ts', [
  [
    "  'Reversement introuvable': 'Payout not found',",
    "  'Reversement introuvable': 'Payout not found',\n  'Bonus introuvable': 'Bonus not found',\n  'Ce bonus est déjà versé': 'This bonus has already been paid',\n  'La pénalité qui finance ce bonus n’est pas encore recouvrée': 'The penalty funding this bonus has not been recovered yet',\n  'Bonus de reprise versé': 'Rescue bonus paid',",
  ],
]);
console.log('ok');
