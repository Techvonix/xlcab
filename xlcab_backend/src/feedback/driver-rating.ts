import { PrismaService } from '../prisma/prisma.service';

/** Note par défaut d'un chauffeur sans aucun avis (valeur du schéma). */
const DEFAULT_RATING = 5;

/**
 * Recalcule la note moyenne et le nombre d'avis d'un chauffeur à partir de
 * toutes ses notes (pas d'incrément : reste juste quand l'équipe retire une
 * note abusive). Sans avis : retour à la valeur par défaut, `ratingCount` 0
 * (l'app affiche alors « Nouveau chauffeur »).
 */
export async function recomputeDriverRating(prisma: PrismaService, driverId: string) {
  const agg = await prisma.tripRating.aggregate({ where: { driverId }, _avg: { stars: true }, _count: true });
  const count = agg._count as number;
  const average = count > 0 && agg._avg.stars !== null ? Math.round(agg._avg.stars * 100) / 100 : DEFAULT_RATING;
  await prisma.driverProfile.updateMany({ where: { id: driverId }, data: { rating: average, ratingCount: count } });
  return { rating: average, ratingCount: count };
}
