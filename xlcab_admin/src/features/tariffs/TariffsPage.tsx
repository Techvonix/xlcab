import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatEuros } from '@/lib/format';
import type { ShuttleKey, Tariff, TariffValues } from '@/lib/types';
import { t } from '@/lib/i18n';

const SHUTTLES: { key: ShuttleKey; label: string }[] = [
  { key: 'rose', label: t('navetteRose') },
  { key: 'bleue', label: t('navetteBleue') },
  { key: 'orange', label: t('navetteOrange') },
  { key: 'accessibility', label: t('navetteAccessibilite') },
];

/** Trajet type de la simulation (ordre de grandeur des trajets XLCAB). */
const SAMPLE_KM = 135;
const PARCEL_VAT = 0.2;

// Saisie en euros (virgule acceptée), stockage en centimes.
const euros = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v),
    z.number({ error: t('montantAttendu') }).min(min, t('minimum', { value1: String(min).replace('.', ',') })).max(max, t('maximum', { value1: String(max).replace('.', ',') })),
  );
const schema = z.object({
  rose: euros(0.1, 20),
  bleue: euros(0.1, 20),
  orange: euros(0.1, 20),
  accessibility: euros(0.1, 20),
  childSeat: euros(0, 200),
  wifi: euros(0, 200),
  extraLuggage: euros(0, 200),
  parcelFee: euros(0, 200),
  sharedParcel: euros(1, 200),
  effectiveFrom: z.string(),
  reason: z.string().trim().min(3, t('indiquezLeMotifExHausse')).max(300),
});
const amounts = schema.omit({ effectiveFrom: true, reason: true });
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

const toEuros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const toCents = (eur: number) => Math.round(eur * 100);

function toValues(v: FormOut): TariffValues {
  return {
    ratesPerKm: { rose: toCents(v.rose), bleue: toCents(v.bleue), orange: toCents(v.orange), accessibility: toCents(v.accessibility) },
    childSeatCents: toCents(v.childSeat),
    wifiCents: toCents(v.wifi),
    extraLuggageCents: toCents(v.extraLuggage),
    parcelFeeCents: toCents(v.parcelFee),
    sharedParcelCents: toCents(v.sharedParcel),
  };
}

/**
 * Tarifs réglables : le porteur de projet ajuste les prix selon la
 * concurrence et le carburant. Un tarif n'est jamais modifié : on en publie
 * un nouveau (immédiat ou programmé). Les courses déjà réservées gardent leur prix.
 */
export function TariffsPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['tariffs', 'FR'], queryFn: () => api.tariffs('FR') });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('tarifs')}</h1>
      <Alert tone="info">
        {t('unNouveauTarifSApplique')}
      </Alert>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <TariffForm key={data.current.id ?? 'defaut'} current={data.current} />
          <Scheduled tariffs={data.scheduled} />
          <History tariffs={data.history} />
        </>
      )}
    </div>
  );
}

