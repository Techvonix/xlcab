import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Message d'état. Couleur en bordure + icône + texte : l'information
 * n'est jamais portée par la couleur seule (Partie 5).
 */
export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: { border: 'border-error', icon: '⚠', role: 'alert' as const },
    success: { border: 'border-success', icon: '✓', role: 'status' as const },
    info: { border: 'border-bleu', icon: 'ℹ', role: 'status' as const },
  }[tone];
  return (
    <div role={styles.role} className={cn('flex gap-2 rounded-card border-2 bg-white p-3 text-ink', styles.border)}>
      <span aria-hidden="true">{styles.icon}</span>
      <div>{children}</div>
    </div>
  );
}
