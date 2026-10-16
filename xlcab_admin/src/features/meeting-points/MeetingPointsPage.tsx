import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import type { MeetingPoint } from '@/lib/types';
import { t } from '@/lib/i18n';

/**
 * Catalogue des points de rencontre (CLARIFICATION_MODELE.md, section 5.3) :
 * l'équipe XLCAB choisit des lieux sûrs, éclairés, où l'arrêt est autorisé ;
 * les chauffeurs y composent les arrêts de leurs lignes. La position d'un point
 * ne change pas (des arrêts et des réservations y renvoient) : on le retire et
 * on en crée un autre.
 */
export function MeetingPointsPage() {
  const [city, setCity] = useState('');
  const filterId = useId();
  const { data, isPending, error } = useQuery({ queryKey: ['meeting-points'], queryFn: () => api.meetingPoints() });
  const cities = [...new Set((data ?? []).map((p) => p.city))].sort((a, b) => a.localeCompare(b));
  const shown = (data ?? []).filter((p) => !city || p.city === city);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('mpPointsDeRencontre')}</h1>
      <p className="text-muted">{t('mpIntro')}</p>
      <NewPointForm />
      <div className="flex items-center gap-3">
        <label htmlFor={filterId} className="font-semibold">{t('mpVille')}</label>
        <select id={filterId} value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-input border border-line bg-white px-3">
          <option value="">{t('tous')}</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data && shown.length === 0 && <p>{t('mpAucunPoint')}</p>}
      <ul className="flex flex-col gap-3">
        {shown.map((p) => <PointCard key={p.id} point={p} />)}
      </ul>
    </div>
  );
}

function NewPointForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ city: '', name: '', address: '', lat: '', lng: '', instructions: '', transit: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.createMeetingPoint({
        city: form.city.trim(), name: form.name.trim(), address: form.address.trim(),
        lat: Number(form.lat.replace(',', '.')), lng: Number(form.lng.replace(',', '.')),
        instructions: form.instructions.trim() || null, transit: form.transit.trim() || null,
      }),
    onSuccess: (p) => {
      setForm({ city: form.city, name: '', address: '', lat: '', lng: '', instructions: '', transit: '' });
      setError(null);
      setDone(t('mpPointAjoute', { name: p.name }));
      queryClient.invalidateQueries({ queryKey: ['meeting-points'] });
    },
    onError: (e) => {
      setDone(null);
      setError(e.message);
    },
  });
  const coord = (v: string) => v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')));
  const ready = form.city.trim().length >= 2 && form.name.trim().length >= 2 && form.address.trim().length >= 3 && coord(form.lat) && coord(form.lng);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !create.isPending) create.mutate();
  };

  return (
    <Card>
      <h2 className="text-xl font-bold">{t('mpAjouterUnPoint')}</h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label={t('mpVille')}>{({ id }) => <Input id={id} value={form.city} onChange={set('city')} />}</Field>
        <Field label={t('mpNom')} hint={t('mpNomAide')}>{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.name} onChange={set('name')} />}</Field>
        <Field label={t('mpAdresse')}>{({ id }) => <Input id={id} value={form.address} onChange={set('address')} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('mpLatitude')}>{({ id }) => <Input id={id} inputMode="decimal" value={form.lat} onChange={set('lat')} />}</Field>
          <Field label={t('mpLongitude')}>{({ id }) => <Input id={id} inputMode="decimal" value={form.lng} onChange={set('lng')} />}</Field>
        </div>
        <Field label={t('mpConsignes')} hint={t('mpConsignesAide')}>{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.instructions} onChange={set('instructions')} />}</Field>
        <Field label={t('mpTransports')} hint={t('mpTransportsAide')}>{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={form.transit} onChange={set('transit')} />}</Field>
        <div className="md:col-span-2 flex flex-col gap-2">
          <p className="text-sm text-muted">{t('mpVerificationSurPlace')}</p>
          {error && <Alert>{error}</Alert>}
          {done && <p role="status">{done}</p>}
          <div>
            <Button type="submit" disabled={!ready || create.isPending}>{t('mpAjouter')}</Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function PointCard({ point: p }: { point: MeetingPoint }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [instructions, setInstructions] = useState(p.instructions ?? '');
  const [transit, setTransit] = useState(p.transit ?? '');
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (body: { instructions?: string | null; transit?: string | null; active?: boolean }) => api.updateMeetingPoint(p.id, body),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['meeting-points'] });
    },
    onError: (e) => setError(e.message),
  });

  return (
    <li>
      <Card>
        <p className="text-lg font-bold">
          {p.name} <span className="font-normal text-muted">· {p.city}{p.active ? '' : ` · ${t('mpRetire')}`}</span>
        </p>
        <p>{p.address}</p>
        <p className="text-sm text-muted tabular">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
        {!editing && (
          <dl className="mt-2 grid gap-1">
            <div className="flex justify-between gap-4"><dt>{t('mpConsignes')}</dt><dd>{p.instructions ?? t('mpAPreciser')}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('mpTransports')}</dt><dd>{p.transit ?? '—'}</dd></div>
          </dl>
        )}
        {editing && (
          <div className="mt-2 grid gap-3">
            <Field label={t('mpConsignes')}>{({ id }) => <Input id={id} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}</Field>
            <Field label={t('mpTransports')}>{({ id }) => <Input id={id} value={transit} onChange={(e) => setTransit(e.target.value)} />}</Field>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="mt-3 flex flex-wrap gap-2">
          {editing ? (
            <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ instructions: instructions.trim() || null, transit: transit.trim() || null })}>
              {t('mpEnregistrer')}<span className="sr-only"> ({p.name})</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t('mpModifierLesConsignes')}<span className="sr-only"> ({p.name})</span>
            </Button>
          )}
          <Button size="sm" variant={p.active ? 'danger' : 'outline'} disabled={update.isPending} onClick={() => update.mutate({ active: !p.active })}>
            {p.active ? t('mpRetirer') : t('mpRemettre')}<span className="sr-only"> ({p.name})</span>
          </Button>
        </div>
      </Card>
    </li>
  );
}
