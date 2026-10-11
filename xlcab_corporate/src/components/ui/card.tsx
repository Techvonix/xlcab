import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Carte (Partie 5) : rayon 16, ombre niveau 1. */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-card border border-line bg-white p-5 shadow-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('mb-3 text-lg font-semibold', className)} {...props} />;
}
