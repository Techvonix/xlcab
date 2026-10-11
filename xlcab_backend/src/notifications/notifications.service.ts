import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notifications utilisateur (Partie 4 : Notification). Enregistrées en
 * base (lisibles dans l'app) ; l'envoi push FCM s'ajoutera ici quand le
 * projet Firebase existera (Partie 9, Module 8 : "Notification push à
 * l'approbation").
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async notify(userId: string, type: string, title: string, body: string, data?: Record<string, unknown>) {
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, body, data: (data as object) ?? undefined },
      });
      // TODO(Firebase) : envoi push FCM vers les appareils de l'utilisateur.
    } catch (err) {
      // Une notification ratée ne doit pas annuler la décision qui l'a déclenchée.
      this.logger.error(`Notification non enregistrée (${type}) : ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
