// Stripe Connect, étape 4 : reversement à l'opérateur en fin de trajet.
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
    '// Ligne régulière : trajet type + calendrier. Le trajet (origine,',
    `// Reversement dû à l'opérateur pour une course terminée (lignes et bourse
// payées en ligne) : un par course, viré sur son compte de versement.
model Payout {
  id               String    @id @default(uuid())
  tripId           String    @unique
  driverId         String // celui qui a assuré la course (titulaire ou secours)
  paymentId        String? // encaissement du passager dont provient le virement
  amountCents      Int // prix HT − commission XLCAB
  currency         String    @default("EUR")
  // pending : à virer ; paid : viré ; blocked : compte de versement pas prêt ;
  // failed : incident Stripe (repris automatiquement) ; void : rien à verser.
  status           String    @default("pending")
  stripeTransferId String?
  stripeAccountId  String?
  attempts         Int       @default(0)
  nextAttemptAt    DateTime?
  lastError        String?
  createdAt        DateTime  @default(now())
  paidAt           DateTime?

  @@index([driverId, createdAt])
  @@index([status, nextAttemptAt])
}

// Ligne régulière : trajet type + calendrier. Le trajet (origine,`,
  ],
]);

edit('src/testing/memory-prisma.ts', [
  [
    '    payoutAccount: new Table(() => ({',
    "    payout: new Table(() => ({\n      paymentId: null, currency: 'EUR', status: 'pending', stripeTransferId: null, stripeAccountId: null, attempts: 0, nextAttemptAt: null, lastError: null,\n      createdAt: new Date(), paidAt: null,\n    })),\n    payoutAccount: new Table(() => ({",
  ],
]);

edit('src/testing/fake-stripe.ts', [
  [
    "      Object.assign(i, { status: 'succeeded', amount_received: i.amount, amount_capturable: 0 });\n      return i;\n    },",
    "      Object.assign(i, { status: 'succeeded', amount_received: i.amount, amount_capturable: 0, latest_charge: `ch_${id}` });\n      return i;\n    },",
  ],
  [
    "    i.status = 'succeeded';\n    i.amount_received = i.amount;\n    return i;",
    "    i.status = 'succeeded';\n    i.amount_received = i.amount;\n    i.latest_charge = `ch_${intentId}`;\n    return i;",
  ],
  [
    '  // ── Stripe Connect : comptes de versement des opérateurs ──',
    "  // ── Stripe Connect : reversements aux opérateurs ──\n  transfersCreated: { params: any; options: any; id: string }[] = [];\n  /** Erreur à lever sur le prochain virement (incident Stripe). */\n  failNextTransfer = false;\n\n  transfers = {\n    create: async (params: any, options: any) => {\n      if (this.failNextTransfer) {\n        this.failNextTransfer = false;\n        throw new Error('Stripe API indisponible');\n      }\n      // Même clé d'idempotence = même virement, comme chez Stripe.\n      const same = this.transfersCreated.find((t) => options?.idempotencyKey && t.options?.idempotencyKey === options.idempotencyKey);\n      if (same) return { id: same.id, amount: same.params.amount };\n      const id = `tr_${++this.seq}`;\n      this.transfersCreated.push({ params, options, id });\n      return { id, amount: params.amount };\n    },\n  };\n\n  // ── Stripe Connect : comptes de versement des opérateurs ──",
  ],
]);

// Module déplacé dans payouts.module.ts.
{
  const f = R + 'src/payouts/payout-accounts.ts';
  let s = fs.readFileSync(f, 'utf8');
  const start = s.indexOf('// Module autonome (Prisma et Redis sont globaux)');
  if (start < 0) throw new Error('module introuvable');
  s = s.slice(0, start).trimEnd() + '\n';
  s = s.replace("  Logger,\n  Module,\n  Post,", '  Logger,\n  Post,');
  s = s.replace("import { AuditModule, AuditService } from '../audit/audit.service';", "import { AuditService } from '../audit/audit.service';");
  s = s.replace("import { NotificationsModule, NotificationsService } from '../notifications/notifications.service';", "import { NotificationsService } from '../notifications/notifications.service';");
  s = s.replace("import { STRIPE_CLIENT, stripeProvider } from '../payments/stripe.provider';", "import { STRIPE_CLIENT } from '../payments/stripe.provider';");
  fs.writeFileSync(f, s);
}
for (const file of ['src/app.module.ts', 'src/operators/operators.module.ts', 'src/market/market.module.ts', 'src/payouts/payout-accounts.integration.spec.ts']) {
  edit(file, [["import { PayoutsModule } from '../payouts/payout-accounts';", "import { PayoutsModule } from '../payouts/payouts.module';"]].filter(([a]) => fs.readFileSync(R + file, 'utf8').includes(a)));
}
edit('src/app.module.ts', [["import { PayoutsModule } from './payouts/payout-accounts';", "import { PayoutsModule } from './payouts/payouts.module';"]]);
edit('src/payouts/payout-accounts.integration.spec.ts', [["import { PayoutsModule } from './payout-accounts';", "import { PayoutsModule } from './payouts.module';"]]);

