import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Champs de formulaire (Partie 5 : hauteur 56, rayon 12, focus bordure
// 2 px Bleu). Libellé toujours associé, erreur annoncée (aria-invalid +
// aria-describedby + role="alert").

const fieldClass =
  'h-14 w-full rounded-input border border-line bg-white px-4 text-base text-ink focus:border-2 focus:border-bleu focus:outline-none aria-[invalid=true]:border-2 aria-[invalid=true]:border-error';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-ink">
          <span aria-hidden="true" className="text-error">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldClass, className)} {...props} />
));
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldClass, className)} {...props} />
));
Select.displayName = 'Select';
