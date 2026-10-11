import { Module } from '@nestjs/common';
import { LinesSearchController, OperatorsController } from './operators.controller';
import { LinesService } from './lines.service';

// Bourse de transport, étape 1 : profils opérateurs et lignes régulières.
// LinesService est exporté pour le planificateur (départs à 30 jours) et la
// bourse (réservation de places, étape 2).
@Module({
  controllers: [OperatorsController, LinesSearchController],
  providers: [LinesService],
  exports: [LinesService],
})
export class OperatorsModule {}
