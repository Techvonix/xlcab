import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketUser, TrackingService } from './tracking.service';
import { LocalizedWsExceptionFilter, socketMessage } from '../i18n/localized-exception.filter';
import {
  ChatMessageDto,
  DriverLocationDto,
  SosDto,
  TripRefDto,
} from './dto/tracking.dto';

// Salles Socket.io
export const ADMIN_ROOM = 'admin:room';
export const tripRoom = (tripId: string) => `trip:${tripId}`;
export const driverRoom = (driverId: string) => `driver:${driverId}`; // missions (Partie 7, écran 15)
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Partie 8 : "CORS strict". Liste blanche via CORS_ORIGINS (séparées
 * par des virgules). Les apps Flutter n'envoient pas d'en-tête Origin :
 * elles passent. Le CORS ne protège que des navigateurs tiers ; la
 * vraie barrière reste l'authentification JWT au handshake.
 */
export function isOriginAllowed(origin: string | undefined, allowList: string[]): boolean {
  if (!origin) return true;
  return allowList.includes(origin);
}

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// Validation stricte des messages entrants. Une erreur de validation
// devient une WsException (sinon le client reçoit "Internal server error").
const wsValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: () => new WsException('Données invalides'),
});

type AuthedSocket = Socket & { data: { user?: SocketUser; expiryTimer?: NodeJS.Timeout } };

/**
 * Suivi temps réel — contrat de la Partie 6 :
 *   WS /ws/tracking
 *   → subscribe:trip { tripId }
 *   ← position { lat, lng, heading, speed, eta }
 *   ← status { status }
 *   ← message { from, text }
 *   ← sos { alert }            (admins uniquement)
 *
 * Connexion client : io(URL, { path: '/ws/tracking', auth: { token } }).
 */
