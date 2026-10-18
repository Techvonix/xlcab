import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDateTime, fullName } from '@/lib/format';
import type { Incident } from '@/lib/types';
import { t } from '@/lib/i18n';

const STATUS = { open: t('ouvert'), acknowledged: t('prisEnCharge'), resolved: t('cloture') } as const;

/** Libellé par type : SOS (en course), colis non remis, signalement d'un chauffeur par un passager. */
const TYPE: Record<string, string> = {
  sos: 'SOS',
  parcel_failed: t('colisNonRemis'),
  driver_report: t('signalementChauffeur'),
  // Protocole d'annulation des lignes : à traiter dans « Bourse et lignes ».
  departure_at_risk: t('boDepartEnDanger'),
};
const incidentLabel = (type: string) => TYPE[type] ?? type;

/** Incidents : SOS (écran 9), colis non remis, signalements de chauffeurs (écran 10). */
export function IncidentsPage() {
  const [status, setStatus] = useState<string>('open');
  const [page, setPage] = useState(1);
  const filterId = useId();
  const { data, isPending, error } = useQuery({
    queryKey: ['incidents', status, page],
    queryFn: () => api.incidents({ status: status || undefined, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('incidents')}</h1>
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
          <option value="open">{t('ouverts')}</option>
          <option value="acknowledged">{t('prisEnCharge')}</option>
          <option value="resolved">{t('clotures')}</option>
          <option value="">{t('tous')}</option>
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.items.length === 0 && <p>{t('aucunIncident')}</p>}
      <ul className="flex flex-col gap-3">
        {data?.items.map((i) => <IncidentCard key={i.id} incident={i} />)}
      </ul>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const notesId = useId();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };
  const ack = useMutation({ mutationFn: () => api.acknowledgeIncident(incident.id), onSuccess: refresh, onError: (e) => setError(e.message) });
  const footage = useMutation({ mutationFn: () => api.requestFootage(incident.id), onSuccess: refresh, onError: (e) => setError(e.message) });
  const resolve = useMutation({ mutationFn: () => api.resolveIncident(incident.id, notes.trim()), onSuccess: refresh, onError: (e) => setError(e.message) });
  const r = incident.reporter;

  return (
    <li>
      <Card className={incident.status === 'open' && incident.type === 'sos' ? 'border-2 border-error' : incident.status === 'open' ? 'border-2 border-warning' : ''}>
        <p className="text-lg font-bold">
          {incidentLabel(incident.type)} — {STATUS[incident.status]} <span className="font-normal text-muted">· {formatDateTime(incident.createdAt)}</span>
        </p>
        <dl className="tabular mt-2 grid gap-1">
          <div className="flex justify-between gap-4"><dt>{t('emetteur')}</dt><dd>{fullName(r)} ({incident.role === 'driver' ? 'chauffeur' : 'passager'})</dd></div>
          <div className="flex justify-between gap-4">
            <dt>{t('telephone')}</dt>
            <dd>{r?.phone ? <a href={`tel:${r.phone}`} className="font-semibold text-primary underline">{r.phone}</a> : '—'}</dd>
          </div>
          {incident.type === 'sos' && (
          <div className="flex justify-between gap-4">
            <dt>{t('position2')}</dt>
            <dd>
              {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}{' '}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${incident.lat},${incident.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline"
              >
                carte
              </a>
            </dd>
          </div>
          )}
          <div className="flex justify-between gap-4"><dt>{t('course')}</dt><dd className="text-sm">{incident.tripId}</dd></div>
          {incident.notes && <div className="flex justify-between gap-4"><dt>{t('notes')}</dt><dd>{incident.notes}</dd></div>}
          <div className="flex justify-between gap-4">
            <dt>{t('dcEnregistrement')}</dt>
            <dd>
              {incident.footageAcknowledgedAt
                ? t('dcConserveLe', { date: formatDateTime(incident.footageAcknowledgedAt) })
                : incident.footageRequestedAt
                  ? t('dcDemandeLe', { date: formatDateTime(incident.footageRequestedAt) })
                  : t('dcNonDemande')}
            </dd>
          </div>
        </dl>
        {error && <Alert>{error}</Alert>}
        {incident.status !== 'resolved' && (
          <div className="mt-3 flex flex-col gap-2">
            {incident.status === 'open' && (
              <Button onClick={() => ack.mutate()} disabled={ack.isPending}>
                {t('prendreEnCharge')}
              </Button>
            )}
            {!incident.footageRequestedAt && (
              <Button variant="outline" onClick={() => footage.mutate()} disabled={footage.isPending}>
                {t('dcDemanderEnregistrement')}
              </Button>
            )}
            <label htmlFor={notesId} className="font-semibold">
              {t('compteRenduDeResolution')}
            </label>
            <textarea
              id={notesId}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-input border border-line p-3 focus:border-2 focus:border-bleu focus:outline-none"
            />
            <Button variant="outline" onClick={() => resolve.mutate()} disabled={notes.trim().length < 5 || resolve.isPending}>
              {t('cloturerLIncident')}
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}
