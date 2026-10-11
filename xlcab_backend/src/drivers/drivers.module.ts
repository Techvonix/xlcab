import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentStorage, LocalDiskStorage, MemoryDocumentStorage } from './document-storage';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [DriversController],
  providers: [
    DriversService,
    // Disque local en développement ; remplacer par un stockage S3 privé
    // (eu-west-3) en production, sans toucher au reste du module.
    // (en mémoire pendant les tests : rien n'est écrit sur le disque).
    {
      provide: DocumentStorage,
      useFactory: (config: ConfigService) => (process.env.NODE_ENV === 'test' ? new MemoryDocumentStorage() : new LocalDiskStorage(config)),
      inject: [ConfigService],
    },
  ],
  // Le dashboard admin (Module 10) consulte les documents pour les valider.
  exports: [DocumentStorage],
})
export class DriversModule {}
