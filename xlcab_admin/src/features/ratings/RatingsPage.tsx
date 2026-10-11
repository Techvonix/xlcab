import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminRating, RatedDriver } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Moyenne « 2,50 » (virgule française, deux décimales). */
const average = (n: number) => n.toFixed(2).replace('.', ',');

/** Étoiles écrites ET annoncées en clair (jamais l'icône seule). */
function Stars({ value }: { value: number }) {
  return (
    <span className="tabular font-bold">
      <span aria-hidden="true">{'★'.repeat(value)}{'☆'.repeat(5 - value)} {value}/5</span>
      <span className="sr-only">{value} sur 5</span>
    </span>
  );
}

/**
 * Notes des passagers (écran 10 → Module 10) : chauffeurs à surveiller,
 * commentaires (jamais montrés au chauffeur), retrait d'une note abusive.
 */
export function RatingsPage() {
  const [driver, setDriver] = useState<{ id: string; name: string | null } | null>(null);
  const [maxStars, setMaxStars] = useState('');
  const [withComment, setWithComment] = useState(false);
  const [page, setPage] = useState(1);
  const [driversPage, setDriversPage] = useState(1);
  const starsId = useId();
  const commentId = useId();

  const drivers = useQuery({ queryKey: ['rated-drivers', driversPage], queryFn: () => api.ratedDrivers(driversPage) });
  const ratings = useQuery({
    queryKey: ['ratings', driver?.id, maxStars, withComment, page],
    queryFn: () => api.ratings({ driverId: driver?.id, maxStars: maxStars ? Number(maxStars) : undefined, withComment, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('notesDesPassagers')}</h1>

      <Card>
        <h2 className="mb-1 text-xl font-bold">{t('chauffeursASurveiller')}</h2>
        <p className="mb-3 text-muted">{t('moyenneLaPlusBasseEn')}</p>
        {drivers.isPending && <p role="status">{t('chargement')}</p>}
        {drivers.error && <Alert>{drivers.error.message}</Alert>}
        {drivers.data && drivers.data.items.length === 0 && <p>{t('aucunChauffeurNotePourL')}</p>}
        {drivers.data && drivers.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">{t('chauffeursNotes')}</caption>
                <thead>
                  <tr className="border-b border-line text-sm">
                    <th scope="col" className="py-2 pr-3">{t('chauffeur')}</th>
                    <th scope="col" className="py-2 pr-3">{t('moyenne')}</th>
                    <th scope="col" className="py-2 pr-3">{t('avis')}</th>
                    <th scope="col" className="py-2 pr-3">{t('notesBasses')}</th>
                    <th scope="col" className="py-2 pr-3">{t('trajets')}</th>
                    <th scope="col" className="py-2"><span className="sr-only">{t('action')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.data.items.map((d: RatedDriver) => (
                    <tr key={d.driverId} className="tabular border-b border-line">
                      <td className="py-2 pr-3 font-semibold">{d.name ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {/* Signal en texte, pas seulement en couleur. */}
                        {average(d.rating)} / 5{d.rating < 3.5 && <span className="ml-2 rounded-full bg-surface px-2 text-sm font-semibold">{t('aSurveiller')}</span>}
                      </td>
                      <td className="py-2 pr-3">{d.ratingCount}</td>
                      <td className="py-2 pr-3">{d.lowCount}</td>
                      <td className="py-2 pr-3">{d.totalTrips}</td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDriver({ id: d.driverId, name: d.name });
                            setPage(1);
                          }}
                        >
                          {t('voirSesNotes')}<span className="sr-only"> ({d.name})</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={drivers.data.page} pageSize={drivers.data.pageSize} total={drivers.data.total} onChange={setDriversPage} />
          </>
        )}
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="notes-titre">
        <h2 id="notes-titre" className="text-xl font-bold">
          {t('notes')}{driver ? ` de ${driver.name ?? 'ce chauffeur'}` : ''}
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor={starsId} className="font-semibold">{t('note')}</label>
            <select
              id={starsId}
              value={maxStars}
              onChange={(e) => {
                setMaxStars(e.target.value);
                setPage(1);
              }}
              className="h-11 rounded-input border border-line bg-white px-3"
            >
              <option value="">{t('toutes')}</option>
              <option value="1">{t('n1Etoile')}</option>
              <option value="2">{t('n2EtoilesOuMoins')}</option>
              <option value="3">{t('n3EtoilesOuMoins')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={commentId}
              type="checkbox"
              checked={withComment}
              onChange={(e) => {
                setWithComment(e.target.checked);
                setPage(1);
              }}
              className="size-5"
            />
            <label htmlFor={commentId} className="font-semibold">{t('avecCommentaireSeulement')}</label>
          </div>
          {driver && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDriver(null);
                setPage(1);
              }}
            >
              {t('tousLesChauffeurs')}
            </Button>
          )}
        </div>

        {ratings.isPending && <p role="status">{t('chargement')}</p>}
        {ratings.error && <Alert>{ratings.error.message}</Alert>}
        {ratings.data && ratings.data.items.length === 0 && <Card>{t('aucuneNotePourCesCriteres')}</Card>}
        {ratings.data && ratings.data.items.length > 0 && (
          <>
            <ul className="flex flex-col gap-3">
              {ratings.data.items.map((r) => (
                <RatingItem key={r.id} rating={r} />
              ))}
            </ul>
            <Pagination page={ratings.data.page} pageSize={ratings.data.pageSize} total={ratings.data.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function RatingItem({ rating }: { rating: AdminRating }) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.removeRating(rating.id, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ratings'] });
      queryClient.invalidateQueries({ queryKey: ['rated-drivers'] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Stars value={rating.stars} />
          <span className="tabular text-sm text-muted">{formatDateTime(rating.createdAt)}</span>
        </div>
        <dl className="mt-2 grid gap-1">
          <div className="flex justify-between gap-4"><dt>{t('chauffeur')}</dt><dd className="font-semibold">{rating.driver.name ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('passager')}</dt><dd>{rating.passenger.name ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('course')}</dt><dd className="text-sm">{rating.tripId}</dd></div>
        </dl>
        {rating.comment ? (
          <blockquote className="mt-3 border-l-4 border-line pl-3 italic">{rating.comment}</blockquote>
        ) : (
          <p className="mt-3 text-muted">{t('sansCommentaire')}</p>
        )}
        {error && <Alert>{error}</Alert>}
        {!removing ? (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setRemoving(true)}>
            {t('retirerCetteNote')}
          </Button>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor={reasonId} className="font-semibold">{t('motifDuRetraitTraceDans')}</label>
            <textarea
              id={reasonId}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-input border border-line p-3 focus:border-2 focus:border-bleu focus:outline-none"
            />
            <div className="flex gap-2">
              <Button onClick={() => remove.mutate()} disabled={reason.trim().length < 10 || remove.isPending}>
                {t('confirmerLeRetrait')}
              </Button>
              <Button variant="ghost" onClick={() => setRemoving(false)}>
                {t('annuler')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
