import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import type { AdminOperator } from '@/lib/types';
import { t } from '@/lib/i18n';

const STATUS: Record<AdminOperator['status'], string> = {
  pending: t('boAVerifier'),
  verified: t('boVerifie'),
  suspended: t('boSuspendu'),
};

const KIND: Record<string, string> = {
  independent: t('boKindIndependant'),
  vtc_company: t('boKindSocieteVtc'),
  fleet: t('boKindFlotte'),
  collective: t('boKindCollectif'),
};

/**
 * Opérateurs de la bourse de transport : vérification du profil
 * professionnel, suspension, et autorisation de la vente à la place (licence
 * de transport collectif contrôlée). Chaque décision est motivée et tracée.
 */
export function OperatorsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const filterId = useId();
  const { data, isPending, error } = useQuery({
    queryKey: ['operators', status, page],
    queryFn: () => api.operators({ status: status || undefined, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('boOperateurs')}</h1>
      <p className="text-muted">{t('boOperateursIntro')}</p>
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">
          {t('statut')}
        </label>
        <select
          id={filterId}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-input border border-line bg-white px-3"
        >
          <option value="pending">{t('boAVerifier')}</option>
          <option value="verified">{t('boVerifie')}</option>
          <option value="suspended">{t('boSuspendu')}</option>
          <option value="">{t('tous')}</option>
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.items.length === 0 && <p>{t('boAucunOperateur')}</p>}
      <ul className="flex flex-col gap-3">
        {data?.items.map((o) => <OperatorCard key={o.id} operator={o} />)}
      </ul>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}

function OperatorCard({ operator: o }: { operator: AdminOperator }) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (body: { status?: AdminOperator['status']; perSeatAllowed?: boolean }) => api.reviewOperator(o.id, { ...body, reason: reason.trim() }),
    onSuccess: () => {
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['operators'] });
    },
    onError: (e) => setError(e.message),
  });
  const ready = reason.trim().length >= 5 && !review.isPending;
  const displayName = o.legalName ?? o.name ?? '—';

  return (
    <li>
      <Card>
        <p className="text-lg font-bold">
          {displayName} <span className="font-normal text-muted">· {STATUS[o.status]}</span>
        </p>
        <dl className="mt-2 grid gap-1">
          <div className="flex justify-between gap-4"><dt>{t('boContact')}</dt><dd>{o.name ?? '—'} · {o.email ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boTypeDOperateur')}</dt><dd>{KIND[o.kind] ?? o.kind}</dd></div>
          <div className="flex justify-between gap-4"><dt>SIRET</dt><dd className="tabular">{o.siret ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boLicenceDeTransport')}</dt><dd>{o.transportLicense ?? t('boNonRenseignee')}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boVenteALaPlace')}</dt><dd>{o.perSeatAllowed ? t('boAutorisee') : t('boNonAutorisee')}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boCompteChauffeur')}</dt><dd>{o.driverApproved ? t('boValide') : t('boNonValide')}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('boLignesOuvertes')}</dt><dd className="tabular">{o.openLines}</dd></div>
        </dl>
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={reasonId} className="font-semibold">{t('boMotifDeLaDecision')}</label>
          <textarea
            id={reasonId}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-input border border-line p-3 focus:border-2 focus:border-bleu focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {o.status !== 'verified' && (
              <Button size="sm" disabled={!ready} onClick={() => review.mutate({ status: 'verified' })}>
                {t('boVerifierLOperateur')}<span className="sr-only"> ({displayName})</span>
              </Button>
            )}
            {o.status !== 'suspended' && (
              <Button size="sm" variant="danger" disabled={!ready} onClick={() => review.mutate({ status: 'suspended' })}>
                {t('boSuspendre')}<span className="sr-only"> ({displayName})</span>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!ready} onClick={() => review.mutate({ perSeatAllowed: !o.perSeatAllowed })}>
              {o.perSeatAllowed ? t('boRetirerLaVenteALaPlace') : t('boAutoriserLaVenteALaPlace')}<span className="sr-only"> ({displayName})</span>
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}