@UsePipes(wsValidationPipe)
// Erreurs renvoyées dans la langue de l'app (auth.locale), voir src/i18n.
@UseFilters(new LocalizedWsExceptionFilter())
@WebSocketGateway({
  path: '/ws/tracking',
  cors: {
    // Fonction évaluée à chaque requête : process.env est alors chargé
    // par ConfigModule (ce qui n'est pas le cas au moment du décorateur).
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isOriginAllowed(origin, parseOrigins(process.env.CORS_ORIGINS))),
  },
  // Les messages légitimes font quelques centaines d'octets.
  maxHttpBufferSize: 16 * 1024,
})
export class TrackingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(private tracking: TrackingService) {}

  // ── Cycle de vie ────────────────────────────────────────────────────

  /**
   * L'authentification se fait dans un middleware Socket.io, AVANT que
   * la connexion ne soit acceptée. Dans le code de départ, elle avait
   * lieu dans handleConnection : la socket existait déjà et pouvait
   * envoyer des messages pendant la vérification du token.
   */
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        // Token uniquement dans handshake.auth : jamais en query string
        // (elle finit dans les logs Nginx).
        socket.data.user = await this.tracking.authenticate(socket.handshake.auth?.token);
        next();
      } catch {
        next(new Error(socketMessage(socket, 'Non autorisé')));
      }
    });
  }

  handleConnection(client: AuthedSocket) {
    const user = client.data.user;
    if (!user) {
      // Ne devrait pas arriver (middleware), mais on ne suppose rien.
      client.disconnect(true);
      return;
    }

    client.join(userRoom(user.userId));
    if (user.role === 'driver') client.join(driverRoom(user.userId));
    if (user.role === 'admin') client.join(ADMIN_ROOM);

    // Une socket peut rester ouverte des heures : on la coupe à
    // l'expiration de l'access token (15 min). Le client se reconnecte
    // avec un token rafraîchi — la blacklist et le compte sont alors
    // revérifiés.
    const msLeft = user.tokenExp * 1000 - Date.now();
    if (msLeft <= 0) {
      client.disconnect(true);
      return;
    }
    client.data.expiryTimer = setTimeout(() => {
      client.emit('auth:expired');
      client.disconnect(true);
    }, msLeft);
  }

  async handleDisconnect(client: AuthedSocket) {
    if (client.data.expiryTimer) clearTimeout(client.data.expiryTimer);

    const user = client.data.user;
    if (user?.role !== 'driver') return;

    // Un chauffeur peut avoir plusieurs sockets (reconnexion en cours) :
    // on ne le retire du géo-index que s'il n'en reste aucune.
    const remaining = await this.server.in(driverRoom(user.userId)).fetchSockets();
    if (remaining.length === 0) {
      await this.tracking.removeDriverFromIndex(user.userId);
    }
  }

  // ── Abonnement à une course ─────────────────────────────────────────

  @SubscribeMessage('subscribe:trip')
  async onSubscribe(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: TripRefDto) {
    const user = this.requireUser(client);

    // Partie 8 : ownership. Seuls le passager, le chauffeur de la course
    // ou un admin peuvent suivre la position.
    const trip = await this.tracking.findAccessibleTrip(user, dto.tripId, {
      allowAdmin: true,
    });
    if (!trip) throw new WsException('Trajet introuvable ou accès refusé');

    await client.join(tripRoom(trip.id));
    return { subscribed: true, tripId: trip.id };
  }

  @SubscribeMessage('unsubscribe:trip')
  async onUnsubscribe(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: TripRefDto) {
    this.requireUser(client);
    await client.leave(tripRoom(dto.tripId));
    return { unsubscribed: true, tripId: dto.tripId };
  }

  // ── Position chauffeur ──────────────────────────────────────────────

  @SubscribeMessage('driver:location')
  async onLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: DriverLocationDto,
  ) {
    const user = this.requireUser(client);
    if (user.role !== 'driver') throw new WsException('Réservé aux chauffeurs');

    if (!(await this.tracking.acceptLocation(user.userId))) {
      return { accepted: false, reason: 'throttled' };
    }

    const tripId = await this.tracking.recordDriverLocation(user.userId, dto);
    if (tripId) {
      this.server.to(tripRoom(tripId)).emit('position', {
        tripId,
        driverId: user.userId, // toujours issu du token, jamais du client
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading ?? null,
        speed: dto.speed ?? null,
        // TODO(Module routing) : ETA via Google Directions (POST /route).
        eta: null,
        timestamp: Date.now(),
      });
      await this.tracking.saveTrackingPoint(tripId, user.userId, dto);
    }
    return { accepted: true };
  }

  // ── Chat passager ↔ chauffeur ───────────────────────────────────────

  @SubscribeMessage('message')
  async onMessage(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: ChatMessageDto) {
    const user = this.requireUser(client);

    const trip = await this.tracking.findAccessibleTrip(user, dto.tripId);
    if (!trip) throw new WsException('Trajet introuvable ou accès refusé');

    if (!(await this.tracking.allowMessage(user.userId))) {
      throw new WsException('Trop de messages — patientez une minute');
    }

    // "from" est déterminé par le serveur. Le texte est transmis brut :
    // les clients doivent l'afficher comme texte, jamais comme HTML.
    this.server.to(tripRoom(trip.id)).emit('message', {
      tripId: trip.id,
      from: { id: user.userId, role: user.role },
      text: dto.text,
      timestamp: Date.now(),
    });
    return { sent: true };
  }

  // ── SOS ─────────────────────────────────────────────────────────────

  @SubscribeMessage('sos')
  async onSos(@ConnectedSocket() client: AuthedSocket, @MessageBody() dto: SosDto) {
    const user = this.requireUser(client);

    // Autorisé même sur une course tout juste terminée (dépose).
    const trip = await this.tracking.findAccessibleTrip(user, dto.tripId, {
      allowTerminal: true,
    });
    if (!trip) throw new WsException('Trajet introuvable ou accès refusé');

    // SOS répétés : déjà signalés, on acquitte sans rediffuser.
    if (!(await this.tracking.allowSos(user.userId))) {
      return { received: true };
    }

    const alert = {
      tripId: trip.id,
      userId: user.userId,
      role: user.role,
      position: { lat: dto.lat, lng: dto.lng },
      timestamp: Date.now(),
    };

    // Enregistré comme incident (suivi dans le dashboard admin, même si
    // aucun admin n'est connecté à cet instant), puis diffusé.
    const incidentId = await this.tracking.queueSos(alert);
    // Admins uniquement : diffuser dans la salle du trajet préviendrait
    // l'autre partie — potentiellement celle qui menace l'émetteur.
    this.server.to(ADMIN_ROOM).emit('sos', { alert: { ...alert, incidentId } });
    this.logger.warn(`SOS reçu pour le trajet ${trip.id}`);
    return { received: true };
  }

  // ── API interne pour les autres modules ─────────────────────────────

  /** À appeler par le module Trips (accept / start / complete / cancel). */
  emitTripStatus(tripId: string, status: string) {
    this.server.to(tripRoom(tripId)).emit('status', {
      tripId,
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * Message privé à un chauffeur (toutes ses sockets ouvertes). Utilisé
   * par le dispatch pour les missions (Partie 7, écran 15 : "Missions
   * via WebSocket driver:{id}").
   */
  emitToDriver(driverId: string, event: string, payload: object) {
    this.server.to(driverRoom(driverId)).emit(event, payload);
  }

  // ── Utilitaires ─────────────────────────────────────────────────────

  private requireUser(client: AuthedSocket): SocketUser {
    const user = client.data.user;
    if (!user) throw new WsException('Non autorisé');
    return user;
  }
}
