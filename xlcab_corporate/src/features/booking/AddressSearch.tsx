import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import type { GeoPlace } from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * Adresse → coordonnées via POST /api/v1/geocode (clé Google côté
 * serveur). Recherche sur demande (bouton ou Entrée) plutôt qu'à chaque
 * frappe : chaque recherche est facturée par Google.
 */
export function AddressSearch({
  label,
  value,
  onSelect,
  error,
}: {
  label: string;
  value: GeoPlace | null;
  onSelect: (place: GeoPlace | null) => void;
  error?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 3) {
      setSearchError(t('saisissezAuMoins3Caracteres'));
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await api.geocode(query));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-line bg-surface p-3">
          <span>{value.address}</span>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)} aria-label={t('modifierLAdresse', { label })}>
            {t('modifier')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          {t('adresse')} {label}
        </label>
        <Input
          id={id}
          value={query}
          placeholder={t('adresseGareAeroport')}
          aria-invalid={Boolean(error)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
        />
        <Button variant="outline" onClick={search} disabled={searching} className="h-14 shrink-0" aria-label={t('rechercherLAdresse', { label })}>
          <Search aria-hidden="true" size={18} />
          {searching ? t('recherche') : t('rechercher')}
        </Button>
      </div>
      {searchError && <Alert>{searchError}</Alert>}
      {error && !searchError && (
        <p role="alert" className="text-sm">
          <span aria-hidden="true" className="text-error">⚠ </span>
          {error}
        </p>
      )}
      {results && results.length === 0 && <p role="status">{t('aucuneAdresseTrouvee')}</p>}
      {results && results.length > 0 && (
        <ul aria-label={t('resultatsPour', { label })} className="flex flex-col gap-1">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="min-h-11 w-full rounded-input border border-line bg-white px-3 text-left hover:bg-surface"
                onClick={() => {
                  onSelect(r);
                  setResults(null);
                  setQuery('');
                }}
              >
                {r.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
