import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

// Onglet Impact : estimation du CO₂ évité par un voyageur en partageant une
// navette plutôt qu'en faisant le même trajet seul en voiture.
//
// Méthode (volontairement prudente) :
//  - référence : chaque voyageur de la réservation aurait pris une voiture
//    thermique, seul — 0,218 kgCO₂e par km (ADEME, comparateur Impact CO₂) ;
//  - navette : 0,29 kgCO₂e par km pour le véhicule entier (minibus diesel de
//    8 places, « CO2 Emissiefactoren » ; pas de fiche ADEME identifiée pour
//    ce gabarit : valeur À CONFIRMER sur la Base Empreinte), partagée entre
//    les voyageurs réellement à bord ;
//  - jamais de valeur négative : une navette occupée par une seule personne
//    n'évite rien, on affiche 0 plutôt qu'un chiffre flatteur.
// Les deux facteurs se règlent sans toucher au code (variables d'environnement).

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const carKgPerKm = () => num(process.env.CO2_CAR_KG_PER_KM, 0.218);
export const shuttleKgPerKm = () => num(process.env.CO2_SHUTTLE_KG_PER_KM, 0.29);

/** Distance routière approchée quand la course n'en porte pas : vol d'oiseau × 1,3. */
export function approxRoadKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3;
}

/**
 * CO₂ évité (kg) par une réservation de [seats] voyageurs sur [km] km, dans
 * une navette qui transporte [onBoard] voyageurs au total.
 */
export function savedKg(km: number, seats: number, onBoard: number): number {
  if (!(km > 0) || seats < 1) return 0;
  const perTraveller = carKgPerKm() - shuttleKgPerKm() / Math.max(onBoard, seats, 1);
  return Math.max(0, perTraveller * seats * km);
}

@Injectable()
export class ImpactService {
  constructor(private prisma: PrismaService) {}

  /** Bilan du voyageur sur ses trajets passager terminés. */
  async summary(userId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { passengerId: userId, type: 'passenger', status: 'completed' },
      select: {
        id: true, distanceKm: true, originLat: true, originLng: true, destinationLat: true, destinationLng: true,
        lineDepartureId: true, passengerBooking: { select: { seats: true } },
      },
    });

    // Lignes régulières : la navette est partagée avec les autres réservations du départ.
    const departureIds = [...new Set(trips.map((t) => t.lineDepartureId).filter((id): id is string => !!id))];
    const departures = departureIds.length
      ? await this.prisma.lineDeparture.findMany({ where: { id: { in: departureIds } }, select: { id: true, seatsBooked: true } })
      : [];
    const onBoardOf = new Map(departures.map((d) => [d.id, d.seatsBooked]));

    let saved = 0;
    let distance = 0;
    for (const t of trips) {
      const seats = t.passengerBooking?.seats ?? 1;
      const km = t.distanceKm != null ? Number(t.distanceKm) : approxRoadKm(t.originLat, t.originLng, t.destinationLat, t.destinationLng);
      const onBoard = t.lineDepartureId ? onBoardOf.get(t.lineDepartureId) ?? seats : seats;
      distance += km;
      saved += savedKg(km, seats, onBoard);
    }

    return {
      savedKg: Math.round(saved * 10) / 10,
      trips: trips.length,
      distanceKm: Math.round(distance),
      // Hypothèses affichées telles quelles à l'utilisateur : pas de chiffre sans sa méthode.
      method: { carKgPerKm: carKgPerKm(), shuttleKgPerKm: shuttleKgPerKm() },
    };
  }
}

@Controller('api/v1/users/me/impact')
@UseGuards(JwtAuthGuard)
export class ImpactController {
  constructor(private impact: ImpactService) {}

  @Get()
  summary(@Req() req: any) {
    return this.impact.summary(req.user.sub);
  }
}

@Module({ controllers: [ImpactController], providers: [ImpactService] })
export class ImpactModule {}
