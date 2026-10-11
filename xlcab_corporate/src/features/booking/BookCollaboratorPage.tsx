import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { formatDateTime, formatEuros, fullName } from '@/lib/format';
import { SHUTTLES, type CreatedTrip, type GeoPlace, type Quote } from '@/lib/types';
import { AddressSearch } from './AddressSearch';
import { locale, t } from '@/lib/i18n';

// Partie 7 (écran 6) : réservation au moins 2 h à l'avance, 1 à 7 passagers.
const MIN_LEAD_MS = 2 * 3600 * 1000;

const place = z.custom<GeoPlace | null>().refine((p) => p != null, t('adresseRequise'));

const schema = z
  .object({
    memberId: z.string().min(1, t('choisissezUnCollaborateur')),
    origin: place,
    destination: place,
    departure: z
      .string()
      .min(1, t('dateEtHeureRequises'))
      .refine((v) => new Date(v).getTime() >= Date.now() + MIN_LEAD_MS, t('reservationAuMoins2H')),
    shuttleType: z.enum(['rose', 'bleue', 'orange', 'accessibility']),
    seats: z.coerce.number().int().min(1, '1 passager minimum').max(7, '7 passagers maximum'),
    childSeats: z.coerce.number().int().min(0).max(7),
    wifi: z.boolean(),
    extraLuggage: z.boolean(),
    withParcel: z.boolean(),
    costCenter: z.string().trim().max(60),
  })
  .refine((v) => v.childSeats <= v.seats, { path: ['childSeats'], message: t('pasPlusDeSiegesEnfants') });

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

