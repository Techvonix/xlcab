import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth-store';
import { lang } from '@/lib/i18n';

// Temps réel (Module 3, WS /ws/tracking) : un admin rejoint automatiquement
// la salle des alertes SOS, et peut suivre n'importe quelle course.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface SosAlert {
  tripId: string;
  userId: string;
  role: string;
  position: { lat: number; lng: number };
  timestamp: number;
  incidentId: string | null;
}

export interface LivePosition {
  tripId: string;
  driverId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

let socket: Socket | null = null;

/** Connexion partagée ; le jeton est relu à chaque (re)connexion. */
export function liveSocket(): Socket {
  if (!socket) {
    socket = io(BASE_URL || undefined, {
      path: '/ws/tracking',
      transports: ['websocket'],
      // locale : messages d'erreur du serveur dans la langue du dashboard.
      auth: (cb) => cb({ token: useAuth.getState().accessToken ?? '', locale: lang }),
    });
  }
  return socket;
}

export function closeLiveSocket() {
  socket?.disconnect();
  socket = null;
}
