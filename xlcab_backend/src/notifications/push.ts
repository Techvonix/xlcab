import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';

// Envoi des notifications push par Firebase Cloud Messaging (API HTTP v1), sans SDK : le serveur
// signe lui-même son jeton d'accès Google avec la clé du compte de service Firebase.
//
// Configuration : FCM_SERVICE_ACCOUNT = le fichier JSON du compte de service, encodé en base64
// (console Firebase → Paramètres du projet → Comptes de service → Générer une clé privée). Sans
// elle, l'envoi est désactivé : les notifications restent lisibles dans la boîte de réception.

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushMessage {
  title: string;
  body: string;
  /** Valeurs texte seulement (contrainte de FCM) : type, identifiants utiles à l'appli. */
  data: Record<string, string>;
}

/** `invalid` : le jeton n'existe plus (appli désinstallée…) — l'appareil est oublié. */
export type PushResult = 'ok' | 'invalid' | 'error';

export interface PushSender {
  readonly enabled: boolean;
  send(token: string, message: PushMessage): Promise<PushResult>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

@Injectable()
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger(FcmPushSender.name);
  private readonly account: ServiceAccount | null = FcmPushSender.readAccount();
  private accessToken: { value: string; expiresAt: number } | null = null;

  get enabled() {
    return this.account !== null;
  }

  private static readAccount(): ServiceAccount | null {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (!raw || process.env.NODE_ENV === 'test') return null;
    try {
      const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccount;
      return json.project_id && json.client_email && json.private_key ? json : null;
    } catch {
      return null;
    }
  }

  /** Jeton d'accès Google (1 h), redemandé 1 min avant son expiration. */
  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt > now + 60) return this.accessToken.value;
    const account = this.account!;
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new Error(`jeton Google refusé (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: now + body.expires_in };
    return body.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushResult> {
    if (!this.account) return 'error';
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: 'HIGH', notification: { channel_id: 'xlcab' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      });
      if (res.ok) return 'ok';
      const text = await res.text();
      // Jeton inconnu ou périmé : l'appareil ne reçoit plus rien, on l'oublie.
      if (res.status === 404 || /UNREGISTERED|registration token/i.test(text)) return 'invalid';
      this.logger.warn(`Push refusé par FCM (${res.status})`);
      return 'error';
    } catch (err) {
      this.logger.warn(`Push non envoyé : ${(err as Error).message}`);
      return 'error';
    }
  }
}
