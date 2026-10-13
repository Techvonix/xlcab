import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDateTime, formatEuros } from '@/lib/format';
import type { AdminCancellation, AdminPenalty, AtRiskDeparture } from '@/lib/types';
import { t } from '@/lib/i18n';

const STAGE: Record<string, string> = { backup2: t('boEtapeReserve2'), backup3: t('boEtapeReserve3'), open: t('boEtapeAlerteGenerale') };
const OFFER: Record<string, string> = {
  pending: t('boOffreEnAttente'), accepted: t('boOffreAcceptee'), declined: t('boOffreRefusee'), expired: t('boOffreSansReponse'), cancelled: t('boOffreAnnulee'),
};
const TRIGGER: Record<string, string> = {
  driver_cancel: t('boMotifAnnulation'), not_ready: t('boMotifPasEnRoute'), no_position: t('boMotifSansPosition'),
};
const CANCELLATION: Record<AdminCancellation['status'], string> = {
  counted: t('boAnnulationComptee'), not_counted: t('boAnnulationNonComptee'), justification_pending: t('boJustificatifAExaminer'),
  justified: t('boForceMajeure'), waived: t('boAnnulationLevee'),
};
const PENALTY: Record<AdminPenalty['status'], string> = {
  pending: t('boPenaliteEnDelai'), contested: t('boPenaliteContestee'), applied: t('boPenaliteAppliquee'), cancelled: t('boPenaliteAnnulee'),
};
const REQUEST: Record<string, string> = {
  draft: t('boDemandeBrouillon'), published: t('boDemandePubliee'), offers_received: t('boDemandePropositions'), accepted: t('boDemandeAConfirmer'),
  confirmed: t('boDemandeConfirmee'), cancelled: t('boDemandeAnnulee'), expired: t('boDemandeExpiree'),
};

/**
 * Bourse de transport et lignes régulières, vues par l'équipe XLCAB :
 * départs en danger (protocole d'annulation chauffeur), justificatifs et
 * pénalités à trancher, demandes sans réponse.
 */
export function MarketPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">{t('boBourseEtLignes')}</h1>
      <AtRiskSection />
      <CancellationsSection />
      <PenaltiesSection />
      <RequestsSection />
    </div>
  );
}

// ── Départs en danger ─────────────────────────────────────────────────

function AtRiskSection() {
  const { data, isPending, error } = useQuery({ queryKey: ['at-risk'], queryFn: api.atRiskDepartures, refetchInterval: 30_000 });
  return (
    <section className="flex flex-col gap-3" aria-labelledby="danger-titre">
      <h2 id="danger-titre" className="text-xl font-bold">{t('boDepartsEnDanger')}</h2>
      <p className="text-muted">{t('boDepartsEnDangerIntro')}</p>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.length === 0 && <Alert tone="success">{t('boAucunDepartEnDanger')}</Alert>}
      <ul className="flex flex-col gap-3">
        {data?.map((d) => <AtRiskCard key={d.departureId} departure={d} />)}
      </ul>
    </section>
  );
}

