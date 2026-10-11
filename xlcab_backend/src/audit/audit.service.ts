import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string; // ex. "driver.approve", "document.view", "2fa.verify.failure"
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Journal d'audit (Partie 4 : AuditLog). Trace les actions sensibles :
 * décisions admin, consultation de documents chauffeurs (RGPD), 2FA.
 * Un échec d'écriture est journalisé mais ne bloque pas l'action.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata as object) ?? undefined,
          ipAddress: entry.ipAddress ?? null,
          // Tronqué : un User-Agent peut être arbitrairement long.
          userAgent: entry.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Échec d'écriture du journal d'audit (${entry.action}) : ${(err as Error).message}`);
    }
  }

  /** Contexte HTTP d'une requête (IP, User-Agent). */
  static context(req: { ip?: string; headers?: Record<string, unknown> }) {
    const ua = req.headers?.['user-agent'];
    return { ipAddress: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