// Fin de course → reversement.
edit('src/trips/trips.module.ts', [
  ["import { OperatorsModule } from '../operators/operators.module';", "import { OperatorsModule } from '../operators/operators.module';\nimport { PayoutsModule } from '../payouts/payouts.module';"],
  [
    'imports: [TrackingModule, MatchingModule, PaymentsModule, ParcelsModule, InvoicesModule, OperatorsModule],',
    "// PayoutsModule : reversement à l'opérateur en fin de course (lignes, bourse).\n  imports: [TrackingModule, MatchingModule, PaymentsModule, ParcelsModule, InvoicesModule, OperatorsModule, PayoutsModule],",
  ],
]);
edit('src/trips/trips.service.ts', [
  ['    private lines: LinesService,\n  ) {}', '    private lines: LinesService,\n    private payouts: TripPayoutsService,\n  ) {}'],
  [
    '    await this.invoices.issueForTrip(tripId);\n    return { tripId, status: TripStatus.COMPLETED, completedAt: now };',
    "    await this.invoices.issueForTrip(tripId);\n    // Ligne ou bourse payée en ligne : part de l'opérateur virée sur son compte de versement.\n    await this.payouts.onTripCompleted(tripId, now);\n    return { tripId, status: TripStatus.COMPLETED, completedAt: now };",
  ],
  ["import { LinesService } from '../operators/lines.service';", "import { LinesService } from '../operators/lines.service';\nimport { TripPayoutsService } from '../payouts/trip-payouts';"],
]);

// Planificateur : reprises.
edit('src/scheduler/scheduler.module.ts', [
  ['LineBookingsModule, MarketModule],', 'LineBookingsModule, MarketModule, PayoutsModule],'],
  ["import { SchedulerService }", "import { PayoutsModule } from '../payouts/payouts.module';\nimport { SchedulerService }"],
]);
edit('src/scheduler/scheduler.service.ts', [
  ["import { MarketService } from '../market/market.service';", "import { MarketService } from '../market/market.service';\nimport { TripPayoutsService } from '../payouts/trip-payouts';"],
  [
    "  market: Awaited<ReturnType<MarketService['tick']>> | null;\n}",
    "  market: Awaited<ReturnType<MarketService['tick']>> | null;\n  /** Reversements aux opérateurs repris à ce tour (virés, en attente de compte, en échec). */\n  payouts: Awaited<ReturnType<TripPayoutsService['tick']>> | null;\n}",
  ],
  [' * - bourse : propositions et demandes arrivées à échéance.\n', ' * - bourse : propositions et demandes arrivées à échéance ;\n * - reversements aux opérateurs à reprendre (compte de versement ouvert depuis, incident Stripe).\n'],
  ['    @Optional() private market?: MarketService,', '    @Optional() private market?: MarketService,\n    @Optional() private payouts?: TripPayoutsService,'],
  [
    '    // Lignes régulières : départs générés sur 30 jours glissants, une fois par jour.',
    "    // Reversements aux opérateurs : reprises.\n    let payouts: TickReport['payouts'] = null;\n    if (this.payouts) {\n      try {\n        payouts = await this.payouts.tick(now);\n      } catch (err) {\n        this.logger.error(`Reversements aux opérateurs en échec : ${(err as Error).message}`);\n      }\n    }\n\n    // Lignes régulières : départs générés sur 30 jours glissants, une fois par jour.",
  ],
  ['compliance, linesSynced, rescue, market,\n    };', 'compliance, linesSynced, rescue, market, payouts,\n    };'],
]);
console.log('ok');
