import { useId } from 'react';
import { t } from '@/lib/i18n';

/** Choix du mois (AAAA-MM) pour le tableau de bord et la facturation. */
export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="font-semibold">
        {t('mois')}
      </label>
      <input
        id={id}
        type="month"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-11 rounded-input border border-line bg-white px-3 focus:border-2 focus:border-bleu focus:outline-none"
      />
    </div>
  );
}
