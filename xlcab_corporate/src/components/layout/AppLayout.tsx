import { BarChart3, CalendarPlus, FileText, LogOut, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api';
import { cn } from '@/lib/utils';
import { XlcabLogo } from '@/components/brand/XlcabLogo';
import { t } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const NAV = [
  { to: '/', label: t('tableauDeBord'), icon: BarChart3, end: true },
  { to: '/equipe', label: t('equipe'), icon: Users },
  { to: '/reserver', label: t('reserverPourUnCollaborateur'), icon: CalendarPlus },
  { to: '/facturation', label: t('facturation'), icon: FileText },
];

export function AppLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface md:flex">
      {/* Accès direct au contenu au clavier (WCAG 2.4.1). */}
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-button focus:bg-white focus:p-3">
        {t('allerAuContenu')}
      </a>
      <aside className="border-b border-line bg-white md:min-h-screen md:w-72 md:border-r md:border-b-0">
        <div className="p-5">
          <p className="text-xl">
            <XlcabLogo space={t('entreprise')} />
          </p>
        </div>
        <nav aria-label={t('navigationPrincipale')}>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-3 rounded-button px-3 font-semibold',
                      // Page active : fond ET barre latérale, pas la couleur seule.
                      isActive ? 'border-l-4 border-primary bg-surface' : 'hover:bg-surface',
                    )
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
              await logout();
              navigate('/connexion', { replace: true });
            }}
          >
            <LogOut aria-hidden="true" size={18} />
            {t('seDeconnecter')}
          </Button>
        </div>
      </aside>
      <main id="contenu" className="flex-1 p-5 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
