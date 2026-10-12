import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ROLES_KEY, Roles, RolesGuard } from '../auth/guards/roles.guard';
import { DriverModeController } from '../driver-mode/driver-mode.controller';
import { LineOperationsController } from '../line-bookings/line-bookings.controller';
import { MarketController } from '../market/market.controller';
import { TripsMatchingController } from '../matching/trips-matching.controller';
import { OperatorsController } from '../operators/operators.controller';
import { ParcelsController } from '../parcels/parcels.controller';
import { TripsController } from '../trips/trips.controller';

// Deux applications, un seul serveur : un jeton de l'appli passager ne doit
// ouvrir AUCUNE route de l'appli chauffeur. Ce test lit les décorateurs de
// chaque contrôleur : une route chauffeur ajoutée sans @Roles('driver'), ou
// une restriction retirée, le fait échouer.

type Ctor = new (...args: any[]) => unknown;

/** Méthodes d'un contrôleur qui sont des routes HTTP (décorées @Get, @Post…). */
function routeHandlers(controller: Ctor): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor' && Reflect.getMetadata('path', controller.prototype[name]) !== undefined,
  );
}

/** Rôles exigés pour une route : ceux de la méthode, sinon ceux du contrôleur. */
function rolesOf(controller: Ctor, handler: string): string[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, controller.prototype[handler]) ?? Reflect.getMetadata(ROLES_KEY, controller);
}

function guardsOf(controller: Ctor): unknown[] {
  return Reflect.getMetadata('__guards__', controller) ?? [];
}

describe('Séparation des rôles entre les applications passager et chauffeur', () => {
  describe('contrôleurs entièrement réservés aux chauffeurs', () => {
    const driverOnly: [string, Ctor][] = [
      ['/drivers/me (mode chauffeur)', DriverModeController],
      ['/operators/me (lignes régulières)', OperatorsController],
      ['/operators/me (départs de ligne)', LineOperationsController],
    ];

    it.each(driverOnly)('%s : chaque route exige le rôle driver', (_label, controller) => {
      const handlers = routeHandlers(controller);
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect({ handler, roles: rolesOf(controller, handler) }).toEqual({ handler, roles: ['driver'] });
      }
    });

    it.each(driverOnly)('%s : jeton vérifié puis rôle contrôlé', (_label, controller) => {
      expect(guardsOf(controller)).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    });
  });

  describe('routes chauffeur des contrôleurs partagés', () => {
    // La liste doit être tenue à jour : toute route réservée aux chauffeurs y figure.
    const shared: [string, Ctor, string[]][] = [
      ['/trips (dispatch)', TripsMatchingController, ['accept', 'refuse']],
      ['/trips (course)', TripsController, ['complete', 'start']],
      ['/bookings/parcel', ParcelsController, ['deliver', 'fail', 'pickup']],
      ['/market', MarketController, ['confirm', 'decline', 'feed', 'myOffers', 'propose', 'withdraw']],
    ];

    it.each(shared)('%s : les routes chauffeur sont exactement celles attendues', (_label, controller, expected) => {
      const found = routeHandlers(controller)
        .filter((h) => JSON.stringify(rolesOf(controller, h)) === JSON.stringify(['driver']))
        .sort();
      expect(found).toEqual(expected);
      expect(guardsOf(controller)).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    });
  });

  describe('RolesGuard', () => {
    class Sample {
      @Roles('driver')
      driverRoute() {}

      @Roles('passenger', 'corporate_member', 'corporate_admin')
      clientRoute() {}
    }

    const guard = new RolesGuard(new Reflector());
    const contextFor = (handler: keyof Sample, role: string | undefined) =>
      ({
        getHandler: () => Sample.prototype[handler],
        getClass: () => Sample,
        switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
      }) as unknown as ExecutionContext;

    it('refuse un jeton passager sur une route chauffeur', () => {
      for (const role of ['passenger', 'corporate_member', 'corporate_admin', 'admin', undefined]) {
        expect(guard.canActivate(contextFor('driverRoute', role))).toBe(false);
      }
    });

    it('accepte un jeton chauffeur sur une route chauffeur', () => {
      expect(guard.canActivate(contextFor('driverRoute', 'driver'))).toBe(true);
    });

    it('refuse un jeton chauffeur sur une route réservée aux clients', () => {
      expect(guard.canActivate(contextFor('clientRoute', 'driver'))).toBe(false);
      expect(guard.canActivate(contextFor('clientRoute', 'passenger'))).toBe(true);
    });
  });
});
