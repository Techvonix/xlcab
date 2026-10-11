// Partie 13 (CGV) : "Annulation gratuite jusqu'à 24h avant (50 % entre
// 24h et 2h, 100 % < 2h)".

const HOUR = 3600_000;

export interface CancellationFee {
  percent: 0 | 50 | 100;
  feeCents: number;
}

/** Frais d'annulation selon le délai restant avant le départ prévu. */
export function cancellationFee(totalCents: number | null, scheduledAt: Date | null, now = new Date()): CancellationFee {
  const total = totalCents ?? 0;
  // Sans heure de départ connue, on ne facture rien (cas anormal).
  if (!scheduledAt) return { percent: 0, feeCents: 0 };
  const remaining = scheduledAt.getTime() - now.getTime();
  const percent = remaining >= 24 * HOUR ? 0 : remaining >= 2 * HOUR ? 50 : 100;
  return { percent, feeCents: Math.round((total * percent) / 100) };
}
