import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Banknote, MapPin, BarChart3, Euro, FileClock, Globe, LogOut, ReceiptText, Route, Siren, Star, Store, UserCheck, Users } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { closeLiveSocket, liveSocket, type SosAlert } from '@/lib/live';
import { cn } from '@/lib/utils';
import { XlcabLogo } from '@/components/brand/XlcabLogo';
import { t } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const NAV = [
  { to: '/', label: t('tableauDeBord'), icon: BarChart3, end: true },
  { to: '/chauffeurs', label: t('chauffeursAValider'), icon: UserCheck },
  { to: '/courses', label: t('courses'), icon: Route },
  { to: '/incidents', label: t('incidents'), icon: Siren },
  { to: '/operateurs', label: t('boOperateurs'), icon: BadgeCheck },
  { to: '/bourse', label: t('boBourseEtLignes'), icon: Store },
  { to: '/points-de-rencontre', label: t('mpPointsDeRencontre'), icon: MapPin },
  { to: '/reversements', label: t('rvReversements'), icon: Banknote },
  { to: '/notes', label: t('notesDesPassagers'), icon: Star },
  { to: '/utilisateurs', label: t('utilisateurs'), icon: Users },
  { to: '/tarifs', label: t('tarifs'), icon: Euro },
  { to: '/factures', label: t('factures'), icon: ReceiptText },
  { to: '/juridictions', label: t('juridictions'), icon: Globe },
  { to: '/audit', label: t('journalDAudit'), icon: FileClock },
];

export function AdminLayout() {
  const queryClient = useQueryClient();
  const [alerts, setAlerts] = useState<SosAlert[]>([]);

  // Alertes SOS en direct (Module 3 : salle admin), visibles sur toutes les pages.
  useEffect(() => {
    const socket = liveSocket();
    const onSos = ({ alert }: { alert: SosAlert }) => {
      setAlerts((a) => [alert, ...a].slice(0, 5));
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    };
    socket.on('sos', onSos);
    return () => {
      socket.off('sos', onSos);
    };
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-surface md:flex">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-button focus:bg-white focus:p-3">
        {t('allerAuContenu')}
      </a>
      <aside className="border-b border-line bg-white md:min-h-screen md:w-72 md:border-r md:border-b-0">
        <p className="p-5 text-xl">
          <XlcabLogo space="Admin" />
        </p>
        <nav aria-label={t('navigationPrincipale')}>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn('flex min-h-11 items-center gap-3 rounded-button px-3 font-semibold', isActive ? 'border-l-4 border-primary bg-surface' : 'hover:bg-surface')
                  }
                >
                  <Icon aria-hidden="true" size={20} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 px-3 pb-5">
          <LanguageSwitch />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              closeLiveSocket();
              await logout();
            }}
          >
            <LogOut aria-hidden="true" size={18} />
            {t('seDeconnecter')}
          </Button>
        </div>
      </aside>
      <main id="contenu" className="flex-1 p-5 md:p-8">
        {alerts.length > 0 && (
          <div role="alert" className="mb-6 rounded-card border-2 border-error bg-white p-4">
            <p className="flex items-center gap-2 text-lg font-bold">
              <Siren aria-hidden="true" className="text-error" />
              {alerts.length === 1 ? t('alerteSosRecue') : t('alertesSosRecues', { length: alerts.length })}
            </p>
            <ul className="mt-2">
              {alerts.map((a) => (
                <li key={`${a.tripId}-${a.timestamp}`} className="tabular">
                  {formatDateTime(new Date(a.timestamp).toISOString())} — {a.role === 'driver' ? 'chauffeur' : 'passager'}{t('position')}{' '}
                  {a.position.lat.toFixed(5)}, {a.position.lng.toFixed(5)}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link to="/incidents" className="inline-flex min-h-11 items-center rounded-button bg-primary px-4 font-semibold text-white">
                {t('traiterLesIncidents')}
              </Link>
              <Button variant="outline" size="sm" onClick={() => setAlerts([])}>
                {t('masquerLeBandeau')}
              </Button>
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
