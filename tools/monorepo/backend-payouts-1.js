// Stripe Connect, étape 1 : branchement du compte de versement (lignes, bourse, configuration).
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('src/app.module.ts', [
  ["import { ImpactModule } from './impact/impact';", "import { ImpactModule } from './impact/impact';\nimport { PayoutsModule } from './payouts/payout-accounts';"],
  ['    ImpactModule,', '    ImpactModule,\n    PayoutsModule,'],
]);

edit('src/operators/operators.module.ts', [
  ["import { LinesService } from './lines.service';", "import { LinesService } from './lines.service';\nimport { PayoutsModule } from '../payouts/payout-accounts';"],
  ['@Module({\n  controllers:', '@Module({\n  // PayoutsModule : compte de versement exigé avant d\'ouvrir un départ à la réservation.\n  imports: [PayoutsModule],\n  controllers:'],
]);

edit('src/operators/lines.service.ts', [
  ["import { PrismaService } from '../prisma/prisma.service';", "import { PayoutAccountsService } from '../payouts/payout-accounts';\nimport { PrismaService } from '../prisma/prisma.service';"],
  ['    private audit: AuditService,\n  ) {}', '    private audit: AuditService,\n    private payouts: PayoutAccountsService,\n  ) {}'],
  [
    "  async confirm(userId: string, dto: ConfirmDeparturesDto, now = new Date()) {\n",
    "  async confirm(userId: string, dto: ConfirmDeparturesDto, now = new Date()) {\n    // Paiement en ligne activé : pas de mise en vente sans compte de versement validé.\n    await this.payouts.assertReady(userId);\n",
  ],
  [
    "    if (!closed && line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');\n    const updated",
    "    if (!closed && line.status === 'closed') throw new ConflictException('Ligne fermée : créez-en une nouvelle');\n    if (!closed) await this.payouts.assertReady(userId);\n    const updated",
  ],
]);

edit('src/line-bookings/line-bookings.service.ts', [
  [
    "/**\n * Paiement des réservations sur ligne. « deferred » (seul mode actuel) :\n * réservation confirmée sans encaissement en ligne, en attendant Stripe\n * Connect (décision du 2026-10-09 : XLCAB ne détient pas les fonds des\n * opérateurs). Refusé en production : pas de vente réelle avant Connect.\n */\nexport const linePaymentMode = () => process.env.LINE_PAYMENT_MODE || 'deferred';\n",
    "// Mode de paiement des lignes et de la bourse : voir payouts/payment-mode.ts.\n// « deferred » = réservation sans encaissement (tests), refusé en production.\nexport { linePaymentMode };\n",
  ],
  ["import { NotificationsService } from '../notifications/notifications.service';", "import { NotificationsService } from '../notifications/notifications.service';\nimport { linePaymentMode } from '../payouts/payment-mode';"],
]);

edit('src/security/env.validation.ts', [
  [
    "      problems.push('STRIPE_WEBHOOK_SECRET manquant alors que Stripe est configuré');\n    }",
    "      problems.push('STRIPE_WEBHOOK_SECRET manquant alors que Stripe est configuré');\n    }\n    if (str('LINE_PAYMENT_MODE') === 'connect' && (!str('STRIPE_SECRET_KEY') || !str('STRIPE_CONNECT_WEBHOOK_SECRET'))) {\n      problems.push('LINE_PAYMENT_MODE=connect : STRIPE_SECRET_KEY et STRIPE_CONNECT_WEBHOOK_SECRET requis');\n    }",
  ],
]);
console.log('ok');