/** "2026-10-01T14:30" (heure locale) minimal pour le champ date. */
function localDateTimeMin(): string {
  const d = new Date(Date.now() + MIN_LEAD_MS);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toPayload(v: FormValues) {
  return {
    origin: { lat: v.origin!.lat, lng: v.origin!.lng },
    destination: { lat: v.destination!.lat, lng: v.destination!.lng },
    originAddress: v.origin!.address,
    destinationAddress: v.destination!.address,
    shuttleType: v.shuttleType,
    scheduledAt: new Date(v.departure).toISOString(),
    seats: v.seats,
    childSeats: v.childSeats,
    wifi: v.wifi,
    extraLuggage: v.extraLuggage,
    withParcel: v.withParcel,
  };
}

/** Réservation pour un collaborateur (Partie 7, écran 14), facturée à l'entreprise. */
export function BookCollaboratorPage() {
  const members = useQuery({ queryKey: ['members'], queryFn: api.members });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [booked, setBooked] = useState<{ trip: CreatedTrip; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'quote' | 'book' | null>(null);

  const { register, control, handleSubmit, watch, formState, reset } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      memberId: '', origin: null, destination: null, departure: '', shuttleType: 'orange',
      seats: 1, childSeats: 0, wifi: false, extraLuggage: false, withParcel: false, costCenter: '',
    },
  });

  // Toute modification rend le devis affiché caduc : on ne réserve jamais
  // sur un prix qui ne correspond plus au formulaire.
  useEffect(() => {
    const sub = watch(() => setQuote(null));
    return () => sub.unsubscribe();
  }, [watch]);

  const onQuote = handleSubmit(async (v) => {
    setError(null);
    setBooked(null);
    setBusy('quote');
    try {
      setQuote(await api.quote(toPayload(v)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  });

  const onBook = handleSubmit(async (v) => {
    setError(null);
    setBusy('book');
    try {
      const trip = await api.book({ memberId: v.memberId, trip: toPayload(v), ...(v.costCenter ? { costCenter: v.costCenter } : {}) });
      const member = members.data?.find((m) => m.id === v.memberId);
      setBooked({ trip, name: member ? fullName(member) : 'le collaborateur' });
      setQuote(null);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  });

  const errors = formState.errors;
  const seats = Number(watch('seats')) || 1;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('reserverPourUnCollaborateur')}</h1>

      {booked && (
        <Alert tone="success">
          {t('courseReserveePour')} {booked.name} le {formatDateTime(booked.trip.scheduledAt)} —{' '}
          {formatEuros(booked.trip.quote.totalCents)} {t('ttcFactureeAVotreEntreprise')}
        </Alert>
      )}

      <form onSubmit={onQuote} noValidate className="flex flex-col gap-6">
        <Card>
          <CardTitle>{t('collaborateur')}</CardTitle>
          <Field label={t('collaborateur')} error={errors.memberId?.message}>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('memberId')}>
                <option value="">{t('choisir')}</option>
                {members.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {fullName(m)} {m.email ? `(${m.email})` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>{t('trajet')}</CardTitle>
          <Controller
            control={control}
            name="origin"
            render={({ field }) => (
              <AddressSearch label={t('depart')} value={field.value ?? null} onSelect={field.onChange} error={errors.origin?.message} />
            )}
          />
          <Controller
            control={control}
            name="destination"
            render={({ field }) => (
              <AddressSearch label={t('arrivee')} value={field.value ?? null} onSelect={field.onChange} error={errors.destination?.message} />
            )}
          />
          <Field label={t('dateEtHeureDeDepart')} hint={t('auMoins2HA')} error={errors.departure?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="datetime-local" min={localDateTimeMin()} aria-describedby={describedBy} aria-invalid={invalid} {...register('departure')} />
            )}
          </Field>
          <Field label={t('navette')} error={errors.shuttleType?.message}>
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...register('shuttleType')}>
                {SHUTTLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('passagers')} error={errors.seats?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="number" min={1} max={7} aria-describedby={describedBy} aria-invalid={invalid} {...register('seats')} />
              )}
            </Field>
            <Field label={t('siegesEnfants')} error={errors.childSeats?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="number" min={0} max={seats} aria-describedby={describedBy} aria-invalid={invalid} {...register('childSeats')} />
              )}
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{t('options')}</legend>
            {(
              [
                ['wifi', t('wiFiABord')],
                ['extraLuggage', t('bagageSupplementaire')],
                ['withParcel', t('colisTva20SurLa')],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5" {...register(name)} />
                {label}
              </label>
            ))}
          </fieldset>
          <Field label={t('centreDeCout')} hint={t('facultatifSinonCeluiDuCollaborateur')} error={errors.costCenter?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('costCenter')} />
            )}
          </Field>
        </Card>

        {error && <Alert>{error}</Alert>}

        {!quote ? (
          <Button type="submit" disabled={busy !== null}>
            {busy === 'quote' ? t('calcul') : t('calculerLePrix')}
          </Button>
        ) : (
          <Card aria-live="polite">
            <CardTitle>{t('recapitulatif')}</CardTitle>
            <p className="tabular">
              {quote.distanceKm.toLocaleString(locale)} {t('kmEnviron')} {quote.durationMin} min
            </p>
            <ul className="my-3 flex flex-col gap-1">
              {quote.vatLines.map((l) => (
                <li key={l.regime} className="tabular flex justify-between gap-4">
                  <span>
                    {l.regime === 'parcel' ? t('colisHt') : t('transportDePersonnesHt')} {t('tva')} {l.ratePercent} % : {formatEuros(l.vatCents)}
                  </span>
                  <span>{formatEuros(l.baseCents)}</span>
                </li>
              ))}
            </ul>
            <p className="tabular flex justify-between border-t border-line pt-2 text-lg font-bold">
              <span>{t('totalTtc')}</span>
              <span>{formatEuros(quote.totalCents)}</span>
            </p>
            <Button className="mt-4 w-full" onClick={onBook} disabled={busy !== null}>
              {busy === 'book' ? t('reservation') : t('reserver', { value1: formatEuros(quote.totalCents) })}
            </Button>
          </Card>
        )}
      </form>
    </div>
  );
}
