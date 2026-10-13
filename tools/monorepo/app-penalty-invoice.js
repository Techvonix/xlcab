// Facture de pénalité : affichage dans l'admin (avec enregistrement d'un paiement) et dans l'appli chauffeur.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

// ── Admin ───────────────────────────────────────────────────────────────
edit('xlcab_admin/src/lib/types.ts', [
  [
    "  /** Part déjà retenue sur les reversements du chauffeur. */\n  collectedCents?: number;",
    "  /** Part déjà recouvrée (retenues sur reversements et paiements enregistrés). */\n  collectedCents?: number;\n  /** Facture du solde, émise quand les reversements n'ont pas suffi. */\n  invoice?: { id: string; number: string; totalCents: number; dueDate: string | null } | null;",
  ],
]);
edit('xlcab_admin/src/lib/api.ts', [
  [
    "  marketRequests: (q: { status?: string; page?: number }) =>",
    "  /** Paiement d'une pénalité reçu par virement (facture de pénalité). */\n  recordPenaltyPayment: (id: string, amountCents: number, reference: string) =>\n    apiJson<{ id: string; collectedCents: number; remainingCents: number; settled: boolean }>(`/api/v1/admin/penalties/${encodeURIComponent(id)}/payment`, {\n      method: 'POST', body: { amountCents, reference },\n    }),\n  marketRequests: (q: { status?: string; page?: number }) =>",
  ],
]);
edit('xlcab_admin/src/features/market/MarketPage.tsx', [
  [
    "              {p.status === 'applied' && (\n                <p className=\"tabular text-muted\">{t('rvPenaliteRecouvree', { collected: formatEuros(p.collectedCents ?? 0), total: formatEuros(p.amountCents) })}</p>\n              )}",
    "              {p.status === 'applied' && (\n                <p className=\"tabular text-muted\">{t('rvPenaliteRecouvree', { collected: formatEuros(p.collectedCents ?? 0), total: formatEuros(p.amountCents) })}</p>\n              )}\n              {p.invoice && (\n                <p className=\"tabular text-muted\">\n                  {t('boFacturePenalite', { number: p.invoice.number, amount: formatEuros(p.invoice.totalCents), date: formatDateTime(p.invoice.dueDate) })}\n                </p>\n              )}\n              {p.status === 'applied' && (p.collectedCents ?? 0) < p.amountCents && (\n                <PenaltyPayment penaltyId={p.id} remainingCents={p.amountCents - (p.collectedCents ?? 0)} />\n              )}",
  ],
  [
    'function PenaltiesSection() {',
    `/** Enregistre un paiement reçu par virement pour une pénalité (jamais plus que le solde). */
function PenaltyPayment({ penaltyId, remainingCents }: { penaltyId: string; remainingCents: number }) {
  const queryClient = useQueryClient();
  const amountId = useId();
  const referenceId = useId();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  // « 115,00 » ou « 115.00 » → centimes ; NaN si ce n'est pas un montant.
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = Number.isFinite(cents) && cents >= 1 && cents <= remainingCents && reference.trim().length >= 3;
  const record = useMutation({
    mutationFn: () => api.recordPenaltyPayment(penaltyId, cents, reference.trim()),
    onSuccess: () => {
      setError(null);
      setAmount('');
      setReference('');
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
      queryClient.invalidateQueries({ queryKey: ['bonuses'] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="font-semibold">{t('boPaiementRecu', { remaining: formatEuros(remainingCents) })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={amountId}>{t('boMontantRecu')}</label>
          <input
            id={amountId}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-11 w-36 rounded-input border border-line bg-white px-3 focus:border-2 focus:border-bleu focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={referenceId}>{t('boReferenceDuVirement')}</label>
          <input
            id={referenceId}
            value={reference}
            maxLength={120}
            onChange={(e) => setReference(e.target.value)}
            className="h-11 w-64 rounded-input border border-line bg-white px-3 focus:border-2 focus:border-bleu focus:outline-none"
          />
        </div>
        <Button variant="outline" disabled={!valid || record.isPending} onClick={() => record.mutate()}>
          {t('boEnregistrerLePaiement')}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function PenaltiesSection() {`,
  ],
]);
const keys = {
  boFacturePenalite: ['Facture {number} de {amount}, à régler avant le {date}', 'Invoice {number} for {amount}, due by {date}'],
  boPaiementRecu: ['Paiement reçu par virement (solde dû : {remaining})', 'Payment received by bank transfer (balance due: {remaining})'],
  boMontantRecu: ['Montant reçu (€)', 'Amount received (€)'],
  boReferenceDuVirement: ['Référence du virement', 'Transfer reference'],
  boEnregistrerLePaiement: ['Enregistrer le paiement', 'Record the payment'],
};
for (const [lang, index] of [['fr', 0], ['en', 1]]) {
  const f = R + `xlcab_admin/src/lib/i18n/${lang}.ts`;
  let s = fs.readFileSync(f, 'utf8');
  const lines = Object.entries(keys).map(([k, v]) => `  ${k}: ${JSON.stringify(v[index])},`).join('\n');
  const end = s.lastIndexOf('\n};');
  s = s.slice(0, end) + '\n' + lines + s.slice(end);
  fs.writeFileSync(f, s);
}

