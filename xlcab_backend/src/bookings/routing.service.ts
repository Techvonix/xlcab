import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

// Google Routes API (computeRoutes). Clé serveur : GOOGLE_MAPS_API_KEY,
// jamais la clé embarquée dans l'app mobile.
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_TIMEOUT_MS = 5000;

// L'écran de réservation redemande un devis à chaque modification
// (Partie 7, écran 6) : sans cache, chaque changement d'option
// déclencherait un appel Google facturé. 4 décimales ≈ 11 m de précision.
const ROUTE_CACHE_TTL_SECONDS = 15 * 60;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodedPlace {
  address: string;
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  /** Itinéraire routier (voiture). La distance sert au prix : toujours calculée ici. */
  async drivingRoute(origin: LatLng, destination: LatLng): Promise<RouteInfo> {
    const cacheKey = `route:${this.coord(origin)}:${this.coord(destination)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as RouteInfo;

    const route = await this.fetchRoute(origin, destination);
    await this.redis.set(cacheKey, JSON.stringify(route), 'EX', ROUTE_CACHE_TTL_SECONDS);
    return route;
  }

  private async fetchRoute(origin: LatLng, destination: LatLng): Promise<RouteInfo> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.error('GOOGLE_MAPS_API_KEY absente : calcul d’itinéraire impossible');
      throw new ServiceUnavailableException("Calcul d'itinéraire momentanément indisponible");
    }

    let body: any;
    try {
      const res = await fetch(ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Ne demander que les champs utiles (facturation Google au champ).
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          travelMode: 'DRIVE',
        }),
        signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Le détail de l'erreur Google reste dans les logs serveur.
        this.logger.error(`Google Routes a répondu ${res.status}`);
        throw new ServiceUnavailableException("Calcul d'itinéraire momentanément indisponible");
      }
      body = await res.json();
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Appel Google Routes échoué : ${(err as Error).message}`);
      throw new ServiceUnavailableException("Calcul d'itinéraire momentanément indisponible");
    }

    const route = body?.routes?.[0];
    if (!route || typeof route.distanceMeters !== 'number') {
      throw new BadRequestException('Aucun itinéraire routier entre ces deux adresses');
    }
    // Google renvoie la durée sous la forme "5820s".
    const seconds = Number.parseInt(String(route.duration ?? '0'), 10) || 0;
    return {
      distanceKm: Math.round(route.distanceMeters / 100) / 10, // 0,1 km près
      durationMin: Math.round(seconds / 60),
    };
  }

  /**
   * Partie 6 : POST /geocode. Adresse saisie → jusqu'à 5 lieux possibles,
   * limités au pays de la juridiction. Cache 24 h (les adresses bougent
   * peu, chaque appel Google est facturé).
   */
  async geocode(address: string, regionCode: string): Promise<GeocodedPlace[]> {
    const normalized = address.trim().toLowerCase().replace(/\s+/g, ' ');
    const cacheKey = `geocode:${regionCode}:${normalized}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as GeocodedPlace[];

    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.error('GOOGLE_MAPS_API_KEY absente : géocodage impossible');
      throw new ServiceUnavailableException("Recherche d'adresse momentanément indisponible");
    }

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address.trim());
    url.searchParams.set('region', regionCode.toLowerCase());
    url.searchParams.set('components', `country:${regionCode.toUpperCase()}`);
    url.searchParams.set('language', 'fr');
    url.searchParams.set('key', apiKey);

    let body: any;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS) });
      body = await res.json();
    } catch (err) {
      this.logger.error(`Appel Google Geocoding échoué : ${(err as Error).message}`);
      throw new ServiceUnavailableException("Recherche d'adresse momentanément indisponible");
    }
    if (body?.status !== 'OK' && body?.status !== 'ZERO_RESULTS') {
      // Statut Google (ex. REQUEST_DENIED) : logs serveur uniquement.
      this.logger.error(`Google Geocoding : statut ${body?.status}`);
      throw new ServiceUnavailableException("Recherche d'adresse momentanément indisponible");
    }

    const places: GeocodedPlace[] = (body.results ?? [])
      .slice(0, 5)
      .filter((r: any) => typeof r?.geometry?.location?.lat === 'number')
      .map((r: any) => ({
        address: String(r.formatted_address),
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      }));
    await this.redis.set(cacheKey, JSON.stringify(places), 'EX', 24 * 3600);
    return places;
  }

  private coord(p: LatLng): string {
    return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  }
}
