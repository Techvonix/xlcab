import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/alert';
import { Card, CardTitle } from '@/components/ui/card';
import { MonthPicker } from '@/components/MonthPicker';
import { api } from '@/lib/api';
import { currentMonth, formatEuros, formatMonth, ofMonth, shortMonth } from '@/lib/format';
import { shuttleLabel } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Tableau de bord KPIs (Partie 7, écran 14). */
export function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isPending, error } = useQuery({ queryKey: ['analytics', month], queryFn: () => api.analytics(month) });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t('tableauDeBord')}</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      {isPending && <p role="status">{t('chargementDesIndicateurs')}</p>}
      {error && <Alert>{error.message}</Alert>}

      {data && (
        <>
          <section aria-label={t('indicateursDe', { month: ofMonth(data.month) })} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label={t('courses')} value={String(data.totals.trips)} />
            <Kpi label={t('depenseTtc')} value={formatEuros(data.totals.spendTtcCents)} />
            <Kpi
              label={t('dontHtTransportDePersonnes')}
              value={formatEuros(data.totals.passengerHtCents)}
              detail={t('tva0ExonereEnFrance')}
            />
            <Kpi label={t('dontHtColis')} value={formatEuros(data.totals.parcelHtCents)} detail={t('tva20', { value1: formatEuros(data.totals.vatCents) })} />
          </section>

          <Budget used={data.budget.usedCents} limit={data.budget.monthlyLimitCents} />

          <Card>
            <CardTitle>{t('depenseDes6DerniersMois')}</CardTitle>
            <div className="h-72" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly.map((m) => ({ ...m, label: shortMonth(m.month), euros: m.spendTtcCents / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v: number) => `${v} €`} width={70} />
                  <Tooltip formatter={(v) => formatEuros(Number(v) * 100)} labelFormatter={(l) => String(l)} />
                  <Bar dataKey="euros" name="Dépense TTC" fill="#2196f3" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Le graphique est invisible aux lecteurs d'écran : mêmes données en tableau. */}
            <table className="sr-only">
              <caption>{t('depenseTtcParMois')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('mois')}</th>
                  <th scope="col">{t('courses')}</th>
                  <th scope="col">{t('depenseTtc')}</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{formatMonth(m.month)}</td>
                    <td>{m.trips}</td>
                    <td>{formatEuros(m.spendTtcCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Breakdown title={t('parCollaborateur')} rows={data.byMember.map((m) => [m.name, t('courseS', { trips: m.trips }), formatEuros(m.spendTtcCents)])} />
            <Breakdown title={t('parCentreDeCout')} rows={data.byCostCenter.map((c) => [c.costCenter, '', formatEuros(c.spendTtcCents)])} />
            <Breakdown title={t('parNavette')} rows={data.byShuttle.map((s) => [shuttleLabel(s.shuttleType), '', t('courseS', { trips: s.trips })])} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
    </Card>
  );
}

function Budget({ used, limit }: { used: number; limit: number | null }) {
  if (limit == null) {
    return (
      <Card>
        <CardTitle>{t('budgetMensuel')}</CardTitle>
        <p className="text-muted">{t('aucunPlafondDefiniPourVotre')}</p>
      </Card>
    );
  }
  const ratio = Math.min(1, used / limit);
  const over = used >= limit;
  return (
    <Card>
      <CardTitle>{t('budgetMensuel')}</CardTitle>
      <p className="tabular">
        {formatEuros(used)} {t('utilisesSur')} {formatEuros(limit)} ({Math.round(ratio * 100)} %)
        {over && <strong> {t('plafondAtteint')}</strong>}
      </p>
      <div
        role="progressbar"
        aria-label={t('budgetUtilise')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
      >
        <div className={over ? 'h-full bg-error' : 'h-full bg-bleu'} style={{ width: `${ratio * 100}%` }} />
      </div>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? (
        <p className="text-muted">{t('aucuneCourseCeMoisCi')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(([name, detail, amount], i) => (
            <li key={`${name}-${i}`} className="flex justify-between gap-3">
              <span>
                {name}
                {detail && <span className="block text-sm text-muted">{detail}</span>}
              </span>
              <span className="tabular font-semibold">{amount}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
