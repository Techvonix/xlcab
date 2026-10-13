// Appli chauffeur : doubles de test du compte de versement.
const fs = require('fs');
const f = 'C:/xlcab/apps/driver/test/support/operator_fakes.dart';
let s = fs.readFileSync(f, 'utf8');
const anchor = "  @override\n  Future<void> contest(String penaltyId, String reason) async => _act('contest:$reason');\n}";
if (!s.includes(anchor)) throw new Error('ancre');
s = s.replace(anchor, () => `  @override
  Future<void> contest(String penaltyId, String reason) async => _act('contest:$reason');

  // ── Compte de versement et reversements ──
  PayoutAccount account = const PayoutAccount(required: false, state: PayoutAccountState.none);
  PayoutSummary summary = const PayoutSummary(paidCents: 0, pendingCents: 0, withheldCents: 0, items: []);
  ApiException? linkError;
  int accountReads = 0;

  @override
  Future<PayoutAccount> payoutAccount() async {
    accountReads++;
    return account;
  }

  @override
  Future<Uri> payoutOnboardingLink() async {
    if (linkError != null) throw linkError!;
    calls.add('onboardingLink');
    return Uri.parse('https://connect.stripe.test/setup/acct_1/1');
  }

  @override
  Future<Uri> payoutDashboardLink() async {
    if (linkError != null) throw linkError!;
    calls.add('dashboardLink');
    return Uri.parse('https://connect.stripe.test/express/acct_1');
  }

  @override
  Future<PayoutSummary> payouts() async => summary;
}`);
if (!s.includes("models/payouts.dart")) {
  s = s.replace("import 'package:xlcab_core/models/operator.dart';", "import 'package:xlcab_core/models/operator.dart';\nimport 'package:xlcab_core/models/payouts.dart';");
}
if (!s.includes("models/payouts.dart")) throw new Error('import');
fs.writeFileSync(f, s);
console.log('ok');
