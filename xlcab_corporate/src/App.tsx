import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { restoreSession } from './lib/api';
import { PORTAL_ROLE, useAuth } from './lib/auth-store';
import { LoginPage } from './features/auth/LoginPage';
import { TwoFactorGate } from './features/auth/TwoFactorGate';
import { t } from '@/lib/i18n';

// Pages chargées à la demande : Recharts (tableau de bord) et le reste ne
// pèsent pas sur l'écran de connexion.
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const TeamPage = lazy(() => import('./features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const BookCollaboratorPage = lazy(() =>
  import('./features/booking/BookCollaboratorPage').then((m) => ({ default: m.BookCollaboratorPage })),
);
const InvoicesPage = lazy(() => import('./features/invoices/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));

const loading = (
  <p role="status" className="p-8">
    {t('chargement')}
  </p>
);

/** Portail corporate (Partie 7, écran 14) : dashboard, équipe, réservation, facturation. */
export function App() {
  const session = useAuth((s) => s.session);
  const twoFactorVerified = useAuth((s) => s.twoFactorVerified);
  // Rechargement de page : tentative de reprise de session (cookie HttpOnly,
  // invisible ici) avant d'afficher.
  const [restoring, setRestoring] = useState(() => !session);

  useEffect(() => {
    if (!restoring) return;
    restoreSession().finally(() => setRestoring(false));
  }, [restoring]);

  if (restoring) return loading;

  const allowed = session?.role === PORTAL_ROLE;
  // Connecté mais pas encore passé la double authentification (Partie 8).
  if (allowed && !twoFactorVerified) return <TwoFactorGate />;

  return (
    <Suspense fallback={loading}>
    <Routes>
      <Route path="/connexion" element={allowed ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={allowed ? <AppLayout /> : <Navigate to="/connexion" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="reserver" element={<BookCollaboratorPage />} />
        <Route path="facturation" element={<InvoicesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
