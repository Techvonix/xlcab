import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatEuros } from '@/lib/format';
import { ROLE_LABELS, STATUS_LABELS } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Vue d'ensemble : comptes, courses, chiffre d'affaires, points d'attention. */
export function DashboardPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['analytics'], queryFn: api.analytics });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('tableauDeBord')}</h1>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <section aria-label={t('pointsDAttention')} className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm font-semibold text-muted">{t('chauffeursAValider')}</p>
              <p className="tabular text-3xl font-bold">{data.pendingDrivers}</p>
              <Link to="/chauffeurs" className="font-semibold text-primary underline">
                {t('voirLesDossiers')}
              </Link>
            </Card>
            <Card className={data.openIncidents > 0 ? 'border-2 border-error' : ''}>
              <p className="text-sm font-semibold text-muted">{t('incidentsNonClotures')}</p>
              <p className="tabular text-3xl font-bold">{data.openIncidents}</p>
              <Link to="/incidents" className="font-semibold text-primary underline">
                {t('voirLesIncidents')}
              </Link>
            </Card>
          </section>

          <Card>
            <CardTitle>{t('chiffreDAffaires')} {data.periodDays} derniers jours</CardTitle>
            <dl className="tabular grid gap-2 sm:grid-cols-2">
              <Row label={t('totalTtcCourseSTerminee', { completedTrips: data.completedTrips })} value={formatEuros(data.revenue.ttcCents)} />
              <Row label={t('transportDePersonnesHtTva')} value={formatEuros(data.revenue.passengerHtCents)} />
              <Row label={t('colisHt')} value={formatEuros(data.revenue.parcelHtCents)} />
              <Row label={t('tvaCollectee')} value={formatEuros(data.revenue.vatCents)} />
            </dl>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>{t('comptesParRole')}</CardTitle>
              <dl className="tabular flex flex-col gap-2">
                {data.usersByRole.map((r) => (
                  <Row key={r.role} label={ROLE_LABELS[r.role] ?? r.role} value={String(r.count)} />
                ))}
              </dl>
            </Card>
            <Card>
              <CardTitle>{t('coursesCreees')} {data.periodDays} derniers jours</CardTitle>
              <dl className="tabular flex flex-col gap-2">
                {data.tripsByStatus.map((s) => (
                  <Row key={s.status} label={STATUS_LABELS[s.status] ?? s.status} value={String(s.count)} />
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
