import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDateTime, formatEuros } from '@/lib/format';
import { liveSocket, type LivePosition } from '@/lib/live';
import { SHUTTLE_LABELS, STATUS_LABELS, type AdminTrip } from '@/lib/types';
import { t } from '@/lib/i18n';

const TRACKABLE = ['accepted', 'started'];

/** Suivi des courses (Partie 9, Module 10), avec position en direct. */
export function TripsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [followed, setFollowed] = useState<AdminTrip | null>(null);
  const filterId = useId();
  const { data, isPending, error } = useQuery({
    queryKey: ['trips', status, page],
    queryFn: () => api.trips({ status: status || undefined, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('courses')}</h1>
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
          <option value="">{t('tous')}</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {followed && <LiveFollow trip={followed} onClose={() => setFollowed(null)} />}

      <Card>
        {isPending && <p role="status">{t('chargement')}</p>}
        {error && <Alert>{error.message}</Alert>}
        {data && data.items.length === 0 && <p>{t('aucuneCourse')}</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <caption className="sr-only">{t('courses')}</caption>
              <thead>
                <tr className="border-b border-line text-sm">
                  <th scope="col" className="py-2 pr-3">{t('departPrevu')}</th>
                  <th scope="col" className="py-2 pr-3">{t('trajet')}</th>
                  <th scope="col" className="py-2 pr-3">{t('passager')}</th>
                  <th scope="col" className="py-2 pr-3">{t('chauffeur')}</th>
                  <th scope="col" className="py-2 pr-3">{t('statut')}</th>
                  <th scope="col" className="py-2 pr-3 text-right">TTC</th>
                  <th scope="col" className="py-2"><span className="sr-only">{t('actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((trip) => (
                  <tr key={trip.id} className="tabular border-b border-line align-top">
                    <td className="py-2 pr-3">{formatDateTime(trip.scheduledAt)}</td>
                    <td className="py-2 pr-3">
                      {trip.originAddress}
                      <span className="block text-sm text-muted">→ {trip.destinationAddress}</span>
                      <span className="block text-sm text-muted">
                        {t('navette')} {SHUTTLE_LABELS[trip.shuttleType] ?? trip.shuttleType}
                        {trip.corporateId && t('entreprise2')}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{trip.passengerName ?? '—'}</td>
                    <td className="py-2 pr-3">{trip.driverName ?? '—'}</td>
                    <td className="py-2 pr-3">{STATUS_LABELS[trip.status] ?? trip.status}</td>
                    <td className="py-2 pr-3 text-right">{formatEuros(trip.totalPriceCents)}</td>
                    <td className="py-2">
                      {TRACKABLE.includes(trip.status) && (
                        <Button variant="outline" size="sm" onClick={() => setFollowed(trip)} aria-label={t('suivreLaCourseDe', { value1: trip.passengerName ?? '—' })}>
                          {t('suivre')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

/**
 * Position du chauffeur en direct (WebSocket du Module 3 : un admin peut
 * s'abonner à toute course). Coordonnées + lien carte : pas de SDK
 * cartographique dans le dashboard tant que la clé Google n'existe pas.
 */
function LiveFollow({ trip, onClose }: { trip: AdminTrip; onClose: () => void }) {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [status, setStatus] = useState<string>(trip.status);

  useEffect(() => {
    const socket = liveSocket();
    const onPosition = (p: LivePosition) => p.tripId === trip.id && setPosition(p);
    const onStatus = (s: { tripId: string; status: string }) => s.tripId === trip.id && setStatus(s.status);
    const subscribe = () => socket.emit('subscribe:trip', { tripId: trip.id });
    socket.on('position', onPosition);
    socket.on('status', onStatus);
    socket.on('connect', subscribe); // réabonnement après reconnexion
    subscribe();
    return () => {
      socket.emit('unsubscribe:trip', { tripId: trip.id });
      socket.off('position', onPosition);
      socket.off('status', onStatus);
      socket.off('connect', subscribe);
    };
  }, [trip.id]);

  return (
    <Card aria-live="polite">
      <CardTitle>{t('suiviEnDirect')} {trip.passengerName ?? 'course'}</CardTitle>
      <p>{t('statut2')} {STATUS_LABELS[status] ?? status}</p>
      {position ? (
        <p className="tabular">
          {t('dernierePosition')}{formatDateTime(new Date(position.timestamp).toISOString())}) : {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          {position.speed != null && t('kmH', { value1: Math.round(position.speed) })}{' '}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline"
          >
            {t('voirSurLaCarteNouvel')}
          </a>
        </p>
      ) : (
        <p>{t('enAttenteDeLaProchaine')}</p>
      )}
      <Button variant="ghost" size="sm" onClick={onClose}>
        {t('arreterLeSuivi')}
      </Button>
    </Card>
  );
}
