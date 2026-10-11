import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wrapper injectable du PrismaClient, avec gestion propre du cycle
 * de vie (connexion à l'initialisation du module, déconnexion à
 * l'arrêt). Utilisé par tous les services qui accèdent à PostgreSQL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
