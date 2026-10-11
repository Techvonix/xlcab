import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.service';
import { NotificationsModule } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DocumentStorage } from '../drivers/document-storage';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStorage, JPEG } from '../testing/drivers-fakes';
import { memoryPrisma } from '../testing/memory-prisma';
import { base32Decode, hotp, timeStep } from '../two-factor/totp';
import { AdminModule } from './admin.module';

// Dashboard admin de bout en bout : vrai HTTP, guards JWT + rôle + 2FA,
// vrais codes TOTP. Base, Redis et stockage des documents simulés.

const JWT_SECRET = 'admin-secret';
const inDays = (d: number) => new Date(Date.now() + d * 86400_000);
// Identifiant réel (UUID) : les routes refusent tout identifiant mal formé.
const CAND = 'c0ffee00-0000-4000-8000-000000000001';
const REQUIRED = ['vehicle_registration', 'vehicle_insurance', 'technical_control', 'driving_license', 'vtc_card'];

describe('Dashboard admin (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let storage: FakeStorage;
  let clock: number;
  const jwt = new JwtService();

  const bearer = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());

  /** Avance l'horloge d'un pas TOTP (30 s) : nouveau code valide. */
  const tick = () => {
    clock += 30_000;
  };
  const codeFor = (secret: string) => hotp(base32Decode(secret), timeStep(Math.floor(clock / 1000)));

  /** Active la 2FA d'un admin et renvoie { secret, proof }. */
  async function enrol(sub = 'ops', role = 'admin') {
    const setup = await http().post('/api/v1/auth/2fa/setup').set('Authorization', bearer(sub, role));
    expect(setup.status).toBe(200);
    const enable = await http()
      .post('/api/v1/auth/2fa/enable')
      .set('Authorization', bearer(sub, role))
      .send({ code: codeFor(setup.body.secret) });
    expect(enable.status).toBe(200);
    return { secret: setup.body.secret as string, proof: enable.body.twoFactorToken as string };
  }

  const admin = (proof: string) => ({ Authorization: bearer('ops', 'admin'), 'X-2FA-Token': proof });

  function seedCandidate() {
    db.user.rows.push({ id: CAND, email: 'nadia@x.fr', role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: 'Nadia', lastName: 'Benali', createdAt: new Date() });
    db.driverProfile.rows.push({
      id: CAND, approvedAt: null, documentsVerified: false, roseEligible: false, pmrTrained: false, languages: ['fr'],
      licenseNumber: '12AB', licenseExpiry: inDays(400), vtcCardNumber: 'VTC1', vtcCardExpiry: inDays(300), preferredShuttle: 'rose',
    });
    db.vehicle.rows.push({
      id: 'veh-1', driverId: CAND, shuttleType: 'rose', plate: 'AB-123-CD', capacity: 8, isAvailable: false,
      insuranceExpiry: inDays(200), technicalControlExpiry: inDays(200), jurisdiction: 'FR',
    });
    REQUIRED.forEach((type, i) => {
      const id = `00000000-0000-4000-8000-00000000000${i}`;
      db.driverDocument.rows.push({ id, userId: CAND, type, status: 'pending', storageKey: `key-${i}`, mimeType: 'image/jpeg', sizeBytes: 8, sha256: 'x', uploadedAt: new Date() });
      storage.files.set(`key-${i}`, JPEG);
    });
  }

  beforeEach(async () => {
    clock = 1_790_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    db = memoryPrisma();
    storage = new FakeStorage();
    db.user.rows.push(
      { id: 'ops', email: 'ops@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null, passwordHash: 'NE-DOIT-PAS-SORTIR', createdAt: new Date() },
      { id: 'boss', email: 'boss@acme.fr', role: 'corporate_admin', jurisdiction: 'FR', deletedAt: null, createdAt: new Date() },
    );

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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', TWO_FACTOR_ENC_KEY: randomBytes(32).toString('base64') })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        AdminModule,
      ],
    })
      .overrideProvider(DocumentStorage)
      .useValue(storage)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  // ── Double authentification ─────────────────────────────────────────

  describe('2FA (Partie 8)', () => {
    it('sans preuve 2FA, aucun endpoint admin n’est accessible', async () => {
      const res = await http().get('/api/v1/admin/analytics').set('Authorization', bearer('ops', 'admin'));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TWO_FACTOR_REQUIRED');
    });

    it('activation par code TOTP puis accès au dashboard', async () => {
      const { proof } = await enrol();
      const res = await http().get('/api/v1/admin/analytics').set(admin(proof));
      expect(res.status).toBe(200);
      const status = await http().get('/api/v1/auth/2fa/status').set('Authorization', bearer('ops', 'admin'));
      expect(status.body).toEqual({ enabled: true, required: true, proofValid: false });
    });

    it('le secret est chiffré en base', async () => {
      const { secret } = await enrol();
      const stored = db.twoFactorAuth.rows[0].secretEnc as string;
      expect(stored).not.toContain(secret);
      expect(stored).not.toContain(base32Decode(secret).toString('base64'));
    });

    it('portail web : preuve en cookie HttpOnly (absente du corps), acceptée par le garde, proofValid=true', async () => {
      const { secret } = await enrol();
      tick();
      const res = await http()
        .post('/api/v1/auth/2fa/verify')
        .set('Authorization', bearer('ops', 'admin'))
        .set('X-Client', 'web')
        .send({ code: codeFor(secret) });
      expect(res.status).toBe(200);
      expect(res.body.twoFactorToken).toBeUndefined();
      const raw = res.headers['set-cookie'] as unknown as string[];
      const cookie = raw.find((c) => c.startsWith('xlcab_2fa='))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api/);

      const pair = cookie.split(';')[0];
      const status = await http().get('/api/v1/auth/2fa/status').set('Authorization', bearer('ops', 'admin')).set('Cookie', pair);
      expect(status.body.proofValid).toBe(true);
      const dash = await http().get('/api/v1/admin/analytics').set('Authorization', bearer('ops', 'admin')).set('Cookie', pair);
      expect(dash.status).toBe(200);
      // Sans cookie ni en-tête : toujours refusé.
      expect((await http().get('/api/v1/admin/analytics').set('Authorization', bearer('ops', 'admin'))).status).toBe(403);
    });

    it('vérification à la connexion suivante ; un code déjà utilisé est refusé (anti-rejeu)', async () => {
      const { secret } = await enrol();
      tick();
      const code = codeFor(secret);
      const ok = await http().post('/api/v1/auth/2fa/verify').set('Authorization', bearer('ops', 'admin')).send({ code });
      expect(ok.status).toBe(200);
      const replay = await http().post('/api/v1/auth/2fa/verify').set('Authorization', bearer('ops', 'admin')).send({ code });
      expect(replay.status).toBe(403);
      expect(replay.body.code).toBe('INVALID_TWO_FACTOR_CODE');
    });

    it('mauvais codes : 403 (pas 401, qui déconnecterait le client), puis blocage au-delà de 5 essais (429)', async () => {
      await enrol();
      tick();
      for (let i = 0; i < 5; i++) {
        const r = await http().post('/api/v1/auth/2fa/verify').set('Authorization', bearer('ops', 'admin')).send({ code: '000000' });
        expect(r.status).toBe(403);
      }
      const blocked = await http().post('/api/v1/auth/2fa/verify').set('Authorization', bearer('ops', 'admin')).send({ code: '000000' });
      expect(blocked.status).toBe(429);
      expect(db.auditLog.rows.filter((l: any) => l.action === '2fa.verify.failure')).toHaveLength(5);
    });

    it('2FA activée : impossible de la remplacer en libre-service (mot de passe volé)', async () => {
      await enrol();
      const res = await http().post('/api/v1/auth/2fa/setup').set('Authorization', bearer('ops', 'admin'));
      expect(res.status).toBe(409);
    });

    it('la preuve 2FA ne vaut ni pour un autre compte, ni comme jeton d’accès', async () => {
      const { proof } = await enrol();
      db.user.rows.push({ id: 'ops2', email: 'ops2@xlcab.com', role: 'admin', jurisdiction: 'FR', deletedAt: null });
      const other = await http().get('/api/v1/admin/analytics').set({ Authorization: bearer('ops2', 'admin'), 'X-2FA-Token': proof });
      expect(other.status).toBe(403);
      const asAccess = await http().get('/api/v1/admin/analytics').set({ Authorization: `Bearer ${proof}`, 'X-2FA-Token': proof });
      expect(asAccess.status).toBe(401);
    });

    it('un admin corporate avec 2FA n’accède pas au dashboard XLCAB', async () => {
      const { proof } = await enrol('boss', 'corporate_admin');
      const res = await http().get('/api/v1/admin/analytics').set({ Authorization: bearer('boss', 'corporate_admin'), 'X-2FA-Token': proof });
      expect(res.status).toBe(403);
    });
  });

  // ── Validation des chauffeurs ───────────────────────────────────────

  describe('validation des chauffeurs', () => {
    it('liste des candidatures avec documents, sans clé de stockage', async () => {
      seedCandidate();
      const { proof } = await enrol();
      const res = await http().get('/api/v1/admin/drivers/pending').set(admin(proof));

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        driverId: CAND,
        user: { email: 'nadia@x.fr' },
        vehicle: { plate: 'AB-123-CD' },
        requiredDocuments: REQUIRED,
      });
      expect(res.body[0].documents).toHaveLength(5);
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
    });

    it('consultation d’un document : fichier, en-têtes protecteurs, trace d’audit', async () => {
      seedCandidate();
      const { proof } = await enrol();
      const docId = db.driverDocument.rows[3].id;
      const res = await http().get(`/api/v1/admin/drivers/${CAND}/documents/${docId}/file`).set(admin(proof));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(Buffer.from(res.body)).toEqual(JPEG);
      expect(db.auditLog.rows.at(-1)).toMatchObject({ userId: 'ops', action: 'document.view', entityId: docId });
    });

    it('validation refusée tant que les documents ne sont pas approuvés', async () => {
      seedCandidate();
      const { proof } = await enrol();
      const res = await http().post(`/api/v1/admin/drivers/${CAND}/approve`).set(admin(proof)).send({ roseEligible: true });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Documents à approuver');
    });

    it('documents approuvés → chauffeur validé, véhicule dans le matching, notification', async () => {
      seedCandidate();
      const { proof } = await enrol();
      for (const d of db.driverDocument.rows) {
        const r = await http().post(`/api/v1/admin/drivers/${CAND}/documents/${d.id}/review`).set(admin(proof)).send({ status: 'approved' });
        expect(r.status).toBe(200);
      }
      const res = await http().post(`/api/v1/admin/drivers/${CAND}/approve`).set(admin(proof)).send({ roseEligible: true });

      expect(res.status).toBe(200);
      expect(db.user.rows.find((u: any) => u.id === CAND).role).toBe('driver');
      expect(db.driverProfile.rows[0]).toMatchObject({ documentsVerified: true, roseEligible: true, approvedAt: expect.any(Date) });
      expect(db.vehicle.rows[0].isAvailable).toBe(true);
      expect(db.notification.rows.at(-1)).toMatchObject({ userId: CAND, type: 'driver.approved' });
      expect(db.auditLog.rows.map((l: any) => l.action)).toContain('driver.approve');
    });

    it('échéance dépassée : validation bloquée même avec des documents approuvés', async () => {
      seedCandidate();
      db.vehicle.rows[0].insuranceExpiry = inDays(-1);
      db.driverDocument.rows.forEach((d: any) => (d.status = 'approved'));
      const { proof } = await enrol();
      const res = await http().post(`/api/v1/admin/drivers/${CAND}/approve`).set(admin(proof)).send({ roseEligible: false });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('assurance');
    });

    it('refus motivé : candidature retirée, documents refusés, motif notifié', async () => {
      seedCandidate();
      const { proof } = await enrol();
      const short = await http().post(`/api/v1/admin/drivers/${CAND}/reject`).set(admin(proof)).send({ reason: 'Non' });
      expect(short.status).toBe(400);

      const reason = 'Photo du permis illisible, merci de la reprendre.';
      const res = await http().post(`/api/v1/admin/drivers/${CAND}/reject`).set(admin(proof)).send({ reason });
      expect(res.status).toBe(200);
      expect(db.driverProfile.rows).toHaveLength(0);
      expect(db.vehicle.rows).toHaveLength(0);
      expect(db.driverDocument.rows.every((d: any) => d.status === 'rejected')).toBe(true);
      expect(db.notification.rows.at(-1)).toMatchObject({ userId: CAND, type: 'driver.rejected', body: reason });
    });
  });

  // ── Incidents, utilisateurs, juridictions, audit ────────────────────

  describe('incidents SOS', () => {
    it('prise en charge puis clôture avec notes', async () => {
      db.incident.rows.push({
        id: '11111111-1111-4111-8111-111111111111', type: 'sos', tripId: 't', userId: CAND, role: 'passenger',
        lat: 48.8, lng: 2.3, status: 'open', acknowledgedBy: null, acknowledgedAt: null, createdAt: new Date(),
      });
      const { proof } = await enrol();
      const id = db.incident.rows[0].id;

      const open = await http().get('/api/v1/admin/incidents?status=open').set(admin(proof));
      expect(open.body.total).toBe(1);

      expect((await http().post(`/api/v1/admin/incidents/${id}/acknowledge`).set(admin(proof))).status).toBe(200);
      expect((await http().post(`/api/v1/admin/incidents/${id}/acknowledge`).set(admin(proof))).status).toBe(409);
      const resolved = await http()
        .post(`/api/v1/admin/incidents/${id}/resolve`)
        .set(admin(proof))
        .send({ notes: 'Passagère rappelée, fausse alerte.' });
      expect(resolved.status).toBe(200);
      expect(db.incident.rows[0]).toMatchObject({ status: 'resolved', resolvedBy: 'ops', acknowledgedBy: 'ops' });
    });
  });

  it('utilisateurs : recherche par email, jamais le hash du mot de passe', async () => {
    const { proof } = await enrol();
    const res = await http().get('/api/v1/admin/users?search=XLCAB').set(admin(proof));
    expect(res.body.items.map((u: any) => u.email)).toEqual(['ops@xlcab.com']);
    expect(JSON.stringify(res.body)).not.toContain('NE-DOIT-PAS-SORTIR');
  });

  it('juridictions : lecture pour tout utilisateur connecté, modification admin tracée', async () => {
    const { proof } = await enrol();
    const list = await http().get('/api/v1/jurisdictions').set('Authorization', bearer('boss', 'corporate_admin'));
    expect(list.body.map((j: any) => j.code)).toEqual(['FR']);

    expect((await http().patch('/api/v1/admin/jurisdictions/FR').set(admin(proof)).send({ vatParcelRate: 150 })).status).toBe(400);
    const res = await http().patch('/api/v1/admin/jurisdictions/fr').set(admin(proof)).send({ minTripKm: 50 });
    expect(res.status).toBe(200);
    expect(db.jurisdictionConfig.rows[0].minTripKm).toBe(50);
    expect(db.auditLog.rows.at(-1)).toMatchObject({
      action: 'jurisdiction.update',
      entityId: 'FR',
      metadata: { changes: { minTripKm: 50 }, before: expect.objectContaining({ minTripKm: 60 }) },
    });
  });

  it('journal d’audit consultable (identifiants sérialisés)', async () => {
    const { proof } = await enrol();
    const res = await http().get('/api/v1/admin/audit-logs').set(admin(proof));
    expect(res.status).toBe(200);
    expect(res.body.items.map((l: any) => l.action)).toEqual(expect.arrayContaining(['2fa.setup', '2fa.enable']));
    expect(typeof res.body.items[0].id).toBe('string');
  });

  describe('notes des passagers', () => {
    const D1 = 'd1d1d1d1-0000-4000-8000-000000000001';
    const D2 = 'd2d2d2d2-0000-4000-8000-000000000002';
    function seedRatings() {
      db.user.rows.push(
        { id: D1, email: 'nadia@x.fr', role: 'driver', firstName: 'Nadia', lastName: 'Benali' },
        { id: D2, email: 'paul@x.fr', role: 'driver', firstName: 'Paul', lastName: 'Martin' },
        { id: 'p1', email: 'lea@x.fr', role: 'passenger', firstName: 'Léa', lastName: 'Roux' },
      );
      db.driverProfile.rows.push({ id: D1, rating: 2.5, ratingCount: 2, totalTrips: 10 }, { id: D2, rating: 5, ratingCount: 1, totalTrips: 3 });
      db.tripRating.rows.push(
        { id: 'r1', tripId: 't1', passengerId: 'p1', driverId: D1, stars: 1, comment: 'Insultes et conduite brusque', createdAt: new Date('2026-10-01') },
        { id: 'r2', tripId: 't2', passengerId: 'p1', driverId: D1, stars: 4, comment: null, createdAt: new Date('2026-10-02') },
        { id: 'r3', tripId: 't3', passengerId: 'p1', driverId: D2, stars: 5, comment: 'Parfait', createdAt: new Date('2026-10-03') },
      );
    }

    it('sans preuve 2FA : refusé', async () => {
      expect((await http().get('/api/v1/admin/ratings').set('Authorization', bearer('ops', 'admin'))).status).toBe(403);
    });

    it('liste avec noms et commentaires, filtres note basse / avec commentaire / chauffeur', async () => {
      seedRatings();
      const { proof } = await enrol();
      const all = await http().get('/api/v1/admin/ratings').set(admin(proof));
      expect(all.body.total).toBe(3);
      expect(all.body.items[0]).toMatchObject({ id: 'r3', stars: 5, comment: 'Parfait', driver: { name: 'Paul Martin' }, passenger: { name: 'Léa Roux' } });

      const low = await http().get('/api/v1/admin/ratings?maxStars=2').set(admin(proof));
      expect(low.body.items.map((r: any) => r.id)).toEqual(['r1']);
      const commented = await http().get('/api/v1/admin/ratings?withComment=true').set(admin(proof));
      expect(commented.body.items.map((r: any) => r.id)).toEqual(['r3', 'r1']);
      const byDriver = await http().get(`/api/v1/admin/ratings?driverId=${D1}`).set(admin(proof));
      expect(byDriver.body.items.map((r: any) => r.id)).toEqual(['r2', 'r1']);
      expect((await http().get('/api/v1/admin/ratings?maxStars=9').set(admin(proof))).status).toBe(400);
    });

    it('chauffeurs à surveiller : moyenne la plus basse d’abord, nombre de notes basses', async () => {
      seedRatings();
      const { proof } = await enrol();
      const res = await http().get('/api/v1/admin/ratings/drivers').set(admin(proof));
      expect(res.body.items).toEqual([
        { driverId: D1, name: 'Nadia Benali', rating: 2.5, ratingCount: 2, totalTrips: 10, lowCount: 1 },
        { driverId: D2, name: 'Paul Martin', rating: 5, ratingCount: 1, totalTrips: 3, lowCount: 0 },
      ]);
    });

    it('retrait d’une note abusive : motif obligatoire, moyenne recalculée, tracé sans le commentaire', async () => {
      seedRatings();
      const { proof } = await enrol();
      expect((await http().delete('/api/v1/admin/ratings/00000000-0000-4000-8000-000000000000').set(admin(proof)).send({ reason: 'Note sans rapport avec la course' })).status).toBe(404);
      db.tripRating.rows[0].id = 'aaaaaaaa-0000-4000-8000-000000000001';
      const short = await http().delete('/api/v1/admin/ratings/aaaaaaaa-0000-4000-8000-000000000001').set(admin(proof)).send({ reason: 'abus' });
      expect(short.status).toBe(400);

      const res = await http().delete('/api/v1/admin/ratings/aaaaaaaa-0000-4000-8000-000000000001').set(admin(proof)).send({ reason: 'Note sans rapport avec la course' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ removed: true, driver: { rating: 4, ratingCount: 1 } });
      expect(db.driverProfile.rows.find((d: any) => d.id === D1)).toMatchObject({ rating: 4, ratingCount: 1 });
      const log = db.auditLog.rows.at(-1);
      expect(log).toMatchObject({ action: 'rating.remove', metadata: { stars: 1, driverId: D1, reason: 'Note sans rapport avec la course' } });
      expect(JSON.stringify(log.metadata)).not.toMatch(/Insultes/);
    });

    it('dernière note retirée : retour à « nouveau chauffeur »', async () => {
      seedRatings();
      const { proof } = await enrol();
      db.tripRating.rows[2].id = 'bbbbbbbb-0000-4000-8000-000000000003';
      await http().delete('/api/v1/admin/ratings/bbbbbbbb-0000-4000-8000-000000000003').set(admin(proof)).send({ reason: 'Note déposée par erreur' });
      expect(db.driverProfile.rows.find((d: any) => d.id === D2)).toMatchObject({ ratingCount: 0, rating: 5 });
    });
  });
});
