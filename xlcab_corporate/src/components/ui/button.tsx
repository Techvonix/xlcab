import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Bouton (Partie 5) : hauteur ≥ 44 px, rayon 12, léger enfoncement à
// l'appui. Composant au format shadcn/ui.
const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-4 text-base font-semibold transition-transform duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:brightness-95',
        outline: 'border-2 border-line bg-white text-ink hover:bg-surface',
        ghost: 'text-primary hover:bg-surface',
        danger: 'border-2 border-error bg-white text-ink hover:bg-surface',
      },
      size: {
        md: 'h-12',
        sm: 'h-11 px-3 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
