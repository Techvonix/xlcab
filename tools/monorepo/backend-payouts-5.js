// Stripe Connect, étape 5 : pénalités d'annulation retenues sur les reversements.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(R + file, s);
}

edit('prisma/schema.prisma', [
  [
    '  decidedAt      DateTime?\n  createdAt      DateTime  @default(now())\n\n  @@index([status, contestUntil])\n}',
    "  decidedAt      DateTime?\n  // Recouvrement : retenues sur les reversements du chauffeur (PayoutDeduction).\n  collectedCents Int       @default(0)\n  collectedAt    DateTime? // entièrement recouvrée\n  createdAt      DateTime  @default(now())\n\n  @@index([status, contestUntil])\n  @@index([driverId, status])\n}",
  ],
  [
    '  amountCents      Int // prix HT − commission XLCAB\n',
    '  grossCents       Int       @default(0) // prix HT − commission XLCAB\n  withheldCents    Int       @default(0) // pénalités d\'annulation retenues\n  amountCents      Int // viré : grossCents − withheldCents\n',
  ],
  [
    '  // pending : à virer ; paid : viré ; blocked : compte de versement pas prêt ;\n  // failed : incident Stripe (repris automatiquement) ; void : rien à verser.',
    '  // draft : en préparation (retenues) ; pending : à virer ; paid : viré ;\n  // blocked : compte de versement pas prêt ; failed : incident Stripe (repris\n  // automatiquement) ; withheld : entièrement retenu ; void : rien à verser.',
  ],
  [
    '// Ligne régulière : trajet type + calendrier. Le trajet (origine,',
    "// Part d'une pénalité d'annulation retenue sur un reversement.\nmodel PayoutDeduction {\n  id          String   @id @default(uuid())\n  payoutId    String\n  penaltyId   String\n  amountCents Int\n  createdAt   DateTime @default(now())\n\n  @@index([payoutId])\n  @@index([penaltyId])\n}\n\n// Ligne régulière : trajet type + calendrier. Le trajet (origine,",
  ],
]);

edit('src/testing/memory-prisma.ts', [
  [
    "    payout: new Table(() => ({\n      paymentId: null,",
    "    payoutDeduction: new Table(() => ({ createdAt: new Date() })),\n    payout: new Table(() => ({\n      grossCents: 0, withheldCents: 0, paymentId: null,",
  ],
]);
{
  // Pénalité : recouvrement à zéro par défaut dans la base de test.
  const f = R + 'src/testing/memory-prisma.ts';
  let s = fs.readFileSync(f, 'utf8');
  const at = s.indexOf('driverPenalty: new Table(() => ({');
  if (at < 0) throw new Error('driverPenalty introuvable');
  s = s.slice(0, at) + 'driverPenalty: new Table(() => ({\n      collectedCents: 0, collectedAt: null,' + s.slice(at + 'driverPenalty: new Table(() => ({'.length);
  fs.writeFileSync(f, s);
}

edit('src/line-bookings/rescue.service.ts', [
  [
    'penalty: p ? { id: p.id, amountCents: p.amountCents, status: p.status, contestUntil: p.contestUntil } : null,',
    'penalty: p ? { id: p.id, amountCents: p.amountCents, status: p.status, contestUntil: p.contestUntil, collectedCents: p.collectedCents } : null,',
  ],
]);

