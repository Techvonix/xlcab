import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/Pagination';
import { api } from '@/lib/api';
import { formatDate, fullName } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Utilisateurs (Partie 6 : GET /admin/users). Consultation seule. */
export function UsersPage() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const searchId = useId();
  const roleId = useId();
  const { data, isPending, error } = useQuery({
    queryKey: ['users', search, role, page],
    queryFn: () => api.users({ search: search || undefined, role: role || undefined, page }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('utilisateurs')}</h1>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          setPage(1);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="font-semibold">
            {t('email')}
          </label>
          <input id={searchId} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={roleId} className="font-semibold">
            {t('role')}
          </label>
          <select
            id={roleId}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-input border border-line bg-white px-3"
          >
            <option value="">{t('tous')}</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm">
          {t('rechercher')}
        </Button>
      </form>

      <Card>
        {isPending && <p role="status">{t('chargement')}</p>}
        {error && <Alert>{error.message}</Alert>}
        {data && (
          <>
            <p className="mb-2 text-muted" aria-live="polite">
              {data.total} compte(s)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">{t('comptesUtilisateurs')}</caption>
                <thead>
                  <tr className="border-b border-line text-sm">
                    <th scope="col" className="py-2 pr-3">{t('nom')}</th>
                    <th scope="col" className="py-2 pr-3">{t('email')}</th>
                    <th scope="col" className="py-2 pr-3">{t('role')}</th>
                    <th scope="col" className="py-2 pr-3">{t('pays')}</th>
                    <th scope="col" className="py-2 pr-3">{t('creeLe')}</th>
                    <th scope="col" className="py-2">{t('etat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className="border-b border-line">
                      <td className="py-2 pr-3">{fullName(u)}</td>
                      <td className="py-2 pr-3">{u.email}</td>
                      <td className="py-2 pr-3">{ROLE_LABELS[u.role] ?? u.role}</td>
                      <td className="py-2 pr-3">{u.jurisdiction}</td>
                      <td className="py-2 pr-3">{formatDate(u.createdAt)}</td>
                      <td className="py-2">{u.deletedAt ? t('supprime') : t('actif')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
