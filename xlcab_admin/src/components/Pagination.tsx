import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/** Pagination accessible (boutons, page courante annoncée). */
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t('pagination')} className="mt-4 flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('precedent')}
      </Button>
      <span aria-live="polite">
        {t('page')} {page} sur {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('suivant')}
      </Button>
    </nav>
  );
}
