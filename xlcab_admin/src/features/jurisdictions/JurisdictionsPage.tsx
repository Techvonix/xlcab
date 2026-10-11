import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import type { Jurisdiction } from '@/lib/types';
import { t } from '@/lib/i18n';

const rate = z.coerce.number({ error: t('nombreAttendu') }).min(0, t('entre0Et100')).max(100, t('entre0Et100'));
const schema = z.object({
  vatPassengerRate: rate,
  vatParcelRate: rate,
  minTripKm: z.coerce.number({ error: t('nombreAttendu') }).int(t('nombreEntier')).min(0).max(1000),
  requiresRevtc: z.boolean(),
  requiresVtcCard: z.boolean(),
  leadDpa: z.string().trim().max(60),
});
type Input_ = z.input<typeof schema>;
type Output = z.output<typeof schema>;

/**
 * Configuration des juridictions (Partie 11). Chaque modification est
 * tracée dans le journal d'audit avec l'état précédent.
 */
export function JurisdictionsPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['jurisdictions'], queryFn: api.jurisdictions });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('juridictions')}</h1>
      <Alert tone="info">
        {t('cesParametresSAppliquentImmediatement')}
      </Alert>
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.map((j) => <JurisdictionForm key={j.code} jurisdiction={j} />)}
    </div>
  );
}

function JurisdictionForm({ jurisdiction: j }: { jurisdiction: Jurisdiction }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { register, handleSubmit, formState } = useForm<Input_, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      vatPassengerRate: Number(j.vatPassengerRate),
      vatParcelRate: Number(j.vatParcelRate),
      minTripKm: j.minTripKm,
      requiresRevtc: j.requiresRevtc,
      requiresVtcCard: j.requiresVtcCard,
      leadDpa: j.leadDpa ?? '',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setNotice(null);
    try {
      await api.updateJurisdiction(j.code, v);
      queryClient.invalidateQueries({ queryKey: ['jurisdictions'] });
      setNotice({ tone: 'success', text: t('configurationEnregistree', { code: j.code }) });
    } catch (e) {
      setNotice({ tone: 'error', text: (e as Error).message });
    }
  });

  const e = formState.errors;
  return (
    <Card>
      <CardTitle>
        {j.name} ({j.code})
      </CardTitle>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
        <Field label={t('tvaTransportDePersonnes')} error={e.vatPassengerRate?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('vatPassengerRate')} />}
        </Field>
        <Field label={t('tvaMarchandisesColis')} error={e.vatParcelRate?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('vatParcelRate')} />}
        </Field>
        <Field label={t('distanceMinimaleKm')} error={e.minTripKm?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('minTripKm')} />}
        </Field>
        <Field label={t('autoriteDeProtectionDesDonnees')} error={e.leadDpa?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('leadDpa')} />}
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" {...register('requiresVtcCard')} />
          {t('carteVtcObligatoirePourLes')}
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5" {...register('requiresRevtc')} />
          {t('inscriptionRevtcObligatoire')}
        </label>
        {notice && (
          <div className="md:col-span-2">
            <Alert tone={notice.tone}>{notice.text}</Alert>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" disabled={formState.isSubmitting}>
            {t('enregistrer')} {j.code}
          </Button>
        </div>
      </form>
    </Card>
  );
}
