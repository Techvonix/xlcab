// Admin : page « Reversements » (Stripe Connect) — route, menu, API, types, traductions.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_admin/src/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

edit('App.tsx', [
  ["const MarketPage = page(() => import('./features/market/MarketPage'), 'MarketPage');", "const MarketPage = page(() => import('./features/market/MarketPage'), 'MarketPage');\nconst PayoutsPage = page(() => import('./features/payouts/PayoutsPage'), 'PayoutsPage');"],
  ['          <Route path="bourse" element={<MarketPage />} />', '          <Route path="bourse" element={<MarketPage />} />\n          <Route path="reversements" element={<PayoutsPage />} />'],
]);

edit('components/AdminLayout.tsx', [
  ["import { BadgeCheck, BarChart3, Euro,", "import { BadgeCheck, Banknote, BarChart3, Euro,"],
  ["  { to: '/bourse', label: t('boBourseEtLignes'), icon: Store },", "  { to: '/bourse', label: t('boBourseEtLignes'), icon: Store },\n  { to: '/reversements', label: t('rvReversements'), icon: Banknote },"],
]);

edit('lib/api.ts', [
  ['AdminPenalty, AdminMarketRequest }', 'AdminPenalty, AdminMarketRequest, AdminPayout, PayoutStatus }'],
  [
    "  marketRequests: (q: { status?: string; page?: number }) => apiJson<Paged<AdminMarketRequest>>(`/api/v1/admin/market/requests${qs(q)}`),",
    "  marketRequests: (q: { status?: string; page?: number }) => apiJson<Paged<AdminMarketRequest>>(`/api/v1/admin/market/requests${qs(q)}`),\n  /** Reversements aux opérateurs ; sans statut : ceux qui ne sont pas encore partis. */\n  payouts: (status?: string) => apiJson<AdminPayout[]>(`/api/v1/admin/payouts${qs({ status })}`),\n  retryPayout: (id: string) => apiJson<{ id: string; status: PayoutStatus }>(`/api/v1/admin/payouts/${encodeURIComponent(id)}/retry`, { method: 'POST' }),",
  ],
]);

edit('lib/types.ts', [
  [
    "  status: 'pending' | 'contested' | 'applied' | 'cancelled';\n  contestUntil: string;\n  contestReason: string | null;\n  createdAt: string;\n}",
    "  status: 'pending' | 'contested' | 'applied' | 'cancelled';\n  contestUntil: string;\n  contestReason: string | null;\n  /** Part déjà retenue sur les reversements du chauffeur. */\n  collectedCents?: number;\n  createdAt: string;\n}\n\nexport type PayoutStatus = 'draft' | 'pending' | 'paid' | 'blocked' | 'failed' | 'withheld' | 'void';\n\n/** GET /admin/payouts : reversement dû à un opérateur pour une course terminée. */\nexport interface AdminPayout {\n  id: string;\n  tripId: string;\n  driverId: string;\n  driverName: string | null;\n  driverEmail: string | null;\n  /** Viré : revenu − retenue. */\n  amountCents: number;\n  grossCents: number;\n  withheldCents: number;\n  status: PayoutStatus;\n  attempts: number;\n  lastError: string | null;\n  nextAttemptAt: string | null;\n  createdAt: string;\n  paidAt: string | null;\n  /** Dix essais échoués : plus de reprise automatique. */\n  needsAttention: boolean;\n}",
  ],
]);

edit('features/market/MarketPage.tsx', [
  [
    "              <p className=\"text-muted\">{t('boContestableJusquAu', { date: formatDateTime(p.contestUntil) })}</p>",
    "              <p className=\"text-muted\">{t('boContestableJusquAu', { date: formatDateTime(p.contestUntil) })}</p>\n              {p.status === 'applied' && (\n                <p className=\"tabular text-muted\">{t('rvPenaliteRecouvree', { collected: formatEuros(p.collectedCents ?? 0), total: formatEuros(p.amountCents) })}</p>\n              )}",
  ],
]);

const keys = {
  rvReversements: ['Reversements', 'Payouts'],
  rvIntro: [
    'Part versée à l’opérateur après un trajet de ligne ou de bourse payé en ligne : prix hors taxes moins la commission, moins les pénalités retenues. Les reprises sont automatiques ; n’intervenez que sur un reversement marqué « Intervention requise ».',
    'Share paid to the operator after a line or marketplace trip paid online: price excluding tax minus the commission, minus any penalties withheld. Retries are automatic; only step in on a payout marked “Action required”.',
  ],
  rvATraiter: ['Pas encore versés', 'Not paid yet'],
  rvStatutVerse: ['Versé', 'Paid out'],
  rvStatutBloque: ['En attente du compte de versement', 'Waiting for the payout account'],
  rvStatutEchec: ['Échec du virement', 'Transfer failed'],
  rvStatutRetenu: ['Entièrement retenu (pénalité)', 'Fully withheld (penalty)'],
  rvStatutNul: ['Rien à verser', 'Nothing to pay'],
  rvStatutEnCours: ['Virement en cours', 'Transfer in progress'],
  rvInterventionRequise: ['Intervention requise', 'Action required'],
  rvRienATraiter: ['Tous les reversements sont partis.', 'All payouts have been sent.'],
  rvAucunPourCeStatut: ['Aucun reversement pour ce statut.', 'No payouts with this status.'],
  rvEmail: ['E-mail', 'Email'],
  rvCreeLe: ['Trajet terminé le', 'Trip completed on'],
  rvVerseLe: ['Versé le', 'Paid on'],
  rvRetenue: ['Pénalité retenue', 'Penalty withheld'],
  rvRetenueDetail: ['{withheld} sur un revenu de {gross}', '{withheld} out of {gross} earned'],
  rvEssais: ['Essais', 'Attempts'],
  rvProchainEssai: ['Prochain essai automatique', 'Next automatic attempt'],
  rvBloqueExplication: [
    'L’opérateur n’a pas de compte de versement validé. Il a été prévenu ; le virement partira seul dès que son compte sera en règle.',
    'The operator has no approved payout account. They have been notified; the transfer will go out on its own once the account is in order.',
  ],
  rvDerniereErreur: ['Dernière erreur : {error}', 'Last error: {error}'],
  rvRelancer: ['Relancer le virement', 'Retry the transfer'],
  rvRelanceVersee: ['Virement effectué.', 'Transfer sent.'],
  rvRelanceToujoursEnAttente: ['Le virement n’est pas parti : {status}.', 'The transfer did not go out: {status}.'],
  rvPenaliteRecouvree: ['Recouvré sur les reversements : {collected} sur {total}', 'Recovered from payouts: {collected} of {total}'],
};
for (const [lang, index] of [['fr', 0], ['en', 1]]) {
  const f = R + `lib/i18n/${lang}.ts`;
  let s = fs.readFileSync(f, 'utf8');
  const lines = Object.entries(keys).map(([k, v]) => `  ${k}: ${JSON.stringify(v[index])},`).join('\n');
  const end = s.indexOf('\n};');
  if (end < 0) throw new Error(`${lang}.ts : fin introuvable`);
  s = s.slice(0, end) + '\n' + lines + s.slice(end);
  fs.writeFileSync(f, s);
}
console.log('ok');
