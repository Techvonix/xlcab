import { useId } from 'react';
import { lang, setLang, t, type Lang } from '@/lib/i18n';

/** Choix de la langue du dashboard (rechargement : la session est conservée). */
export function LanguageSwitch() {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {t('langue')}
      </label>
      <select
        id={id}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="h-11 rounded-input border border-line bg-white px-3"
      >
        {/* Chaque langue écrite dans sa propre langue. */}
        <option value="fr" lang="fr">Français</option>
        <option value="en" lang="en">English</option>
      </select>
    </div>
  );
}
