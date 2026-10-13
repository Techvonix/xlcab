const fs = require('fs');
const f = 'C:/xlcab/xlcab_backend/src/payouts/trip-payouts.integration.spec.ts';
let s = fs.readFileSync(f, 'utf8');
const from = "    expect(await payouts.tick(new Date(Date.now() + 4 * MIN))).toMatchObject({ paid: 0 });\n    expect(await payouts.tick(new Date(Date.now() + 6 * MIN))).toMatchObject({ paid: 1 });";
if (!s.includes(from)) throw new Error('motif');
s = s.replace(from, "    // Reprise 5 minutes après l'échec (mesuré depuis l'échec, pas depuis l'horloge du test).\n    const retryAt = payoutOf(tripId).nextAttemptAt.getTime();\n    expect(await payouts.tick(new Date(retryAt - MIN))).toMatchObject({ paid: 0 });\n    expect(await payouts.tick(new Date(retryAt + MIN))).toMatchObject({ paid: 1 });");
fs.writeFileSync(f, s);
console.log('ok');
