import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDate, formatEuros } from '@/lib/format';
import type { AdminInvoice } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Téléchargement local d'un PDF (jamais d'URL publique). */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Factures légales émises (particuliers à la course, entreprises au mois,
 * avoirs). Alerte tant que les mentions obligatoires du vendeur ne sont pas
 * toutes renseignées dans la configuration du serveur.
 */
export function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({ queryKey: ['invoices', page], queryFn: () => api.invoices(page) });

  async function download(inv: AdminInvoice) {
    setDownloadError(null);
    try {
      saveBlob(await api.invoicePdf(inv.id), `${inv.number}.pdf`);
    } catch (e) {
      setDownloadError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('factures')}</h1>
      {data && !data.sellerComplete && (
        <Alert>
          {t('mentionsLegalesDuVendeurIncompletes')}
        </Alert>
      )}
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {downloadError && <Alert>{downloadError}</Alert>}
      {data && (
        <Card>
          {data.items.length === 0 ? (
            <p className="text-muted">{t('aucuneFactureEmisePourL')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2">{t('numero')}</th>
                  <th scope="col" className="py-2">{t('date')}</th>
                  <th scope="col" className="py-2">{t('client')}</th>
                  <th scope="col" className="py-2">{t('montantTtc')}</th>
                  <th scope="col" className="py-2">{t('reglement')}</th>
                  <th scope="col" className="py-2"><span className="sr-only">{t('telecharger')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv) => (
                  <tr key={inv.id} className="border-b border-line">
                    <td className="py-2 font-semibold">{inv.kind === 'credit_note' ? t('avoir', { number: inv.number }) : inv.number}</td>
                    <td className="py-2">{formatDate(inv.issuedAt)}</td>
                    <td className="py-2">
                      {inv.buyer.name}
                      {inv.corporateId ? t('entreprise') : ''}
                    </td>
                    <td className="py-2 tabular-nums">{formatEuros(inv.totalCents)}</td>
                    <td className="py-2">{inv.paymentStatus === 'paid' ? t('reglee') : t('aReglerAvantLe', { value1: formatDate(inv.dueDate) })}</td>
                    <td className="py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => download(inv)} aria-label={t('telechargerEnPdf', { number: inv.number })}>
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}
    </div>
  );
}
