import { Global, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { ImpactModule, approxRoadKm, savedKg } from './impact';

// Onglet Impact : CO₂ évité, estimé avec une méthode affichée et prudente.

const JWT_SECRET = 'impact-secret';

describe('Impact CO₂ (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const jwt = new JwtService();
  const as = (sub: string) => `Bearer ${jwt.sign({ sub, role: 'passenger', jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const get = (sub: string) => request(app.getHttpServer()).get('/api/v1/users/me/impact').set('Authorization', as(sub));
  let seq = 0;
  /** Course passager de 100 km (par défaut) avec sa réservation. */
  const trip = (data: Record<string, unknown>, seats = 2) => {
    const id = `t${++seq}`;
    db.trip.rows.push({
      id, type: 'passenger', status: 'completed', passengerId: 'p1', distanceKm: 100, lineDepartureId: null,
      originLat: 48.85, originLng: 2.35, destinationLat: 49.44, destinationLng: 1.09, ...data,
    });
    db.passengerBooking.rows.push({ id: `b${seq}`, tripId: id, seats });
    return id;
  };

  beforeEach(async () => {
    db = memoryPrisma();
    seq = 0;

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: db },
        { provide: RedisService, useValue: new FakeRedis() },
      ],
      exports: [PrismaService, RedisService],
    })
    class FakeInfraModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        ImpactModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('formule : chaque voyageur aurait roulé seul ; la navette est partagée entre ceux à bord', () => {
    // 2 voyageurs, 100 km : 2 × (0,218 − 0,29 / 2) × 100 = 14,6 kg.
    expect(savedKg(100, 2, 2)).toBeCloseTo(14.6, 5);
    // 2 voyageurs dans une navette de ligne qui en transporte 5 : 2 × (0,218 − 0,058) × 100 = 32 kg.
    expect(savedKg(100, 2, 5)).toBeCloseTo(32, 5);
    // Seul dans la navette : rien d'évité, jamais de valeur négative.
    expect(savedKg(100, 1, 1)).toBe(0);
    expect(savedKg(0, 3, 3)).toBe(0);
  });

  it('aucun trajet terminé : zéro, avec la méthode', async () => {
    trip({ status: 'accepted' });
    const res = await get('p1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ savedKg: 0, trips: 0, distanceKm: 0, method: { carKgPerKm: 0.218, shuttleKgPerKm: 0.29 } });
  });

  it('additionne les trajets passager terminés du voyageur, et seulement ceux-là', async () => {
    trip({}); // 14,6 kg
    trip({ lineDepartureId: 'dep1' }); // ligne partagée à 5 : 32 kg
    db.lineDeparture.rows.push({ id: 'dep1', seatsBooked: 5 });
    trip({ status: 'cancelled' });
    trip({ type: 'parcel' });
    trip({ passengerId: 'p2' });
    trip({}, 1); // seul : 0 kg, mais le trajet et sa distance comptent

    const res = await get('p1');
    expect(res.body).toMatchObject({ savedKg: 46.6, trips: 3, distanceKm: 300 });
    expect((await get('p2')).body).toMatchObject({ savedKg: 14.6, trips: 1 });
  });

  it('sans distance enregistrée : distance routière approchée à partir des coordonnées', async () => {
    trip({ distanceKm: null });
    const km = approxRoadKm(48.85, 2.35, 49.44, 1.09);
    expect(km).toBeGreaterThan(130);
    expect(km).toBeLessThan(160);
    const res = await get('p1');
    expect(res.body.distanceKm).toBe(Math.round(km));
    expect(res.body.savedKg).toBeCloseTo(Math.round(savedKg(km, 2, 2) * 10) / 10, 5);
  });

  it('authentification exigée', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/users/me/impact')).status).toBe(401);
  });
});
