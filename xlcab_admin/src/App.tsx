import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { restoreSession } from './lib/api';
import { ADMIN_ROLE, useAuth } from './lib/auth-store';
import { LoginPage } from './features/auth/LoginPage';
import { TwoFactorGate } from './features/auth/TwoFactorGate';
import { t } from '@/lib/i18n';

const page = <T extends Record<string, React.ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardPage = page(() => import('./features/dashboard/DashboardPage'), 'DashboardPage');
const DriversPage = page(() => import('./features/drivers/DriversPage'), 'DriversPage');
const TripsPage = page(() => import('./features/trips/TripsPage'), 'TripsPage');
const IncidentsPage = page(() => import('./features/incidents/IncidentsPage'), 'IncidentsPage');
const UsersPage = page(() => import('./features/users/UsersPage'), 'UsersPage');
const JurisdictionsPage = page(() => import('./features/jurisdictions/JurisdictionsPage'), 'JurisdictionsPage');
const AuditPage = page(() => import('./features/audit/AuditPage'), 'AuditPage');
const TariffsPage = page(() => import('./features/tariffs/TariffsPage'), 'TariffsPage');
const RatingsPage = page(() => import('./features/ratings/RatingsPage'), 'RatingsPage');
const InvoicesPage = page(() => import('./features/invoices/InvoicesPage'), 'InvoicesPage');
const OperatorsPage = page(() => import('./features/operators/OperatorsPage'), 'OperatorsPage');
const MarketPage = page(() => import('./features/market/MarketPage'), 'MarketPage');

const loading = (
  <p role="status" className="p-8">
    {t('chargement')}
  </p>
);

/**
 * Dashboard admin (Partie 9, Module 10). Trois portes successives :
 * connexion (rôle admin) → double authentification → application.
 */
export function App() {
  const { accessToken, role, twoFactorVerified } = useAuth();
  // Reprise de session par le cookie HttpOnly (invisible ici) au chargement.
  const [restoring, setRestoring] = useState(() => !accessToken);

  useEffect(() => {
    if (restoring) restoreSession().finally(() => setRestoring(false));
  }, [restoring]);

  if (restoring) return loading;
  if (!accessToken || role !== ADMIN_ROLE) return <LoginPage />;
  if (!twoFactorVerified) return <TwoFactorGate />;

  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="chauffeurs" element={<DriversPage />} />
          <Route path="courses" element={<TripsPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="operateurs" element={<OperatorsPage />} />
          <Route path="bourse" element={<MarketPage />} />
          <Route path="utilisateurs" element={<UsersPage />} />
          <Route path="notes" element={<RatingsPage />} />
          <Route path="tarifs" element={<TariffsPage />} />
          <Route path="factures" element={<InvoicesPage />} />
          <Route path="juridictions" element={<JurisdictionsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
