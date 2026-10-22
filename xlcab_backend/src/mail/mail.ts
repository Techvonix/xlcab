import { Global, Injectable, Logger, Module } from '@nestjs/common';

// Envoi d'e-mails transactionnels (mot de passe oublié, plus tard confirmations).
//
// Fournisseur choisi par MAIL_PROVIDER :
// - `sendgrid` : API HTTP de SendGrid (SENDGRID_API_KEY, MAIL_FROM) ;
// - `log` (défaut hors production) : rien n'est envoyé, l'e-mail est écrit dans le journal du
//   serveur pour les démonstrations locales — JAMAIS en production (il contient des codes) ;
// - en tests (NODE_ENV=test) : boîte d'envoi en mémoire (`outbox`) lue par les tests.
// Un envoi raté ne lève jamais : l'appelant a déjà répondu à l'utilisateur.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Tests : e-mails « envoyés ». */
  readonly outbox: MailMessage[] = [];

  get provider(): 'sendgrid' | 'log' | 'memory' | 'none' {
    if (process.env.NODE_ENV === 'test') return 'memory';
    const p = process.env.MAIL_PROVIDER;
    if (p === 'sendgrid') return 'sendgrid';
    if (process.env.NODE_ENV === 'production') return 'none';
    return 'log';
  }

  async send(message: MailMessage): Promise<boolean> {
    try {
      switch (this.provider) {
        case 'memory':
          this.outbox.push(message);
          return true;
        case 'log':
          this.logger.log(`E-mail (non envoyé, MAIL_PROVIDER=log) à ${message.to} — ${message.subject}\n${message.text}`);
          return true;
        case 'none':
          this.logger.error(`E-mail non envoyé (aucun fournisseur configuré) : ${message.subject}`);
          return false;
        case 'sendgrid':
          return await this.sendgrid(message);
      }
    } catch (err) {
      this.logger.error(`E-mail non envoyé (${message.subject}) : ${(err as Error).message}`);
      return false;
    }
  }

  private async sendgrid(message: MailMessage): Promise<boolean> {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!key || !from) {
      this.logger.error('SENDGRID_API_KEY ou MAIL_FROM manquant : e-mail non envoyé');
      return false;
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: from, name: 'XLCAB' },
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.text }],
      }),
    });
    if (!res.ok) {
      this.logger.error(`SendGrid a refusé l'e-mail (${res.status}) : ${message.subject}`);
      return false;
    }
    return true;
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
