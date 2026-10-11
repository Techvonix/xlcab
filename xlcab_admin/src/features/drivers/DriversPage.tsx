import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { expiryState, formatDate, formatDateTime, fullName } from '@/lib/format';
import { DOCUMENT_LABELS, SHUTTLE_LABELS, type DriverDocument, type PendingDriver } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Validation des chauffeurs (Partie 9, Module 10). */
export function DriversPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['pending-drivers'], queryFn: api.pendingDrivers });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = data?.find((d) => d.driverId === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('chauffeursAValider')}</h1>
      {notice && <Alert tone="success">{notice}</Alert>}
      {isPending && <p role="status">{t('chargement')}</p>}
      {error && <Alert>{error.message}</Alert>}
      {data?.length === 0 && <p>{t('aucunDossierEnAttente')}</p>}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        {data && data.length > 0 && (
          <ul aria-label={t('dossiersEnAttente')} className="flex flex-col gap-2">
            {data.map((d) => {
              const approved = d.documents.filter((doc) => doc.status === 'approved').length;
              return (
                <li key={d.driverId}>
                  <button
                    type="button"
                    aria-current={d.driverId === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(d.driverId)}
                    className={`w-full rounded-card border bg-white p-4 text-left ${d.driverId === selectedId ? 'border-2 border-primary' : 'border-line'}`}
                  >
                    <span className="block font-semibold">{fullName(d.user)}</span>
                    <span className="block text-sm text-muted">{d.user?.email}</span>
                    <span className="block text-sm text-muted">
                      {approved}/{d.requiredDocuments.length} {t('documentsApprouvesNavette')} {SHUTTLE_LABELS[d.profile.preferredShuttle ?? ''] ?? '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected && (
          <DriverDetail
            key={selected.driverId}
            driver={selected}
            onDone={(message) => {
              setNotice(message);
              setSelectedId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Expiry({ label, date }: { label: string; date: string | null | undefined }) {
  const state = expiryState(date);
  const text = { expired: t('expire'), soon: t('expireBientot'), ok: '', missing: t('nonRenseigne') }[state];
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className={state === 'expired' || state === 'missing' ? 'font-bold' : ''}>
        {formatDate(date)} {text && <span>({text})</span>}
      </dd>
    </div>
  );
}

function DriverDetail({ driver, onDone }: { driver: PendingDriver; onDone: (message: string) => void }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pending-drivers'] });
  const [roseEligible, setRoseEligible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  const allApproved = driver.requiredDocuments.every((type) => driver.documents.some((d) => d.type === type && d.status === 'approved'));
  const name = fullName(driver.user);

  const approve = useMutation({
    mutationFn: () => api.approveDriver(driver.driverId, roseEligible),
    onSuccess: () => {
      refresh();
      onDone(t('estValideECommeChauffeur', { name }));
    },
    onError: (e) => setError(e.message),
  });
  const reject = useMutation({
    mutationFn: () => api.rejectDriver(driver.driverId, rejectReason.trim()),
    onSuccess: () => {
      refresh();
      onDone(t('dossierDeRefuseLeMotif', { name }));
    },
    onError: (e) => setError(e.message),
  });

  const v = driver.vehicle;
  return (
    <section aria-label={t('dossierDe', { name })} className="flex flex-col gap-4">
      <Card>
        <CardTitle>{name}</CardTitle>
        <dl className="grid gap-1">
          <div className="flex justify-between gap-4"><dt>{t('email')}</dt><dd>{driver.user?.email}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('telephone')}</dt><dd>{driver.user?.phone ?? '—'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('inscritLe')}</dt><dd>{formatDate(driver.user?.createdAt)}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('langues')}</dt><dd>{driver.profile.languages.join(', ')}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('formePmr')}</dt><dd>{driver.profile.pmrTrained ? 'oui' : 'non'}</dd></div>
          <div className="flex justify-between gap-4"><dt>{t('nPermis')}</dt><dd>{driver.profile.licenseNumber ?? '—'}</dd></div>
          <Expiry label={t('expirationDuPermis')} date={driver.profile.licenseExpiry} />
          <div className="flex justify-between gap-4"><dt>{t('nCarteVtc')}</dt><dd>{driver.profile.vtcCardNumber ?? '—'}</dd></div>
          <Expiry label={t('expirationCarteVtc')} date={driver.profile.vtcCardExpiry} />
          <div className="flex justify-between gap-4"><dt>{t('nRevtc')}</dt><dd>{driver.profile.revtcNumber ?? '—'}</dd></div>
        </dl>
      </Card>

      {v && (
        <Card>
          <CardTitle>{t('vehicule')}</CardTitle>
          <dl className="grid gap-1">
            <div className="flex justify-between gap-4"><dt>{t('modele')}</dt><dd>{[v.brand, v.model, v.color].filter(Boolean).join(' · ')}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('immatriculation')}</dt><dd className="font-semibold">{v.plate}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('places')}</dt><dd>{v.capacity}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('navette')}</dt><dd>{SHUTTLE_LABELS[v.shuttleType] ?? v.shuttleType}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('equipePmr')}</dt><dd>{v.pmrEquipped ? 'oui' : 'non'}</dd></div>
            <div className="flex justify-between gap-4"><dt>{t('dashcamDeclaree')}</dt><dd>{v.dashcamActive ? 'oui' : 'non'}</dd></div>
            <Expiry label={t('echeanceAssurance')} date={v.insuranceExpiry} />
            <Expiry label={t('echeanceControleTechnique')} date={v.technicalControlExpiry} />
          </dl>
        </Card>
      )}

      <Card>
        <CardTitle>{t('documents')}</CardTitle>
        <ul className="flex flex-col gap-3">
          {driver.requiredDocuments.map((type) => {
            const doc = driver.documents.find((d) => d.type === type);
            return <DocumentRow key={type} type={type} doc={doc} driverId={driver.driverId} onChange={refresh} />;
          })}
          {driver.documents
            .filter((d) => !driver.requiredDocuments.includes(d.type))
            .map((d) => (
              <DocumentRow key={d.id} type={d.type} doc={d} driverId={driver.driverId} onChange={refresh} />
            ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>{t('decision')}</CardTitle>
        {error && <Alert>{error}</Alert>}
        <label className="my-3 flex min-h-11 items-start gap-3">
          <input type="checkbox" className="mt-1 size-5" checked={roseEligible} onChange={(e) => setRoseEligible(e.target.checked)} />
          <span>
            {t('habiliterPourLaNavetteRose')}
            {driver.profile.preferredShuttle === 'rose' && <strong> {t('navetteDemandeeParLaCandidate')}</strong>}
          </span>
        </label>
        {!allApproved && <p className="mb-2 text-muted">{t('approuvezDAbordTousLes')}</p>}
        <Button disabled={!allApproved || approve.isPending} onClick={() => approve.mutate()}>
          {approve.isPending ? t('validation') : t('validerLeChauffeur')}
        </Button>

        <hr className="my-5 border-line" />
        <label htmlFor={reasonId} className="font-semibold">
          {t('motifDeRefusCommuniqueAu')}
        </label>
        <textarea
          id={reasonId}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-input border border-line p-3 focus:border-2 focus:border-bleu focus:outline-none"
        />
        <Button variant="danger" className="mt-2" disabled={rejectReason.trim().length < 10 || reject.isPending} onClick={() => reject.mutate()}>
          {t('refuserLeDossier')}
        </Button>
      </Card>
    </section>
  );
}

function DocumentRow({ type, doc, driverId, onChange }: { type: string; doc?: DriverDocument; driverId: string; onChange: () => void }) {
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const label = DOCUMENT_LABELS[type] ?? type;

  // Libère l'URL locale du fichier quand l'aperçu est fermé.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const review = useMutation({
    mutationFn: (status: 'approved' | 'rejected') => api.reviewDocument(driverId, doc!.id, status, status === 'rejected' ? reason.trim() : undefined),
    onSuccess: () => {
      setRejecting(false);
      onChange();
    },
    onError: (e) => setError(e.message),
  });

  if (!doc) {
    return (
      <li className="rounded-card border border-line p-3">
        <span className="font-semibold">{label}</span> — <strong>non fourni</strong>
      </li>
    );
  }

  const statusText = { pending: t('aVerifier'), approved: t('approuve'), rejected: t('refuse') }[doc.status];

  return (
    <li className="rounded-card border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold">{label}</span> — {statusText}
          <span className="block text-sm text-muted">{t('recuLe')} {formatDateTime(doc.uploadedAt)}</span>
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t('voir', { label })}
            onClick={async () => {
              setError(null);
              try {
                const blob = await api.documentFile(driverId, doc.id);
                setPreview({ url: URL.createObjectURL(blob), mime: doc.mimeType });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {t('voir2')}
          </Button>
          {doc.status !== 'approved' && (
            <Button size="sm" aria-label={t('approuver', { label })} disabled={review.isPending} onClick={() => review.mutate('approved')}>
              {t('approuver2')}
            </Button>
          )}
          {doc.status !== 'rejected' && (
            <Button variant="danger" size="sm" aria-label={t('refuser', { label })} onClick={() => setRejecting(true)}>
              {t('refuser2')}
            </Button>
          )}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {rejecting && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="text-sm font-semibold">
            {t('motifCommuniqueAuCandidat')}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-11 w-full rounded-input border border-line px-3 font-normal"
            />
          </label>
          <Button variant="danger" size="sm" disabled={!reason.trim() || review.isPending} onClick={() => review.mutate('rejected')}>
            {t('confirmerLeRefus')}
          </Button>
        </div>
      )}
      {preview && (
        <div className="mt-3">
          {preview.mime.startsWith('image/') ? (
            <img src={preview.url} alt={`${label} du candidat`} className="max-h-[600px] rounded-input border border-line" />
          ) : (
            <a href={preview.url} download={`${type}.pdf`} className="font-semibold text-primary underline">
              {t('telechargerLePdf')}
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
            {t('fermerLApercu')}
          </Button>
        </div>
      )}
    </li>
  );
}
