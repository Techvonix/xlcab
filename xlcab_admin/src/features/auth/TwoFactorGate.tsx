import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { logout, twoFactor } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { t } from '@/lib/i18n';

/**
 * Double authentification (Partie 8) : activation au premier accès
 * (QR code à scanner), puis code à 6 chiffres à chaque session.
 */
export function TwoFactorGate() {
  const status = useQuery({ queryKey: ['2fa-status'], queryFn: twoFactor.status, gcTime: 0 });
  const proofValid = status.data?.proofValid === true;

  // Preuve encore valable dans son cookie (rechargement de page) : pas de nouveau code.
  useEffect(() => {
    if (proofValid) useAuth.getState().setTwoFactorVerified(true);
  }, [proofValid]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-4 text-2xl font-bold">{t('doubleAuthentification')}</h1>
        {status.isPending && <p role="status">{t('chargement')}</p>}
        {status.error && <Alert>{status.error.message}</Alert>}
        {status.data && !proofValid && (status.data.enabled ? <VerifyForm /> : <SetupFlow />)}
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => logout()}>
          {t('seDeconnecter')}
        </Button>
      </Card>
    </main>
  );
}

/** Saisie du code à 6 chiffres. */
function CodeForm({ label, submitLabel, onSubmit }: { label: string; submitLabel: string; onSubmit: (code: string) => Promise<void> }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(code)) {
          setError(t('saisissezLes6ChiffresAffiches'));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onSubmit(code);
        } catch (err) {
          setError((err as Error).message);
          setCode('');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <Input
        id={id}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="tabular text-center text-2xl tracking-[0.5em]"
        aria-invalid={Boolean(error)}
      />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={busy}>
        {busy ? t('verification') : submitLabel}
      </Button>
    </form>
  );
}

function VerifyForm() {
  return (
    <>
      <p className="mb-4 text-muted">{t('ouvrezVotreApplicationDAuthentification')}</p>
      <CodeForm label={t('codeA6Chiffres')} submitLabel={t('valider')} onSubmit={twoFactor.verify} />
    </>
  );
}

function SetupFlow() {
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [setup]);

  if (!setup) {
    return (
      <>
        <p className="mb-4">
          {t('laDoubleAuthentificationEstObligatoire')}
        </p>
        {error && <Alert>{error}</Alert>}
        <Button
          className="mt-2 w-full"
          onClick={async () => {
            try {
              setSetup(await twoFactor.setup());
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t('activerLaDoubleAuthentification')}
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal pl-5">
        <li>{t('scannezCeQrCodeAvec')}</li>
        <li>{t('saisissezLeCodeA6')}</li>
      </ol>
      {qr && <img src={qr} alt={t('qrCodeDActivationDe')} className="mx-auto size-[220px]" />}
      <p className="text-sm">
        {t('impossibleDeScannerSaisissezCette')}{' '}
        <code className="tabular break-all font-semibold">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
      </p>
      <CodeForm label={t('codeDeConfirmation')} submitLabel={t('confirmerLActivation')} onSubmit={twoFactor.enable} />
    </div>
  );
}