function TariffForm({ current }: { current: Tariff }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { register, handleSubmit, formState, control, reset } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: {
      rose: toEuros(current.ratesPerKm.rose),
      bleue: toEuros(current.ratesPerKm.bleue),
      orange: toEuros(current.ratesPerKm.orange),
      accessibility: toEuros(current.ratesPerKm.accessibility),
      childSeat: toEuros(current.childSeatCents),
      wifi: toEuros(current.wifiCents),
      extraLuggage: toEuros(current.extraLuggageCents),
      parcelFee: toEuros(current.parcelFeeCents),
      sharedParcel: toEuros(current.sharedParcelCents),
      effectiveFrom: '',
      reason: '',
    },
  });
  const watched = useWatch({ control });
  // Simulation : seuls les montants comptent (pas le motif ni la date).
  const parsed = amounts.safeParse(watched);
  const next = parsed.success ? toValues({ ...parsed.data, effectiveFrom: '', reason: '' }) : null;

  const onSubmit = handleSubmit(async (v) => {
    setNotice(null);
    try {
      await api.createTariff({
        jurisdiction: 'FR',
        ...toValues(v),
        reason: v.reason,
        // Champ datetime-local : heure de Paris saisie, envoyée en ISO.
        ...(v.effectiveFrom ? { effectiveFrom: new Date(v.effectiveFrom).toISOString() } : {}),
        ...(confirmed ? { confirmLargeChange: true } : {}),
      });
      setNeedsConfirm(false);
      setConfirmed(false);
      reset({ ...v, reason: '', effectiveFrom: '' });
      setNotice({ tone: 'success', text: v.effectiveFrom ? t('tarifProgramme') : t('nouveauTarifEnVigueurIl') });
      queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    } catch (e) {
      // 409 : variation de plus de 30 % → confirmation explicite demandée.
      if (e instanceof ApiError && e.status === 409) setNeedsConfirm(true);
      setNotice({ tone: 'error', text: (e as Error).message });
    }
  });

  const e = formState.errors;
  const money = (name: keyof FormIn, label: string, err?: string, hint?: string) => (
    <Field label={label} error={err} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <Input id={id} inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />
      )}
    </Field>
  );

  return (
    <Card>
      <CardTitle>{t('nouveauTarifFrance')}</CardTitle>
      <p className="mb-4 text-sm text-muted">
        {t('enVigueur')} {current.reason}
        {current.effectiveFrom ? t('depuisLe', { value1: formatDateTime(current.effectiveFrom) }) : ''}{t('montantsHt')}
      </p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="mb-2 font-semibold">{t('prixAuKilometreHtKm')}</legend>
          {money('rose', t('navetteRose'), e.rose?.message)}
          {money('bleue', t('navetteBleue'), e.bleue?.message)}
          {money('orange', t('navetteOrange'), e.orange?.message)}
          {money('accessibility', t('navetteAccessibilite'), e.accessibility?.message)}
        </fieldset>
        <fieldset className="grid gap-4 md:grid-cols-3">
          <legend className="mb-2 font-semibold">{t('optionsPassagerHt')}</legend>
          {money('childSeat', t('siegeEnfant'), e.childSeat?.message)}
          {money('wifi', 'Wi-Fi', e.wifi?.message)}
          {money('extraLuggage', t('bagageSupplementaire'), e.extraLuggage?.message)}
        </fieldset>
        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="mb-2 font-semibold">{t('colisHtTva20En')}</legend>
          {money('sharedParcel', t('colisEnNavettePartagee'), e.sharedParcel?.message, t('allerAvecDesPassagersOu'))}
          {money('parcelFee', t('supplementColis'), e.parcelFee?.message, t('ajouteAuPrixKmD'))}
        </fieldset>

        <Simulation current={current} next={next} />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('dateDEffetVideImmediate')} error={e.effectiveFrom?.message} hint={t('heureDeParisProgrammableJusqu')}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="datetime-local" aria-describedby={describedBy} aria-invalid={invalid} {...register('effectiveFrom')} />
            )}
          </Field>
          <Field label={t('motif')} error={e.reason?.message} hint={t('visibleDansLHistoriqueEx')}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('reason')} />}
          </Field>
        </div>

        {needsConfirm && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5" checked={confirmed} onChange={(ev) => setConfirmed(ev.target.checked)} />
            {t('jeConfirmeCetteVariationDe')}
          </label>
        )}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <div>
          <Button type="submit" disabled={formState.isSubmitting || (needsConfirm && !confirmed)}>
            {t('publierLeTarif')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Prix d'un trajet type avant / après, pour vérifier l'ordre de grandeur avant de publier. */
function Simulation({ current, next }: { current: TariffValues; next: TariffValues | null }) {
  const sharedTtc = (item: TariffValues) => Math.round(item.sharedParcelCents * (1 + PARCEL_VAT));
  return (
    <section aria-labelledby="simulation-title">
      <h2 id="simulation-title" className="mb-2 font-semibold">
        {t('simulationTrajetDe')} {SAMPLE_KM} {t('kmExParisRouen')}
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2">{t('prestation')}</th>
            <th scope="col" className="py-2">{t('tarifActuel')}</th>
            <th scope="col" className="py-2">{t('nouveauTarif')}</th>
          </tr>
        </thead>
        <tbody>
          {SHUTTLES.map(({ key, label }) => (
            <tr key={key} className="border-b border-line">
              <th scope="row" className="py-2 font-normal">{label} {t('tva0')}</th>
              <td className="py-2 tabular-nums">{formatEuros(Math.round(SAMPLE_KM * current.ratesPerKm[key]))}</td>
              <td className="py-2 tabular-nums">{next ? formatEuros(Math.round(SAMPLE_KM * next.ratesPerKm[key])) : '—'}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 font-normal">{t('colisEnNavettePartageeTtc')}</th>
            <td className="py-2 tabular-nums">{formatEuros(sharedTtc(current))}</td>
            <td className="py-2 tabular-nums">{next ? formatEuros(sharedTtc(next)) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Scheduled({ tariffs }: { tariffs: Tariff[] }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  if (tariffs.length === 0) return null;
  return (
    <Card>
      <CardTitle>{t('tarifsProgrammes')}</CardTitle>
      {error && <Alert>{error}</Alert>}
      <ul className="flex flex-col gap-3">
        {tariffs.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <span>
              {t('aPartirDu')} {formatDateTime(item.effectiveFrom)} — {item.reason} (Bleue {formatEuros(item.ratesPerKm.bleue)} / km)
            </span>
            <Button
              variant="outline"
              onClick={async () => {
                setError(null);
                try {
                  await api.cancelTariff(item.id!);
                  queryClient.invalidateQueries({ queryKey: ['tariffs'] });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t('annulerCeTarifProgramme')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function History({ tariffs }: { tariffs: Tariff[] }) {
  if (tariffs.length === 0) return null;
  return (
    <Card>
      <CardTitle>{t('historique')}</CardTitle>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2">{t('enVigueurDepuis')}</th>
            <th scope="col" className="py-2">{t('motif')}</th>
            <th scope="col" className="py-2">{t('bleueKm')}</th>
            <th scope="col" className="py-2">{t('colisPartage')}</th>
          </tr>
        </thead>
        <tbody>
          {tariffs.map((item) => (
            <tr key={item.id} className="border-b border-line">
              <td className="py-2">{formatDateTime(item.effectiveFrom)}</td>
              <td className="py-2">{item.reason}</td>
              <td className="py-2 tabular-nums">{formatEuros(item.ratesPerKm.bleue)}</td>
              <td className="py-2 tabular-nums">{formatEuros(item.sharedParcelCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
