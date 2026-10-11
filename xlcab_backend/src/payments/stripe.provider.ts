import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

/**
 * Client Stripe (clé SECRÈTE serveur, STRIPE_SECRET_KEY). null si la clé
 * n'est pas configurée : les paiements répondent alors "indisponible"
 * au lieu de faire planter l'API.
 */
export const stripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    if (!key) return null;
    return new Stripe(key, {
      // Nouvelles tentatives automatiques sur erreur réseau (requêtes
      // rendues sûres par les clés d'idempotence).
      maxNetworkRetries: 2,
      timeout: 10_000,
    });
  },
};
