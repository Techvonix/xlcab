import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDateTime, formatEuros } from '@/lib/format';
import type { AdminBonus, AdminPayout, PayoutStatus } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Libellé d'un statut (accesseur : la langue est fixée au chargement). */
function statusLabel(status: PayoutStatus): string {
  switch (status) {
    case 'paid':
      return t('rvStatutVerse');
    case 'blocked':
      return t('rvStatutBloque');
    case 'failed':
      return t('rvStatutEchec');
    case 'withheld':
      return t('rvStatutRetenu');
    case 'void':
      return t('rvStatutNul');
    case 'draft':
    case 'pending':
      return t('rvStatutEnCours');
  }
}

/** Un reversement non parti peut être relancé à la main. */
const retryable = (status: PayoutStatus) => status === 'pending' || status === 'blocked' || status === 'failed';

/**
 * Reversements aux opérateurs (Stripe Connect) : part versée à celui qui a
 * assuré un trajet de ligne ou de bourse payé en ligne. Par défaut, seuls
 * ceux qui ne sont pas encore partis sont listés, les plus anciens d'abord.
 */
export function PayoutsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const filterId = useId();

  const { data, isPending, error: loadError } = useQuery({ queryKey: ['payouts', status], queryFn: () => api.payouts(status || undefined) });
  const retry = useMutation({
    mutationFn: (id: string) => api.retryPayout(id),
    onSuccess: (res) => {
      setError(null);
      setDone(res.status === 'paid' ? t('rvRelanceVersee') : t('rvRelanceToujoursEnAttente', { status: statusLabel(res.status) }));
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
    },
    onError: (e, id) => {
      setDone(null);
      setError({ id, message: e.message });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('rvReversements')}</h1>
      <p className="text-muted">{t('rvIntro')}</p>

      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">{t('statut')}</label>
        <select id={filterId} value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3">
          <option value="">{t('rvATraiter')}</option>
          <option value="failed">{t('rvStatutEchec')}</option>
          <option value="blocked">{t('rvStatutBloque')}</option>
          <option value="pending">{t('rvStatutEnCours')}</option>
          <option value="paid">{t('rvStatutVerse')}</option>
          <option value="withheld">{t('rvStatutRetenu')}</option>
        </select>
      </div>

      {/* Résultat d'une relance : annoncé aux lecteurs d'écran. */}
      <p role="status" className={done ? 'font-semibold' : 'sr-only'}>{done ?? ''}</p>
      {isPending && <p role="status">{t('chargement')}</p>}
      {loadError && <Alert>{loadError.message}</Alert>}
      {data?.length === 0 && <Card>{status ? t('rvAucunPourCeStatut') : t('rvRienATraiter')}</Card>}

      <ul className="flex flex-col gap-3">
        {data?.map((p: AdminPayout) => (
          <li key={p.id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">
                  {p.driverName ?? '—'} · <span className="tabular">{formatEuros(p.amountCents)}</span>{' '}
                  <span className="font-normal text-muted">· {statusLabel(p.status)}</span>
                </p>
                {/* Signal en texte, pas seulement en couleur. */}
                {p.needsAttention && <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">{t('rvInterventionRequise')}</span>}
              </div>
              <dl className="mt-2 grid gap-1">
                <div className="flex justify-between gap-4"><dt>{t('rvEmail')}</dt><dd>{p.driverEmail ?? '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt>{t('course')}</dt><dd className="text-sm">{p.tripId}</dd></div>
                <div className="flex justify-between gap-4"><dt>{t('rvCreeLe')}</dt><dd className="tabular">{formatDateTime(p.createdAt)}</dd></div>
                {p.withheldCents > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt>{t('rvRetenue')}</dt>
                    <dd className="tabular">{t('rvRetenueDetail', { gross: formatEuros(p.grossCents), withheld: formatEuros(p.withheldCents) })}</dd>
                  </div>
                )}
                {p.paidAt && <div className="flex justify-between gap-4"><dt>{t('rvVerseLe')}</dt><dd className="tabular">{formatDateTime(p.paidAt)}</dd></div>}
                {p.status === 'failed' && (
                  <div className="flex justify-between gap-4"><dt>{t('rvEssais')}</dt><dd className="tabular">{p.attempts}</dd></div>
                )}
                {p.status === 'failed' && p.nextAttemptAt && (
                  <div className="flex justify-between gap-4"><dt>{t('rvProchainEssai')}</dt><dd className="tabular">{formatDateTime(p.nextAttemptAt)}</dd></div>
                )}
              </dl>
              {p.status === 'blocked' && <p className="mt-2 text-muted">{t('rvBloqueExplication')}</p>}
              {p.lastError && p.status === 'failed' && (
                <p className="mt-2 text-sm text-muted">{t('rvDerniereErreur', { error: p.lastError })}</p>
              )}
              {error?.id === p.id && <Alert>{error.message}</Alert>}
              {retryable(p.status) && (
                <Button variant="outline" size="sm" className="mt-3" disabled={retry.isPending} onClick={() => retry.mutate(p.id)}>
                  {t('rvRelancer')}<span className="sr-only"> ({p.driverName ?? p.tripId})</span>
                </Button>
              )}
            </Card>
          </li>
        ))}
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
}
