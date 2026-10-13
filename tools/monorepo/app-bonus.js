// Bonus de reprise : affichage dans l'appli chauffeur et dans l'admin.
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

// ── Appli chauffeur ─────────────────────────────────────────────────────
edit('packages/core/lib/models/payouts.dart', [
  [
    'class PayoutSummary {\n  const PayoutSummary({required this.paidCents, required this.pendingCents, required this.withheldCents, required this.items});',
    `/// Bonus de reprise : versé au chauffeur de secours qui a sauvé un départ,
/// une fois la pénalité du chauffeur remplacé recouvrée.
class RescueBonus {
  const RescueBonus({required this.id, required this.amountCents, required this.status, required this.createdAt, this.paidAt});

  final String id;
  final int amountCents;
  final PayoutStatus status;
  final DateTime createdAt;
  final DateTime? paidAt;

  static RescueBonus? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    return RescueBonus(
      id: json['id'] as String,
      amountCents: _int(json['amountCents']) ?? 0,
      status: PayoutStatus.fromApi(_str(json['status'])),
      createdAt: _date(json['createdAt']) ?? DateTime.now(),
      paidAt: _date(json['paidAt']),
    );
  }
}

class PayoutSummary {
  const PayoutSummary({required this.paidCents, required this.pendingCents, required this.withheldCents, required this.items, this.bonuses = const []});`,
  ],
  ['  final List<Payout> items;\n\n  factory PayoutSummary.fromJson', '  final List<Payout> items;\n  final List<RescueBonus> bonuses;\n\n  factory PayoutSummary.fromJson'],
  [
    "      items: (json['items'] as List).map(Payout.fromJson).whereType<Payout>().toList(),",
    "      items: (json['items'] as List).map(Payout.fromJson).whereType<Payout>().toList(),\n      bonuses: json['bonuses'] is List ? (json['bonuses'] as List).map(RescueBonus.fromJson).whereType<RescueBonus>().toList() : const [],",
  ],
]);

edit('apps/driver/lib/screens/operator/payouts_screen.dart', [
  [
    '      for (final p in s.items) _PayoutTile(payout: p, locale: locale),\n    ];',
    `      for (final p in s.items) _PayoutTile(payout: p, locale: locale),
      if (s.bonuses.isNotEmpty) ...[
        SectionTitle(l10n.payBonus),
        Text(l10n.payBonusAide, style: AppTypography.caption.copyWith(color: muted)),
        const SizedBox(height: AppSpacing.sm),
        for (final b in s.bonuses)
          OpCard(
            highlight: b.status == PayoutStatus.blocked,
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(formatTripDate(b.createdAt, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface)),
                  const SizedBox(height: AppSpacing.xs),
                  StatusPill(label: b.status == PayoutStatus.pending ? l10n.payBonusEnAttente : payoutStatusLabel(b.status)),
                ]),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(formatPrice(b.amountCents, locale: locale), style: AppTypography.bodyBold.copyWith(color: onSurface)),
            ]),
          ),
      ],
    ];`,
  ],
]);

