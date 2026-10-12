import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { memoryPrisma } from '../testing/memory-prisma';
import { SHARE_GRACE_AFTER_END_MS, TripSharingModule } from './trip-sharing';

// Espace sécurité : contacts de confiance et partage du trajet par lien signé.

const JWT_SECRET = 'sharing-secret';
const TRIP = '7d7d0000-0000-4000-8000-000000000001';

describe('Contacts de confiance et partage du trajet (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const mum = { name: 'Maman', phone: '+33 6 12 34 56 78' };
  /** Chemin de la page publique, extrait du lien renvoyé au passager. */
  const pathOf = (url: string) => new URL(url).pathname;

  beforeEach(async () => {
    db = memoryPrisma();

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
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', PUBLIC_API_URL: 'https://api.exemple.test/' })],
        }),
        FakeInfraModule,
        AuthModule,
        TripSharingModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    db.user.rows.push(
      { id: 'p1', email: 'lea@exemple.fr', role: 'passenger', firstName: 'Léa', lastName: 'Martin', phone: '+33600000001', deletedAt: null },
      { id: 'd1', email: 'nadia@exemple.fr', role: 'driver', firstName: 'Nadia', lastName: 'Benali', phone: '+33600000002', deletedAt: null },
    );
    db.vehicle.rows.push({ id: 'v1', driverId: 'd1', brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'AB-123-CD' });
    db.trip.rows.push({
      id: TRIP,
      status: 'accepted',
      passengerId: 'p1',
      driverId: 'd1',
      vehicleId: 'v1',
      originAddress: '12 rue de Courcelles, 75017 Paris',
      destinationAddress: 'Gare de Rouen-Rive-Droite, 76000 Rouen',
      scheduledAt: new Date(Date.now() + 3600_000),
      completedAt: null,
      cancelledAt: null,
    });
    db.trackingPoint.rows.push({ id: 't1', tripId: TRIP, lat: 48.9, lng: 2.2, recordedAt: new Date() });
  });

  afterEach(() => app.close());

  describe('contacts de confiance', () => {
    it('ajout (numéro nettoyé), liste, suppression', async () => {
      const created = await http().post('/api/v1/users/me/contacts').set('Authorization', as('p1')).send(mum);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ id: expect.any(String), name: 'Maman', phone: '+33612345678' });

      const list = await http().get('/api/v1/users/me/contacts').set('Authorization', as('p1'));
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('userId');

      expect((await http().delete(`/api/v1/users/me/contacts/${created.body.id}`).set('Authorization', as('p1'))).status).toBe(200);
      expect(db.trustedContact.rows).toHaveLength(0);
    });

    it('ownership : chacun ne voit et ne supprime que ses contacts', async () => {
      const mine = await http().post('/api/v1/users/me/contacts').set('Authorization', as('p1')).send(mum);
      expect((await http().get('/api/v1/users/me/contacts').set('Authorization', as('p2'))).body).toEqual([]);
      expect((await http().delete(`/api/v1/users/me/contacts/${mine.body.id}`).set('Authorization', as('p2'))).status).toBe(404);
      expect(db.trustedContact.rows).toHaveLength(1);
    });

    it('5 au maximum ; nom et numéro validés ; authentification exigée', async () => {
      for (let i = 0; i < 5; i++) {
        await http().post('/api/v1/users/me/contacts').set('Authorization', as('p1')).send({ name: `Contact ${i}`, phone: `060000000${i}` });
      }
      expect((await http().post('/api/v1/users/me/contacts').set('Authorization', as('p1')).send(mum)).status).toBe(400);
      expect((await http().post('/api/v1/users/me/contacts').set('Authorization', as('p2')).send({ name: '', phone: '0612345678' })).status).toBe(400);
      expect((await http().post('/api/v1/users/me/contacts').set('Authorization', as('p2')).send({ name: 'Karim', phone: 'pas un numéro' })).status).toBe(400);
      expect((await http().post('/api/v1/users/me/contacts').set('Authorization', as('p2')).send({ ...mum, userId: 'p1' })).status).toBe(400);
      expect((await http().get('/api/v1/users/me/contacts')).status).toBe(401);
    });
  });

  describe('partage du trajet', () => {
    it('le passager obtient un lien ; le redemander renvoie le même', async () => {
      const first = await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'));
      expect(first.status).toBe(200);
      expect(first.body.active).toBe(true);
      expect(first.body.url).toMatch(/^https:\/\/api\.exemple\.test\/suivi\/[0-9a-f-]{36}\.[\w-]+$/);

      const second = await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'));
      expect(second.body.url).toBe(first.body.url);
      expect(db.tripShare.rows).toHaveLength(1);
      expect((await http().get(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'))).body.url).toBe(first.body.url);
    });

    it('seul le passager de la course peut la partager (ni un autre client, ni le chauffeur)', async () => {
      expect((await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p2'))).status).toBe(404);
      expect((await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('d1', 'driver'))).status).toBe(404);
      expect((await http().post(`/api/v1/trips/${TRIP}/share`)).status).toBe(401);
      expect(db.tripShare.rows).toHaveLength(0);
    });

    it('un trajet terminé ne se partage plus', async () => {
      db.trip.rows[0].status = 'completed';
      expect((await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'))).status).toBe(409);
    });
  });

  describe('page publique de suivi', () => {
    const share = async () => (await http().post(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'))).body.url as string;

    it('montre le chauffeur, le véhicule et la position, sans donnée sensible', async () => {
      const url = await share();
      const token = pathOf(url).split('/').pop();
      const json = await http().get(`/api/v1/shared-trips/${token}`);
      expect(json.status).toBe(200);
      expect(json.body).toMatchObject({
        status: 'accepted',
        travellerFirstName: 'Léa',
        originArea: expect.stringContaining('Paris'),
        destinationArea: expect.stringContaining('Rouen'),
        driver: { firstName: 'Nadia', vehicle: { plate: 'AB-123-CD' } },
        position: { lat: 48.9, lng: 2.2 },
      });
      // Ni adresse exacte, ni nom de famille, ni téléphone, ni identifiant interne.
      const raw = JSON.stringify(json.body);
      for (const secret of ['rue de Courcelles', 'Martin', 'Benali', '+336', 'p1', 'd1', TRIP]) expect(raw).not.toContain(secret);

      const page = await http().get(pathOf(url)).set('Accept-Language', 'fr-FR');
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.headers['cache-control']).toBe('no-store');
      expect(page.headers['x-robots-tag']).toContain('noindex');
      expect(page.text).toContain('Léa voyage avec XLCAB');
      expect(page.text).toContain('Chauffeur en route');
      expect(page.text).toContain('AB-123-CD');
      expect(page.text).not.toContain('<script');
      expect(page.text).not.toContain('rue de Courcelles');

      const english = await http().get(pathOf(url)).set('Accept-Language', 'en-GB');
      expect(english.text).toContain('Léa is travelling with XLCAB');
    });

    it('avant qu’un chauffeur soit engagé : ni chauffeur ni position', async () => {
      db.trip.rows[0].status = 'pending';
      const token = pathOf(await share()).split('/').pop();
      const json = await http().get(`/api/v1/shared-trips/${token}`);
      expect(json.body.driver).toBeNull();
      expect(json.body.position).toBeNull();
    });

    it('les données venues de la base sont échappées dans la page', async () => {
      db.user.rows[0].firstName = '<img src=x onerror=alert(1)>';
      const page = await http().get(pathOf(await share()));
      expect(page.text).not.toContain('<img');
      expect(page.text).toContain('&lt;img');
    });

    it('lien falsifié, inconnu ou mal formé : 404 identique', async () => {
      const path = pathOf(await share());
      const [id] = path.split('/').pop()!.split('.');
      for (const bad of [`${id}.faux`, `${id}`, 'n-importe-quoi', `7d7d0000-0000-4000-8000-0000000000ff.${'a'.repeat(43)}`]) {
        const res = await http().get(`/suivi/${bad}`);
        expect(res.status).toBe(404);
        expect(res.text).toContain('Lien de suivi indisponible');
        expect((await http().get(`/api/v1/shared-trips/${bad}`)).status).toBe(404);
      }
    });

    it('le passager coupe le partage : le lien s’éteint aussitôt', async () => {
      const path = pathOf(await share());
      expect((await http().delete(`/api/v1/trips/${TRIP}/share`).set('Authorization', as('p1'))).body).toEqual({ active: false, url: null, expiresAt: null });
      expect((await http().get(path)).status).toBe(404);
      // Un nouveau partage donne un NOUVEAU lien : l'ancien reste éteint.
      const again = pathOf(await share());
      expect(again).not.toBe(path);
      expect((await http().get(path)).status).toBe(404);
      expect((await http().get(again)).status).toBe(200);
    });

    it('après la fin du trajet : « terminé » sans position, puis le lien s’éteint', async () => {
      const path = pathOf(await share());
      db.trip.rows[0].status = 'completed';
      db.trip.rows[0].completedAt = new Date();
      const ended = await http().get(path);
      expect(ended.status).toBe(200);
      expect(ended.text).toContain('Trajet terminé');
      expect(ended.text).not.toContain('AB-123-CD');
      expect(ended.text).not.toContain('google.com/maps');

      db.trip.rows[0].completedAt = new Date(Date.now() - SHARE_GRACE_AFTER_END_MS - 1000);
      expect((await http().get(path)).status).toBe(404);
    });

    it('lien expiré : 404', async () => {
      const path = pathOf(await share());
      db.tripShare.rows[0].expiresAt = new Date(Date.now() - 1000);
      expect((await http().get(path)).status).toBe(404);
    });
  });
});