// Test admin de la bourse : paiement d'une pénalité.
edit('xlcab_admin/src/features/market.test.tsx', [
  ['cancellations: vi.fn(), reviewCancellation: vi.fn(), penalties: vi.fn(), decidePenalty: vi.fn(), marketRequests: vi.fn(),', 'cancellations: vi.fn(), reviewCancellation: vi.fn(), penalties: vi.fn(), decidePenalty: vi.fn(), marketRequests: vi.fn(), recordPenaltyPayment: vi.fn(),'],
]);
{
  const f = R + 'xlcab_admin/src/features/market.test.tsx';
  let s = fs.readFileSync(f, 'utf8');
  const end = s.lastIndexOf('\n});');
  s = s.slice(0, end) + `

  it('pénalité appliquée : facture du solde affichée, paiement par virement enregistré (jamais plus que le solde)', async () => {
    m.penalties.mockResolvedValue([{
      id: 'pen1', driverId: 'd1', driverName: 'Djamel Haddad', amountCents: 26000, status: 'applied', contestUntil: '2026-09-20T00:00:00.000Z', contestReason: null,
      collectedCents: 4500, invoice: { id: 'inv1', number: 'FA-2026-000042', totalCents: 21500, dueDate: '2026-11-20T00:00:00.000Z' }, createdAt: '2026-09-13T00:00:00.000Z',
    }]);
    m.recordPenaltyPayment.mockResolvedValue({ id: 'pen1', collectedCents: 14500, remainingCents: 11500, settled: false });
    const { container } = renderWithProviders(<MarketPage />);

    expect(await screen.findByText(/Facture FA-2026-000042 de 215,00 €/)).toBeInTheDocument();
    expect(screen.getByText('Recouvré sur les reversements : 45,00 € sur 260,00 €')).toBeInTheDocument();
    const record = screen.getByRole('button', { name: 'Enregistrer le paiement' });
    expect(record).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();

    // Plus que le solde dû (215 €) : refusé avant même l'envoi.
    await userEvent.type(screen.getByLabelText('Montant reçu (€)'), '300');
    await userEvent.type(screen.getByLabelText('Référence du virement'), 'VIR 123');
    expect(record).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Montant reçu (€)'));
    await userEvent.type(screen.getByLabelText('Montant reçu (€)'), '100,00');
    await userEvent.click(record);
    await waitFor(() => expect(m.recordPenaltyPayment).toHaveBeenCalledWith('pen1', 10000, 'VIR 123'));
  });
});
`;
  fs.writeFileSync(f, s);
}

// ── Appli chauffeur ─────────────────────────────────────────────────────
edit('packages/core/lib/models/operator.dart', [
  [
    '  const DriverPenalty({required this.id, required this.amountCents, required this.status, required this.contestUntil, this.collectedCents = 0});',
    '  const DriverPenalty({\n    required this.id,\n    required this.amountCents,\n    required this.status,\n    required this.contestUntil,\n    this.collectedCents = 0,\n    this.invoiceNumber,\n    this.invoiceCents,\n    this.invoiceDueDate,\n  });',
  ],
  [
    "  /// Part déjà retenue sur les reversements du chauffeur.\n  final int collectedCents;\n}",
    "  /// Part déjà retenue sur les reversements du chauffeur.\n  final int collectedCents;\n\n  /// Facture du solde (émise si les reversements n'ont pas suffi en 30 jours).\n  final String? invoiceNumber;\n  final int? invoiceCents;\n  final DateTime? invoiceDueDate;\n}",
  ],
  [
    "              collectedCents: _int(p['collectedCents']) ?? 0,\n",
    "              collectedCents: _int(p['collectedCents']) ?? 0,\n              invoiceNumber: p['invoice'] is Map ? _str((p['invoice'] as Map)['number']) : null,\n              invoiceCents: p['invoice'] is Map ? _int((p['invoice'] as Map)['totalCents']) : null,\n              invoiceDueDate: p['invoice'] is Map ? _date((p['invoice'] as Map)['dueDate']) : null,\n",
  ],
]);
edit('apps/driver/lib/screens/operator/cancellations_screen.dart', [
  [
    "                    if (c.penalty!.collectedCents > 0)\n                      Text(l10n.payPenaliteRecouvree(formatPrice(c.penalty!.collectedCents, locale: locale)), style: AppTypography.caption),",
    "                    if (c.penalty!.collectedCents > 0)\n                      Text(l10n.payPenaliteRecouvree(formatPrice(c.penalty!.collectedCents, locale: locale)), style: AppTypography.caption),\n                    if (c.penalty!.invoiceNumber != null && c.penalty!.collectedCents < c.penalty!.amountCents)\n                      Text(\n                        l10n.payFacturePenalite(\n                          c.penalty!.invoiceNumber!,\n                          formatPrice(c.penalty!.amountCents - c.penalty!.collectedCents, locale: locale),\n                          c.penalty!.invoiceDueDate == null ? '—' : formatTripDate(c.penalty!.invoiceDueDate!, locale: locale),\n                        ),\n                        style: AppTypography.caption,\n                      ),",
  ],
]);
console.log('ok');