function AtRiskCard({ departure: d }: { departure: AtRiskDeparture }) {
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = useQuery({ queryKey: ['candidates', d.departureId], queryFn: () => api.rescueCandidates(d.departureId), enabled: choosing });
  const assign = useMutation({
    mutationFn: (c: { driverId: string; vehicleId: string }) => api.assignDeparture(d.departureId, c.driverId, c.vehicleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['at-risk'] }),
    onError: (e) => setError(e.message),
  });
  const failed = d.rescueStatus === 'failed';

  return (
    <li>
      <Card className={failed ? 'border-2 border-line' : 'border-2 border-error'}>
        <p className="text-lg font-bold">
          {d.origin} → {d.destination} <span className="font-normal text-muted">· {formatDateTime(d.departureAt)}</span>
        </p>
        <dl className="mt-2 grid gap-1">
          <div className="flex justify-between gap-4"><dt>{t('boEtat')}</dt><dd className="font-semibold">{failed ? t('boSecoursEchoue') : t('boRechercheDUnSecours')}</dd></div>
          {!failed && <div className="flex justify-between gap-4"><dt>{t('boEtape')}</dt><dd>{d.rescueStage ? STAGE[d.rescueStage] ?? d.rescueStage : '—'}</dd></div>}
          <div className="flex justify-between gap-4"><dt>{t('boPassagers')}</dt><dd className="tabular">{d.passengers}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boChauffeurDefaillant')}</dt><dd>{d.failedDriverName ?? '—'}</dd></div>
        </dl>
        {d.offers.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {d.offers.map((o) => (
              <li key={`${o.driverId}-${o.stage}`}>{o.name ?? '—'} — {OFFER[o.status] ?? o.status}</li>
            ))}
          </ul>
        )}
        {error && <Alert>{error}</Alert>}
        {!failed && !choosing && (
          <Button className="mt-3" size="sm" onClick={() => setChoosing(true)}>
            {t('boAffecterUnChauffeur')}
          </Button>
        )}
        {choosing && (
          <div className="mt-3 flex flex-col gap-2">
            {candidates.isPending && <p role="status">{t('chargement')}</p>}
            {candidates.error && <Alert>{candidates.error.message}</Alert>}
            {candidates.data?.length === 0 && <p>{t('boAucunChauffeurDisponible')}</p>}
            {candidates.data?.map((c) => (
              <div key={c.driverId} className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-line p-2">
                <span>
                  <span className="font-semibold">{c.name ?? '—'}</span> · {c.vehicle ?? '—'} ({t('boPlaces', { count: c.capacity ?? 0 })})
                  {c.phone && <> · <a href={`tel:${c.phone}`} className="font-semibold text-primary underline">{c.phone}</a></>}
                </span>
                <Button size="sm" disabled={assign.isPending} onClick={() => assign.mutate(c)}>
                  {t('boAffecter')}<span className="sr-only"> {c.name}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </li>
  );
}

// ── Annulations ───────────────────────────────────────────────────────

/** Motif obligatoire (5 caractères) puis une des actions proposées. */
function Decision({ label, actions, pending, error }: {
  label: string;
  actions: { label: string; danger?: boolean; run: (reason: string) => void }[];
  pending: boolean;
  error: string | null;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= 5 && !pending;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <label htmlFor={id} className="font-semibold">{label}</label>
      <textarea
        id={id}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-input border border-line p-3 focus:border-2 focus:border-bleu focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.danger ? 'danger' : 'outline'} disabled={!ready} onClick={() => a.run(reason.trim())}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CancellationsSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('justification_pending');
  const [error, setError] = useState<string | null>(null);
  const filterId = useId();
  const { data, isPending, error: loadError } = useQuery({ queryKey: ['cancellations', status], queryFn: () => api.cancellations(status || undefined) });
  const review = useMutation({
    mutationFn: (v: { id: string; status: 'counted' | 'justified' | 'waived'; reason: string }) => api.reviewCancellation(v.id, v.status, v.reason),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cancellations'] });
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="annulations-titre">
      <h2 id="annulations-titre" className="text-xl font-bold">{t('boAnnulationsDesChauffeurs')}</h2>
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">{t('statut')}</label>
        <select id={filterId} value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3">
          <option value="justification_pending">{t('boJustificatifAExaminer')}</option>
          <option value="counted">{t('boAnnulationComptee')}</option>
          <option value="justified">{t('boForceMajeure')}</option>
          <option value="">{t('tous')}</option>
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {loadError && <Alert>{loadError.message}</Alert>}
      {data?.length === 0 && <p>{t('boAucuneAnnulation')}</p>}
      <ul className="flex flex-col gap-3">
        {data?.map((c) => (
          <li key={c.id}>
            <Card>
              <p className="font-bold">
                {c.driverName ?? '—'} <span className="font-normal text-muted">· {formatDateTime(c.createdAt)} · {CANCELLATION[c.status]}</span>
              </p>
              <p>{TRIGGER[c.trigger] ?? c.trigger} — {t('boMinutesAvantLeDepart', { count: c.minutesBefore })}</p>
              {c.reason && <p className="text-muted">{t('boMotifDonne', { reason: c.reason })}</p>}
              {c.justification && <blockquote className="mt-2 border-l-4 border-line pl-3 italic">{c.justification}</blockquote>}
              {(c.status === 'justification_pending' || c.status === 'counted') && (
                <Decision
                  label={t('boMotifDeLaDecision')}
                  pending={review.isPending}
                  error={review.variables?.id === c.id ? error : null}
                  actions={[
                    { label: t('boReconnaitreLaForceMajeure'), run: (reason) => review.mutate({ id: c.id, status: 'justified', reason }) },
                    ...(c.status === 'justification_pending'
                      ? [{ label: t('boMaintenirLAnnulation'), danger: true, run: (reason: string) => review.mutate({ id: c.id, status: 'counted', reason }) }]
                      : []),
                  ]}
                />
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Pénalités ─────────────────────────────────────────────────────────

function PenaltiesSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('contested');
  const [error, setError] = useState<string | null>(null);
  const filterId = useId();
  const { data, isPending, error: loadError } = useQuery({ queryKey: ['penalties', status], queryFn: () => api.penalties(status || undefined) });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'uphold' | 'cancel'; reason: string }) => api.decidePenalty(v.id, v.decision, v.reason),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="penalites-titre">
      <h2 id="penalites-titre" className="text-xl font-bold">{t('boPenalites')}</h2>
      <p className="text-muted">{t('boPenalitesIntro')}</p>
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">{t('statut')}</label>
        <select id={filterId} value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3">
          <option value="contested">{t('boPenaliteContestee')}</option>
          <option value="pending">{t('boPenaliteEnDelai')}</option>
          <option value="applied">{t('boPenaliteAppliquee')}</option>
          <option value="">{t('tous')}</option>
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {loadError && <Alert>{loadError.message}</Alert>}
      {data?.length === 0 && <p>{t('boAucunePenalite')}</p>}
      <ul className="flex flex-col gap-3">
        {data?.map((p) => (
          <li key={p.id}>
            <Card>
              <p className="font-bold">
                {p.driverName ?? '—'} · <span className="tabular">{formatEuros(p.amountCents)}</span>{' '}
                <span className="font-normal text-muted">· {PENALTY[p.status]}</span>
              </p>
              <p className="text-muted">{t('boContestableJusquAu', { date: formatDateTime(p.contestUntil) })}</p>
              {p.status === 'applied' && (
                <p className="tabular text-muted">{t('rvPenaliteRecouvree', { collected: formatEuros(p.collectedCents ?? 0), total: formatEuros(p.amountCents) })}</p>
              )}
              {p.contestReason && <blockquote className="mt-2 border-l-4 border-line pl-3 italic">{p.contestReason}</blockquote>}
              {(p.status === 'contested' || p.status === 'pending') && (
                <Decision
                  label={t('boMotifDeLaDecision')}
                  pending={decide.isPending}
                  error={decide.variables?.id === p.id ? error : null}
                  actions={[
                    { label: t('boAnnulerLaPenalite'), run: (reason) => decide.mutate({ id: p.id, decision: 'cancel', reason }) },
                    { label: t('boMaintenirLaPenalite'), danger: true, run: (reason) => decide.mutate({ id: p.id, decision: 'uphold', reason }) },
                  ]}
                />
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Demandes de la bourse ─────────────────────────────────────────────

function RequestsSection() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const filterId = useId();
  const { data, isPending, error } = useQuery({ queryKey: ['market-requests', status, page], queryFn: () => api.marketRequests({ status: status || undefined, page }) });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="demandes-titre">
      <h2 id="demandes-titre" className="text-xl font-bold">{t('boDemandesDeLaBourse')}</h2>
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">{t('statut')}</label>
        <select
          id={filterId}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-input border border-line bg-white px-3"
        >
          <option value="">{t('tous')}</option>
          {['published', 'offers_received', 'accepted', 'confirmed', 'cancelled', 'expired'].map((s) => (
            <option key={s} value={s}>{REQUEST[s]}</option>
          ))}
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.items.length === 0 && <p>{t('boAucuneDemande')}</p>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">{t('boDemandesDeLaBourse')}</caption>
            <thead>
              <tr className="border-b border-line text-sm">
                <th scope="col" className="py-2 pr-3">{t('boTrajet')}</th>
                <th scope="col" className="py-2 pr-3">{t('boDepart')}</th>
                <th scope="col" className="py-2 pr-3">{t('boPassagers')}</th>
                <th scope="col" className="py-2 pr-3">{t('boClient')}</th>
                <th scope="col" className="py-2 pr-3">{t('boPropositions')}</th>
                <th scope="col" className="py-2">{t('statut')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="tabular border-b border-line">
                  <td className="py-2 pr-3">{r.originAddress} → {r.destinationAddress}</td>
                  <td className="py-2 pr-3">{formatDateTime(r.departureAt)}</td>
                  <td className="py-2 pr-3">{r.passengers}</td>
                  <td className="py-2 pr-3">{r.requesterEmail ?? '—'}</td>
                  <td className="py-2 pr-3">{r.offers}</td>
                  <td className="py-2">
                    {REQUEST[r.status] ?? r.status}
                    {/* Signal en texte, pas seulement en couleur. */}
                    {r.needsAttention && <span className="ml-2 rounded-full bg-surface px-2 text-sm font-semibold">{t('boASurveiller')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </section>
  );
}
