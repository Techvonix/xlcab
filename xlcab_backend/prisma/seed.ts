import { PrismaClient } from '@prisma/client';

// Données de référence des juridictions. Lancer après la migration :
//   npx prisma db seed
//
// Seule la France est renseignée : la spec ne chiffre pas les autres
// pays (IE, ES, IT, DE, PT). Ne pas les inventer — le matching et le
// calcul de prix refusent une juridiction absente de cette table.

const prisma = new PrismaClient();

async function main() {
  const fr = {
    name: 'France',
    vatPassengerRate: 0, // Partie 11.4 : exonéré (art. 261-4-4° CGI)
    vatParcelRate: 20, // Partie 11.4
    requiresRevtc: true, // Partie 11.2
    requiresVtcCard: true, // Partie 11.2
    minTripKm: 60, // Partie 13 : "Distance min 60 km (FR)"
    financialGuaranteePerVehicleCents: 150_000, // Partie 11.2 : 1 500 €/véhicule
    currency: 'EUR',
    leadDpa: 'DPC', // Partie 8 : DPC Irlande (lead) + CNIL (mention FR)
  };

  await prisma.jurisdictionConfig.upsert({
    where: { code: 'FR' },
    create: { code: 'FR', ...fr },
    update: fr,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