// ── Admin ───────────────────────────────────────────────────────────────
edit('xlcab_admin/src/lib/types.ts', [
  [
    '/** GET /admin/payouts : reversement dû à un opérateur pour une course terminée. */',
    "/** GET /admin/payouts/bonuses : bonus de reprise d'un chauffeur de secours. */\nexport interface AdminBonus {\n  id: string;\n  driverId: string;\n  driverName: string | null;\n  departureId: string;\n  amountCents: number;\n  status: 'pending' | 'paid' | 'blocked' | 'failed';\n  attempts: number;\n  lastError: string | null;\n  createdAt: string;\n  paidAt: string | null;\n  /** Recouvré sur la pénalité qui finance ce bonus. */\n  penaltyCollectedCents: number;\n  penaltyCents: number;\n  needsAttention: boolean;\n}\n\n/** GET /admin/payouts : reversement dû à un opérateur pour une course terminée. */",
  ],
]);
edit('xlcab_admin/src/lib/api.ts', [
  ['AdminPayout, PayoutStatus }', 'AdminPayout, AdminBonus, PayoutStatus }'],
  [
    "  retryPayout: (id: string) =>",
    "  bonuses: () => apiJson<AdminBonus[]>('/api/v1/admin/payouts/bonuses'),\n  retryBonus: (id: string) => apiJson<{ id: string; status: AdminBonus['status'] }>(`/api/v1/admin/payouts/bonuses/${encodeURIComponent(id)}/retry`, { method: 'POST' }),\n  retryPayout: (id: string) =>",
  ],
]);
edit('xlcab_admin/src/features/payouts/PayoutsPage.tsx', [
  ["import type { AdminPayout, PayoutStatus } from '@/lib/types';", "import type { AdminBonus, AdminPayout, PayoutStatus } from '@/lib/types';"],
  [
    '        ))}\n      </ul>\n    </div>\n  );\n}',
    `        ))}
      </ul>

      <BonusesSection />
    </div>
  );
}

/**
 * Bonus de reprise (160 €) des chauffeurs de secours : virés quand la
 * pénalité du chauffeur remplacé est recouvrée à hauteur du bonus.
 */
function BonusesSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const { data, isPending, error: loadError } = useQuery({ queryKey: ['bonuses'], queryFn: () => api.bonuses() });
  const retry = useMutation({
    mutationFn: (id: string) => api.retryBonus(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['bonuses'] });
    },
    onError: (e, id) => setError({ id, message: e.message }),
  });
  const label = (b: AdminBonus) => {
    if (b.status === 'paid') return t('rvStatutVerse');
    if (b.status === 'blocked') return t('rvStatutBloque');
    if (b.status === 'failed') return t('rvStatutEchec');
    return b.penaltyCollectedCents >= Math.min(b.amountCents, b.penaltyCents) ? t('rvStatutEnCours') : t('rvBonusEnAttentePenalite');
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="bonus-titre">
      <h2 id="bonus-titre" className="text-xl font-bold">{t('rvBonus')}</h2>
      <p className="text-muted">{t('rvBonusIntro')}</p>
      {isPending && <p role="status">{t('chargement')}</p>}
      {loadError && <Alert>{loadError.message}</Alert>}
      {data?.length === 0 && <p>{t('rvAucunBonus')}</p>}
      <ul className="flex flex-col gap-3">
        {data?.map((b) => (
          <li key={b.id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">
                  {b.driverName ?? '—'} · <span className="tabular">{formatEuros(b.amountCents)}</span>{' '}
                  <span className="font-normal text-muted">· {label(b)}</span>
                </p>
                {b.needsAttention && <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">{t('rvInterventionRequise')}</span>}
              </div>
              <p className="tabular text-muted">
                {t('rvPenaliteRecouvree', { collected: formatEuros(b.penaltyCollectedCents), total: formatEuros(b.penaltyCents) })}
              </p>
              {b.paidAt && <p className="tabular text-muted">{t('rvVerseLe')} {formatDateTime(b.paidAt)}</p>}
              {b.lastError && b.status === 'failed' && <p className="mt-2 text-sm text-muted">{t('rvDerniereErreur', { error: b.lastError })}</p>}
              {error?.id === b.id && <Alert>{error.message}</Alert>}
              {(b.status === 'failed' || b.status === 'blocked') && (
                <Button variant="outline" size="sm" className="mt-3" disabled={retry.isPending} onClick={() => retry.mutate(b.id)}>
                  {t('rvRelancerLeBonus')}<span className="sr-only"> ({b.driverName ?? b.id})</span>
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}`,
  ],
]);
const keys = {
  rvBonus: ['Bonus de reprise', 'Rescue bonuses'],
  rvBonusIntro: [
    'Versé au chauffeur de secours qui a sauvé un départ, dès que la pénalité du chauffeur remplacé est recouvrée à hauteur du bonus.',
    'Paid to the backup driver who saved a departure, as soon as the replaced driver’s penalty has been recovered up to the bonus amount.',
  ],
  rvAucunBonus: ['Aucun bonus de reprise.', 'No rescue bonuses.'],
  rvBonusEnAttentePenalite: ['En attente du recouvrement de la pénalité', 'Waiting for the penalty to be recovered'],
  rvRelancerLeBonus: ['Relancer le virement du bonus', 'Retry the bonus transfer'],
};
for (const [lang, index] of [['fr', 0], ['en', 1]]) {
  const f = R + `xlcab_admin/src/lib/i18n/${lang}.ts`;
  let s = fs.readFileSync(f, 'utf8');
  const lines = Object.entries(keys).map(([k, v]) => `  ${k}: ${JSON.stringify(v[index])},`).join('\n');
  const end = s.lastIndexOf('\n};');
  s = s.slice(0, end) + '\n' + lines + s.slice(end);
  fs.writeFileSync(f, s);
}

// Test admin : la page appelle aussi les bonus.
edit('xlcab_admin/src/features/payouts.test.tsx', [
  ['  return { ...actual, api: { payouts: vi.fn(), retryPayout: vi.fn() } };', '  return { ...actual, api: { payouts: vi.fn(), retryPayout: vi.fn(), bonuses: vi.fn(), retryBonus: vi.fn() } };'],
  ['beforeEach(() => {\n  vi.clearAllMocks();\n});', 'beforeEach(() => {\n  vi.clearAllMocks();\n  m.bonuses.mockResolvedValue([]);\n});'],
  [
    "  it('statut sans résultat : message distinct', async () => {",
    `  it('bonus de reprise : en attente du recouvrement, puis relance d’un virement en échec', async () => {
    m.payouts.mockResolvedValue([]);
    const bonus = {
      id: 'b1', driverId: 'k1', driverName: 'Karim Benali', departureId: 'dep1', amountCents: 16000, status: 'pending', attempts: 0, lastError: null,
      createdAt: '2026-10-12T05:30:00.000Z', paidAt: null, penaltyCollectedCents: 4500, penaltyCents: 26000, needsAttention: false,
    };
    m.bonuses.mockResolvedValue([bonus, { ...bonus, id: 'b2', driverName: 'Samir Kaci', status: 'failed', attempts: 2, lastError: 'Solde insuffisant', penaltyCollectedCents: 26000 }]);
    m.retryBonus.mockResolvedValue({ id: 'b2', status: 'paid' });
    const { container } = renderWithProviders(<PayoutsPage />);

    const waiting = (await screen.findByText(/Karim Benali ·/)).closest('li')!;
    expect(within(waiting).getByText(/En attente du recouvrement de la pénalité/)).toBeInTheDocument();
    expect(within(waiting).getByText('Recouvré sur les reversements : 45,00 € sur 260,00 €')).toBeInTheDocument();
    // Pas de relance tant que la pénalité n'est pas recouvrée.
    expect(within(waiting).queryByRole('button')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    const failed = screen.getByText(/Samir Kaci ·/).closest('li')!;
    expect(within(failed).getByText('Dernière erreur : Solde insuffisant')).toBeInTheDocument();
    await userEvent.click(within(failed).getByRole('button', { name: /Relancer le virement du bonus/ }));
    await waitFor(() => expect(m.retryBonus).toHaveBeenCalledWith('b2'));
  });

  it('statut sans résultat : message distinct', async () => {`,
  ],
]);
console.log('ok');