edit('src/payouts/trip-payouts.ts', [
  [
    "export const PAYOUT_STATUSES = ['pending', 'paid', 'blocked', 'failed', 'void'] as const;",
    "export const PAYOUT_STATUSES = ['draft', 'pending', 'paid', 'blocked', 'failed', 'withheld', 'void'] as const;",
  ],
  [
    "/** Filet de sécurité : courses terminées depuis moins de 7 jours sans reversement enregistré. */\nconst SWEEP_DAYS = 7;",
    "/** Filet de sécurité : courses terminées depuis moins de 7 jours sans reversement enregistré. */\nconst SWEEP_DAYS = 7;\n/** Reversement resté « en préparation » (arrêt du serveur au mauvais moment) : repris après ce délai. */\nconst DRAFT_STALE_MS = 5 * 60_000;\n\n/**\n * Part maximale d'un reversement qui peut être retenue pour une pénalité\n * d'annulation (PENALTY_WITHHOLD_PERCENT, 100 par défaut : la pénalité est\n * recouvrée sur les premiers reversements). À VALIDER par le porteur de projet.\n */\nexport function penaltyWithholdPercent(): number {\n  const value = Number(process.env.PENALTY_WITHHOLD_PERCENT);\n  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 100;\n}",
  ],
  ['  driverId: string;\n  amountCents: number;\n  status: string;', '  driverId: string;\n  grossCents: number;\n  withheldCents: number;\n  amountCents: number;\n  status: string;'],
  [
    "    const amountCents = Math.min(operatorShareCents(trip), Math.max(0, payment.amountCents - payment.refundedCents));\n    try {\n      return (await this.prisma.payout.create({\n        data: { tripId, driverId: trip.driverId, paymentId: payment.id, amountCents, currency: 'EUR', status: amountCents > 0 ? 'pending' : 'void' },\n      })) as PayoutRow;\n    } catch (err: any) {",
    "    const grossCents = Math.min(operatorShareCents(trip), Math.max(0, payment.amountCents - payment.refundedCents));\n    try {\n      // « draft » : rien ne peut être viré tant que les retenues ne sont pas calculées.\n      const draft = (await this.prisma.payout.create({\n        data: { tripId, driverId: trip.driverId, paymentId: payment.id, grossCents, withheldCents: 0, amountCents: grossCents, currency: 'EUR', status: 'draft' },\n      })) as PayoutRow;\n      return await this.finalize(draft);\n    } catch (err: any) {",
  ],
  [
    "  /** Tente le virement. Compte de versement absent",
    `  /**
   * Retient sur ce reversement les pénalités d'annulation dues par le
   * chauffeur (appliquées, donc hors délai de contestation et non
   * contestées), les plus anciennes d'abord, puis fixe le montant à virer.
   * Rejouable : reprend là où une exécution interrompue s'était arrêtée.
   */
  private async finalize(draft: PayoutRow): Promise<PayoutRow> {
    const already = (await this.prisma.payoutDeduction.findMany({ where: { payoutId: draft.id }, select: { amountCents: true } })).reduce(
      (sum: number, d: { amountCents: number }) => sum + d.amountCents, 0,
    );
    const ceiling = Math.floor((draft.grossCents * penaltyWithholdPercent()) / 100);
    let withheld = already;

    const penalties = await this.prisma.driverPenalty.findMany({ where: { driverId: draft.driverId, status: 'applied', collectedAt: null }, orderBy: { createdAt: 'asc' } });
    for (const penalty of penalties) {
      const room = ceiling - withheld;
      if (room <= 0) break;
      const part = Math.min(room, penalty.amountCents - penalty.collectedCents);
      if (part <= 0) continue;
      const collected = penalty.collectedCents + part;
      const taken = await this.prisma.$transaction(async (tx) => {
        // Écriture conditionnelle : deux reversements simultanés ne retiennent pas deux fois la même somme.
        const { count } = await tx.driverPenalty.updateMany({
          where: { id: penalty.id, status: 'applied', collectedCents: penalty.collectedCents },
          data: { collectedCents: collected, collectedAt: collected >= penalty.amountCents ? new Date() : null },
        });
        if (count === 0) return false;
        await tx.payoutDeduction.create({ data: { payoutId: draft.id, penaltyId: penalty.id, amountCents: part } });
        return true;
      });
      if (!taken) continue;
      withheld += part;
      await this.audit.log({
        action: 'payout.penalty_withheld', entity: 'DriverPenalty', entityId: penalty.id,
        metadata: { payoutId: draft.id, amountCents: part, collectedCents: collected, penaltyCents: penalty.amountCents },
      });
    }

    const amountCents = draft.grossCents - withheld;
    const status = amountCents > 0 ? 'pending' : withheld > 0 ? 'withheld' : 'void';
    const payout = (await this.prisma.payout.update({ where: { id: draft.id }, data: { withheldCents: withheld, amountCents, status } })) as PayoutRow;
    if (withheld > already) {
      const stillDue = (await this.prisma.driverPenalty.findMany({ where: { driverId: draft.driverId, status: 'applied', collectedAt: null } })).reduce(
        (sum: number, p: { amountCents: number; collectedCents: number }) => sum + p.amountCents - p.collectedCents, 0,
      );
      await this.notifications.notify(
        draft.driverId, 'payout.withheld', 'Pénalité retenue',
        stillDue > 0
          ? \`\${euros(withheld)} € ont été retenus sur votre revenu au titre d’une pénalité d’annulation. Reste dû : \${euros(stillDue)} €.\`
          : \`\${euros(withheld)} € ont été retenus sur votre revenu au titre d’une pénalité d’annulation. Elle est maintenant soldée.\`,
        { tripId: draft.tripId },
      );
    }
    return payout;
  }

  /** Tente le virement. Compte de versement absent`,
  ],
  [
    "    const due = (await this.prisma.payout.findMany({\n      where: { status: { in: ['pending', 'blocked', 'failed'] }, nextAttemptAt: { lte: now } },",
    "    // Reversements restés en préparation (serveur arrêté pendant le calcul des retenues).\n    const drafts = (await this.prisma.payout.findMany({ where: { status: 'draft', createdAt: { lte: new Date(now.getTime() - DRAFT_STALE_MS) } }, take: 100 })) as PayoutRow[];\n    for (const draft of drafts) {\n      try {\n        await this.finalize(draft);\n      } catch (err) {\n        this.logger.error(`Reversement ${draft.id} non finalisé : ${(err as Error).message}`);\n      }\n    }\n\n    const due = (await this.prisma.payout.findMany({\n      where: { status: { in: ['pending', 'blocked', 'failed'] }, nextAttemptAt: { lte: now } },",
  ],
  [
    "      paidCents: sum(['paid']),\n      pendingCents: sum(['pending', 'blocked', 'failed']),",
    "      paidCents: sum(['paid']),\n      pendingCents: sum(['draft', 'pending', 'blocked', 'failed']),\n      // Pénalités d'annulation retenues sur ces reversements.\n      withheldCents: rows.reduce((s, r) => s + r.withheldCents, 0),",
  ],
  [
    "            amountCents: r.amountCents,\n            // Un incident technique est « en cours » pour l'opérateur : il n'a rien à faire.\n            status: r.status === 'failed' ? 'pending' : r.status,",
    "            amountCents: r.amountCents,\n            grossCents: r.grossCents,\n            withheldCents: r.withheldCents,\n            // Un incident technique est « en cours » pour l'opérateur : il n'a rien à faire.\n            status: r.status === 'failed' || r.status === 'draft' ? 'pending' : r.status,",
  ],
  [
    "        id: r.id, tripId: r.tripId, driverId: r.driverId, amountCents: r.amountCents, status: r.status,",
    "        id: r.id, tripId: r.tripId, driverId: r.driverId, amountCents: r.amountCents, grossCents: r.grossCents, withheldCents: r.withheldCents, status: r.status,",
  ],
]);
console.log('ok');
