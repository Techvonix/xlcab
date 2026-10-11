import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { ApiError, login } from '@/lib/api';
import { XlcabSymbol, XlcabWordmark } from '@/components/brand/XlcabLogo';
import { t } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const schema = z.object({
  email: z.email(t('adresseEmailInvalide')),
  password: z.string().min(1, t('motDePasseRequis')),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('connexionImpossibleReessayezPlusTard'));
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 flex items-center gap-3 text-2xl font-bold">
          <XlcabSymbol size={36} />
          <span>
            <XlcabWordmark height={18} className="mr-2 inline-block align-baseline" /><span className="text-primary">{t('entreprise')}</span>
          </span>
        </h1>
        <p className="mb-6 text-muted">{t('espaceReserveAuxAdministrateursDe')}</p>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label={t('emailProfessionnel')} error={formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" autoComplete="username" aria-describedby={describedBy} aria-invalid={invalid} {...register('email')} />
            )}
          </Field>
          <Field label={t('motDePasse')} error={formState.errors.password?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} aria-invalid={invalid} {...register('password')} />
            )}
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? t('connexion') : t('seConnecter')}
          </Button>
        </form>
        <div className="mt-6 border-t border-line pt-4">
          <LanguageSwitch />
        </div>
      </Card>
    </main>
  );
}
