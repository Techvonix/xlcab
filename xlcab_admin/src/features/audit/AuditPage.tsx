import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

const ACTIONS: Record<string, string> = {
  'driver.approve': t('chauffeurValide'),
  'driver.reject': t('chauffeurRefuse'),
  'document.view': t('documentConsulte'),
  'document.approve': t('documentApprouve'),
  'document.reject': t('documentRefuse'),
  'incident.acknowledge': t('incidentPrisEnCharge'),
  'incident.resolve': t('incidentCloture'),
  'jurisdiction.update': t('juridictionModifiee'),
  'rating.remove': t('noteRetiree'),
  '2fa.setup': t('n2faActivationCommencee'),
  '2fa.enable': t('n2faActivee'),
  '2fa.verify.success': t('n2faCodeValide'),
  '2fa.verify.failure': t('n2faCodeRefuse'),
};

/** Journal d'audit (Partie 6 : GET /admin/audit-logs). */
export function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const filterId = useId();
  const { data, isPending, error } = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () => api.auditLogs({ action: action || undefined, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('journalDAudit')}</h1>
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">
          {t('action')}
        </label>
        <select
          id={filterId}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-input border border-line bg-white px-3"
        >
          <option value="">{t('toutes')}</option>
          {Object.entries(ACTIONS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Card>
        {isPending && <p role="status">{t('chargement')}</p>}
        {error && <Alert>{error.message}</Alert>}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">{t('journalDAudit')}</caption>
                <thead>
                  <tr className="border-b border-line text-sm">
                    <th scope="col" className="py-2 pr-3">{t('date')}</th>
                    <th scope="col" className="py-2 pr-3">{t('action')}</th>
                    <th scope="col" className="py-2 pr-3">{t('auteur')}</th>
                    <th scope="col" className="py-2 pr-3">{t('objet')}</th>
                    <th scope="col" className="py-2">{t('adresseIp')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id} className="tabular border-b border-line">
                      <td className="py-2 pr-3">{formatDateTime(l.createdAt)}</td>
                      <td className="py-2 pr-3">{ACTIONS[l.action] ?? l.action}</td>
                      <td className="py-2 pr-3 text-sm">{l.userId ?? '—'}</td>
                      <td className="py-2 pr-3 text-sm">{[l.entity, l.entityId].filter(Boolean).join(' ') || '—'}</td>
                      <td className="py-2 text-sm">{l.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
