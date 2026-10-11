import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { formatEuros, fullName } from '@/lib/format';
import type { Member } from '@/lib/types';
import { t } from '@/lib/i18n';

/** Gestion d'équipe (Partie 7, écran 14). */
export function TeamPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const members = useQuery({ queryKey: ['members'], queryFn: api.members });

  const remove = useMutation({
    mutationFn: (m: Member) => api.removeMember(m.id),
    onSuccess: (_, m) => {
      setNotice({ tone: 'success', text: t('aEteRetireEDe', { value1: fullName(m) }) });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e) => setNotice({ tone: 'error', text: e.message }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">{t('equipe')}</h1>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <AddMemberForm
        onAdded={(email) => {
          setNotice({ tone: 'success', text: t('aEteAjouteEA', { email }) });
          queryClient.invalidateQueries({ queryKey: ['members'] });
        }}
      />

      <Card>
        <CardTitle>{t('collaborateurs')}</CardTitle>
        {members.isPending && <p role="status">{t('chargement')}</p>}
        {members.error && <Alert>{members.error.message}</Alert>}
        {members.data && (
          <MembersTable
            members={members.data}
            removing={remove.isPending ? remove.variables?.id : undefined}
            onRemove={(m) => {
              if (window.confirm(t('retirerDeLEquipeSes', { value1: fullName(m) }))) {
                remove.mutate(m);
              }
            }}
          />
        )}
      </Card>
    </div>
  );
}

// ── Tableau (TanStack Table) ─────────────────────────────────────────────

const col = createColumnHelper<Member>();

function MembersTable({
  members,
  onRemove,
  removing,
}: {
  members: Member[];
  onRemove: (m: Member) => void;
  removing?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      col.accessor((m) => fullName(m), { id: 'name', header: t('nom') }),
      col.accessor('email', { header: t('email'), cell: (c) => c.getValue() ?? '' }),
      col.accessor('role', {
        header: t('role'),
        cell: (c) => (c.getValue() === 'admin' ? t('administrateur') : t('collaborateur')),
      }),
      col.accessor('costCenter', { header: t('centreDeCout'), cell: (c) => c.getValue() ?? '—' }),
      col.accessor('monthlyLimitCents', {
        header: t('plafondMensuel'),
        cell: (c) => (c.getValue() == null ? t('aucun') : formatEuros(c.getValue()!)),
        sortUndefined: 'last',
      }),
      col.accessor('monthSpendCents', { header: t('depenseDuMois'), cell: (c) => formatEuros(c.getValue()) }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">{t('actions')}</span>,
        cell: ({ row }) =>
          row.original.role === 'admin' ? null : (
            <Button
              variant="danger"
              size="sm"
              disabled={removing === row.original.id}
              onClick={() => onRemove(row.original)}
              aria-label={t('retirer', { value1: fullName(row.original) })}
            >
              {t('retirer2')}
            </Button>
          ),
      }),
    ],
    [onRemove, removing],
  );

  const table = useReactTable({
    data: members,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">{t('collaborateursDuCompteEntreprise')}</caption>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-line">
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className="py-2 pr-4 text-sm font-semibold"
                  >
                    {h.column.getCanSort() ? (
                      <button type="button" className="min-h-11 font-semibold" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span aria-hidden="true">{sorted === 'asc' ? ' ▲' : sorted === 'desc' ? ' ▼' : ''}</span>
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-line">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="tabular py-2 pr-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Ajout d'un collaborateur ─────────────────────────────────────────────

const addSchema = z.object({
  email: z.email(t('adresseEmailInvalide')),
  // Saisie en euros, envoyée en centimes. Vide = pas de plafond.
  limitEuros: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), t('montantEnEurosEx500'))
    .refine((v) => v === '' || Number(v.replace(',', '.')) >= 1, t('auMoins1')),
  costCenter: z.string().trim().max(60, t('n60CaracteresMaximum')),
});
type AddValues = z.infer<typeof addSchema>;

function AddMemberForm({ onAdded }: { onAdded: (email: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, reset } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', limitEuros: '', costCenter: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.addMember({
        email: v.email,
        ...(v.limitEuros ? { monthlyLimitCents: Math.round(Number(v.limitEuros.replace(',', '.')) * 100) } : {}),
        ...(v.costCenter ? { costCenter: v.costCenter } : {}),
      });
      reset();
      onAdded(v.email);
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <Card>
      <CardTitle>{t('ajouterUnCollaborateur')}</CardTitle>
      <p className="mb-4 text-muted">{t('laPersonneDoitDejaAvoir')}</p>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-3">
        <Field label={t('email')} error={formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} {...register('email')} />
          )}
        </Field>
        <Field label={t('plafondMensuel2')} hint={t('facultatif')} error={formState.errors.limitEuros?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('limitEuros')} />
          )}
        </Field>
        <Field label={t('centreDeCout')} hint={t('facultatif')} error={formState.errors.costCenter?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('costCenter')} />
          )}
        </Field>
        {error && (
          <div className="md:col-span-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="md:col-span-3">
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? t('ajout') : t('ajouterALEquipe')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
