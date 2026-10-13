// Stripe Connect, étape 1 : compte de versement exigé pour proposer sur la bourse.
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
edit('src/market/market.module.ts', [
  ["import { OperatorsModule } from '../operators/operators.module';", "import { OperatorsModule } from '../operators/operators.module';\nimport { PayoutsModule } from '../payouts/payout-accounts';"],
  ['imports: [OperatorsModule, MatchingModule, TwoFactorModule]', 'imports: [OperatorsModule, MatchingModule, TwoFactorModule, PayoutsModule]'],
]);
edit('src/market/market.service.ts', [
  ['    private audit: AuditService,\n  ) {}', '    private audit: AuditService,\n    private payouts: PayoutAccountsService,\n  ) {}'],
  [
    "    await this.assertOperator(operatorId);\n    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === dto.vehicleId);",
    "    await this.assertOperator(operatorId);\n    // Paiement en ligne activé : pas de proposition sans compte de versement validé.\n    await this.payouts.assertReady(operatorId);\n    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === dto.vehicleId);",
  ],
  [
    "    await this.assertOperator(operatorId);\n    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === offer.vehicleId);",
    "    await this.assertOperator(operatorId);\n    await this.payouts.assertReady(operatorId);\n    const vehicle = (await this.eligibleVehiclesOf(operatorId)).find((v) => v.id === offer.vehicleId);",
  ],
]);
let s = fs.readFileSync(R + 'src/market/market.service.ts', 'utf8');
s = s.replace("import { linePaymentMode } from '../line-bookings/line-bookings.service';", "import { linePaymentMode } from '../payouts/payment-mode';\nimport { PayoutAccountsService } from '../payouts/payout-accounts';");
fs.writeFileSync(R + 'src/market/market.service.ts', s);
console.log('ok');
