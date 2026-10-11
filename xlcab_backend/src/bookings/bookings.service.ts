import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PriceQuote, PricingService } from '../matching/pricing.service';
import { RoutingService } from './routing.service';
import { randomUUID } from 'crypto';
import { CreatePassengerBookingDto, PassengerQuoteDto } from './dto/passenger-quote.dto';

// Partie 7 (écran 6) et Partie 13 : "Réservation possible dès 2h avant".
const MIN_LEAD_TIME_MS = 2 * 60 * 60 * 1000;

// Partie 8 : "100 req/min/user" au global. Le devis est appelé à chaque
// modification du formulaire mais coûte un appel Google : on le limite
// plus strictement. Valeur proposée.
const QUOTE_MAX_PER_MINUTE = 30;

// Valeur proposée : réservations (payées ou non) par heure et par passager.
const BOOKINGS_MAX_PER_HOUR = 10;

export interface PassengerQuoteResponse extends PriceQuote {
  distanceKm: number;
  durationMin: number;
}

export interface CreateTripInput {
  passengerId: string;
  jurisdiction: string;
  dto: CreatePassengerBookingDto;
  corporateId?: string;
  costCenter?: string | null;
  bookedById?: string;
  assertAllowed?: (totalCents: number) => Promise<void>;
  /** "awaiting_payment" pour une course passager prépayée (Stripe). */
  status?: string;
}

export interface CreatedTrip {
  tripId: string;
  status: string;
  scheduledAt: Date | null;
  quote: PassengerQuoteResponse;
}

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private routing: RoutingService,
    private pricing: PricingService,
  ) {}

  /**
   * Historique du passager (écran 4 "derniers trajets", écran 13), du plus
   * récent au plus ancien. Contrat attendu par l'app (TripSummary) :
   * tableau de { id, shuttleType, originAddress, destinationAddress,
   * scheduledAt, status, totalPriceCents, currency }. Les réservations
   * jamais payées (awaiting_payment) n'y figurent pas.
   */
  async history(userId: string, limit = 20, page = 1) {
    const trips = await this.prisma.trip.findMany({
      where: { passengerId: userId, status: { not: 'awaiting_payment' } },
      select: {
        id: true, type: true, shuttleType: true, originAddress: true, destinationAddress: true,
        scheduledAt: true, status: true, totalPriceCents: true, corporateId: true,
        parcelBooking: { select: { id: true } },
      },
      orderBy: { scheduledAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return trips.map(({ corporateId, parcelBooking, ...t }) => ({
      ...t,
      // Envoi de colis : l'app ouvre son suivi (écran 12).
      parcelId: parcelBooking?.id ?? null,
      currency: 'EUR',
      // Course payée par l'entreprise : le passager ne voit pas de montant à régler.
      paidByCompany: corporateId !== null,
    }));
  }

  async quotePassenger(userId: string, dto: PassengerQuoteDto): Promise<PassengerQuoteResponse> {
    await this.enforceQuoteRate(userId);

    // Juridiction du compte (TVA, distance minimale) : relue en base,
    // jamais fournie par le client.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { jurisdiction: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');

    return this.computeQuote(dto, user.jurisdiction);
  }

  /**
   * Crée la course et sa réservation passager, au prix recalculé par le
   * serveur (jamais celui affiché par le client). Utilisé par le portail
   * corporate (POST /corporate/bookings) et, plus tard, par
   * POST /bookings/passenger.
   *
   * [assertAllowed] : contrôle métier appelé avec le prix TTC avant
   * l'écriture (ex. plafond mensuel d'une entreprise).
   */
  async createPassengerTrip(input: CreateTripInput): Promise<CreatedTrip> {
    const { dto } = input;
    const quote = await this.computeQuote(dto, input.jurisdiction);
    if (input.assertAllowed) await input.assertAllowed(quote.totalCents);

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          type: dto.withParcel ? 'mixed' : 'passenger',
          status: input.status ?? 'pending',
          passengerId: input.passengerId,
          shuttleType: dto.shuttleType,
          originAddress: dto.originAddress,
          originLat: dto.origin.lat,
          originLng: dto.origin.lng,
          destinationAddress: dto.destinationAddress,
          destinationLat: dto.destination.lat,
          destinationLng: dto.destination.lng,
          distanceKm: quote.distanceKm,
          durationMin: quote.durationMin,
          scheduledAt: new Date(dto.scheduledAt),
          totalPriceCents: quote.totalCents,
          vatCents: quote.vatCents,
          jurisdiction: input.jurisdiction,
          corporateId: input.corporateId ?? null,
          costCenter: input.costCenter ?? null,
          bookedById: input.bookedById ?? null,
          priceLines: {
            create: quote.vatLines.map((l) => ({
              regime: l.regime,
              baseCents: l.baseCents,
              ratePercent: l.ratePercent,
              vatCents: l.vatCents,
            })),
          },
        },
        select: { id: true, status: true, scheduledAt: true },
      });
      await tx.passengerBooking.create({
        data: {
          tripId: created.id,
          seats: dto.seats,
          childSeats: dto.childSeats ?? 0,
          wifiRequested: dto.wifi ?? false,
          extraLuggage: dto.extraLuggage ?? false,
          // Identifiant opaque du QR code d'embarquement (écran 8).
          qrCode: randomUUID(),
        },
      });
      return created;
    });

    return { tripId: trip.id, status: trip.status, scheduledAt: trip.scheduledAt, quote };
  }

  /**
   * POST /bookings/passenger : réservation d'un passager pour lui-même.
   * La course est créée "en attente de paiement" ; la recherche de
   * chauffeur démarre au paiement confirmé (module Payments).
   */
  async createForPassenger(userId: string, dto: CreatePassengerBookingDto): Promise<CreatedTrip> {
    // Limite les réservations impayées à répétition (spam, tests de cartes).
    const key = `booking:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > BOOKINGS_MAX_PER_HOUR) {
      throw new HttpException('Trop de réservations — réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { jurisdiction: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');

    return this.createPassengerTrip({
      passengerId: userId,
      jurisdiction: user.jurisdiction,
      dto,
      status: 'awaiting_payment',
    });
  }

  /** Règles métier + distance routière + prix. */
  private async computeQuote(dto: PassengerQuoteDto, jurisdiction: string): Promise<PassengerQuoteResponse> {
    // Règles métier vérifiées avant tout appel payant à Google.
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + MIN_LEAD_TIME_MS) {
      throw new BadRequestException('Réservation au moins 2 h à l’avance');
    }
    const childSeats = dto.childSeats ?? 0;
    if (childSeats > dto.seats) {
      throw new BadRequestException('Plus de sièges enfants que de passagers');
    }
    if (dto.origin.lat === dto.destination.lat && dto.origin.lng === dto.destination.lng) {
      throw new BadRequestException('Le départ et l’arrivée sont identiques');
    }

    const route = await this.routing.drivingRoute(dto.origin, dto.destination);

    // La distance minimale (60 km en FR) est vérifiée par PricingService.
    const quote = await this.pricing.estimate({
      distanceKm: route.distanceKm,
      shuttleType: dto.shuttleType,
      type: dto.withParcel ? 'mixed' : 'passenger',
      jurisdiction,
      options: {
        childSeats,
        wifi: dto.wifi ?? false,
        extraLuggage: dto.extraLuggage ?? false,
      },
    });

    return { ...quote, distanceKm: route.distanceKm, durationMin: route.durationMin };
  }

  private async enforceQuoteRate(userId: string) {
    const key = `quote:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > QUOTE_MAX_PER_MINUTE) {
      throw new HttpException(
        'Trop de demandes de devis — patientez une minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
