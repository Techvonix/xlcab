import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileDown } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { MonthPicker } from '@/components/MonthPicker';
import { api } from '@/lib/api';
import { currentMonth, formatDateTime, formatEuros, formatMonth, ofMonth, statusLabel } from '@/lib/format';
import type { Invoice, IssuedInvoice } from '@/lib/types';
import { t } from '@/lib/i18n';

// jsPDF (~400 Ko) n'est chargé qu'au clic sur un export.
async function exportInvoice(invoice: Invoice, format: 'csv' | 'pdf', filename: string) {
  const { download, invoiceToCsv, invoiceToPdf } = await import('@/lib/export');
  if (format === 'csv') {
    download(new Blob([invoiceToCsv(invoice)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  } else {
    download(invoiceToPdf(invoice).output('blob'), `${filename}.pdf`);
  }
}

/**
 * Facturation (Partie 7, écran 14 / Partie 9, module 9) : relevé mensuel
 * avec TVA transport de personnes (0 %) et marchandises (20 %) séparées,
 * exports CSV et PDF.
 */
export function InvoicesPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isPending, error } = useQuery({ queryKey: ['invoices', month], queryFn: () => api.invoices(month) });

  const filename = `xlcab-releve-${month}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t('facturation')}</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      <IssuedInvoices />

      {isPending && <p role="status">{t('chargementDuReleve')}</p>}
      {error && <Alert>{error.message}</Alert>}

      {data && (
        <>
          <Card>
            <CardTitle>{t('releveDe', { month: ofMonth(data.month) })}</CardTitle>
            <p className="font-semibold">{data.company.name}</p>
            {data.company.siret && <p className="text-muted">SIRET {data.company.siret}</p>}
            {data.company.vatNumber && <p className="text-muted">{t('tvaIntracommunautaire')} {data.company.vatNumber}</p>}

            <dl className="tabular mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Total label={t('transportDePersonnesHt')} value={formatEuros(data.totals.passengerHtCents)} />
              <Total label={t('tvaTransportDePersonnes0')} value={formatEuros(data.totals.passengerVatCents)} />
              <Total label={t('transportDeMarchandisesColisHt')} value={formatEuros(data.totals.parcelHtCents)} />
              <Total label={t('tvaMarchandises20')} value={formatEuros(data.totals.parcelVatCents)} />
              <Total label={t('totalTtcFacturableCourseS', { billableTrips: data.totals.billableTrips })} value={formatEuros(data.totals.totalTtcCents)} strong />
            </dl>
            <p className="mt-3 text-sm text-muted">
              {t('seulesLesCoursesTermineesSont')}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={data.lines.length === 0}
                onClick={() => exportInvoice(data, 'csv', filename)}
              >
                <Download aria-hidden="true" size={18} />
                {t('exporterEnCsv')}
              </Button>
              <Button
                variant="outline"
                disabled={data.lines.length === 0}
                onClick={() => exportInvoice(data, 'pdf', filename)}
              >
                <FileDown aria-hidden="true" size={18} />
                {t('exporterEnPdf')}
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>{t('coursesDuMois')}</CardTitle>
            {data.lines.length === 0 ? (
              <p className="text-muted">{t('aucuneCourseCeMoisCi')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <caption className="sr-only">{t('coursesDe', { month: ofMonth(data.month) })}</caption>
                  <thead>
                    <tr className="border-b border-line text-sm">
                      <th scope="col" className="py-2 pr-3">{t('date')}</th>
                      <th scope="col" className="py-2 pr-3">{t('collaborateur')}</th>
                      <th scope="col" className="py-2 pr-3">{t('trajet')}</th>
                      <th scope="col" className="py-2 pr-3">{t('statut')}</th>
                      <th scope="col" className="py-2 pr-3 text-right">{t('htPersonnes')}</th>
                      <th scope="col" className="py-2 pr-3 text-right">{t('htColis')}</th>
                      <th scope="col" className="py-2 pr-3 text-right">TVA</th>
                      <th scope="col" className="py-2 text-right">TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.tripId} className="tabular border-b border-line align-top">
                        <td className="py-2 pr-3">{formatDateTime(l.date)}</td>
                        <td className="py-2 pr-3">
                          {l.passengerName}
                          {l.costCenter && <span className="block text-sm text-muted">{l.costCenter}</span>}
                        </td>
                        <td className="py-2 pr-3">
                          {l.originAddress}
                          <span className="block text-sm text-muted">→ {l.destinationAddress}</span>
                        </td>
                        <td className="py-2 pr-3">
                          {statusLabel(l.status)}
                          {!l.billable && <span className="block text-sm text-muted">{t('nonFacturee')}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right">{formatEuros(l.passengerHtCents)}</td>
                        <td className="py-2 pr-3 text-right">{formatEuros(l.parcelHtCents)}</td>
                        <td className="py-2 pr-3 text-right">{formatEuros(l.passengerVatCents + l.parcelVatCents)}</td>
                        <td className="py-2 text-right font-semibold">{formatEuros(l.totalTtcCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-line pt-2 font-bold sm:col-span-2' : 'flex justify-between gap-4'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * Factures légales numérotées, émises chaque mois par XLCAB (payables à
 * 30 jours). Le relevé ci-dessous reste un document de suivi, pas une facture.
 */
function IssuedInvoices() {
  const { data, error } = useQuery({ queryKey: ['issued-invoices'], queryFn: api.issuedInvoices });
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadPdf(inv: IssuedInvoice) {
    setDownloadError(null);
    try {
      const { download } = await import('@/lib/export');
      download(await api.invoicePdf(inv.id), `${inv.number}.pdf`);
    } catch (e) {
      setDownloadError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardTitle>{t('facturesEmises')}</CardTitle>
      {error && <Alert>{error.message}</Alert>}
      {downloadError && <Alert>{downloadError}</Alert>}
      {data && data.length === 0 && <p className="text-muted">{t('aucuneFacturePourLInstant')}</p>}
      {data && data.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2">{t('numero')}</th>
              <th scope="col" className="py-2">{t('periode')}</th>
              <th scope="col" className="py-2">{t('montantTtc')}</th>
              <th scope="col" className="py-2">{t('echeance')}</th>
              <th scope="col" className="py-2"><span className="sr-only">{t('telecharger')}</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((inv) => (
              <tr key={inv.id} className="border-b border-line">
                <td className="py-2 font-semibold">{inv.kind === 'credit_note' ? t('avoir', { number: inv.number }) : inv.number}</td>
                <td className="py-2">{inv.periodStart ? formatMonth(inv.periodStart.slice(0, 7)) : '—'}</td>
                <td className="py-2 tabular-nums">{formatEuros(inv.totalCents)}</td>
                <td className="py-2">{inv.paymentStatus === 'paid' ? t('reglee') : formatDateTime(inv.dueDate)}</td>
                <td className="py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => downloadPdf(inv)} aria-label={t('telechargerLaFactureEnPdf', { number: inv.number })}>
                    <FileDown aria-hidden="true" className="size-4" /> PDF
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
