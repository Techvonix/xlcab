import { IsUUID } from 'class-validator';

/**
 * POST /api/v1/trips/match
 *
 * Seul l'identifiant de la course est accepté : position, type de
 * navette, nombre de places et juridiction sont relus en base. Le
 * client ne peut pas élargir la recherche ni choisir un chauffeur.
 */
export class MatchTripDto {
  @IsUUID()
  tripId!: string;
}
