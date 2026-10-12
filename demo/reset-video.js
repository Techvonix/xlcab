// Remet les données de démo LOCALES dans l'état de départ d'une prise vidéo, sans tout
// régénérer (les sessions des applis restent ouvertes) :
//  - réservation de Léa sur la ligne Paris–Beauvais annulée (sièges 4 et 5 libérés) ;
//  - sa note du trajet d'hier retirée (il redevient « à noter ») ;
//  - ses partages de trajet effacés (la proposition automatique se rouvre).
// Usage : node demo/reset-video.js    (base locale uniquement)
const { PrismaClient } = require('../xlcab_backend/node_modules/@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || require('fs').readFileSync(__dirname + '/../xlcab_backend/.env', 'utf8'))) {
    throw new Error('Base non locale : rien n’est modifié.');
  }
  const lea = await prisma.user.findFirst({ where: { email: { startsWith: 'lea.' } } });
  if (!lea) throw new Error('Compte de démo de Léa introuvable : relancer prisma/seed-demo.ts');

  // 1. Réservation de ligne de Léa.
  const lineTrips = await prisma.trip.findMany({ where: { passengerId: lea.id, source: 'line' }, include: { passengerBooking: true } });
  for (const t of lineTrips) {
    const seats = t.passengerBooking?.seats ?? 0;
    await prisma.lineSeat.deleteMany({ where: { tripId: t.id } });
    if (t.lineDepartureId && t.status !== 'cancelled') {
      const d = await prisma.lineDeparture.findUnique({ where: { id: t.lineDepartureId } });
      if (d) await prisma.lineDeparture.update({ where: { id: d.id }, data: { seatsBooked: Math.max(0, d.seatsBooked - seats) } });
    }
    await prisma.tripPriceLine.deleteMany({ where: { tripId: t.id } });
    await prisma.passengerBooking.deleteMany({ where: { tripId: t.id } });
    await prisma.notification.deleteMany({ where: { userId: lea.id, type: 'line.booked' } });
    await prisma.trip.delete({ where: { id: t.id } });
  }

  // 2. Note du trajet terminé le plus récent, et moyenne du chauffeur recalculée.
  const last = await prisma.trip.findFirst({ where: { passengerId: lea.id, status: 'completed' }, orderBy: { completedAt: 'desc' } });
  let unrated = 0;
  if (last) {
    unrated = (await prisma.tripRating.deleteMany({ where: { tripId: last.id } })).count;
    const agg = await prisma.tripRating.aggregate({ where: { driverId: last.driverId }, _avg: { stars: true }, _count: true });
    await prisma.driverProfile.update({
      where: { id: last.driverId },
      data: { rating: agg._count > 0 ? Math.round((agg._avg.stars ?? 5) * 100) / 100 : 5, ratingCount: agg._count },
    });
  }

  // 3. Partages de trajet.
  const shares = (await prisma.tripShare.deleteMany({ where: { userId: lea.id } })).count;

  console.log(`prêt : ${lineTrips.length} réservation(s) de ligne annulée(s), ${unrated} note retirée, ${shares} partage(s) effacé(s)`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
