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
import { NotificationsModule, NotificationsService } from './notifications.service';
import { PUSH_SENDER, PushMessage, PushResult, PushSender } from './push';

// Boîte de réception, téléphones enregistrés et envoi push (expéditeur Firebase simulé).

class FakePush implements PushSender {
  enabled = true;
  sent: { token: string; message: PushMessage }[] = [];
  invalid = new Set<string>();
  async send(token: string, message: PushMessage): Promise<PushResult> {
    this.sent.push({ token, message });
    return this.invalid.has(token) ? 'invalid' : 'ok';
  }
}

const TOKEN = (n: number) => `fcm-token-${String(n).padStart(20, '0')}`;

describe('Notifications (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let push: FakePush;
  let notifications: NotificationsService;
  const JWT_SECRET = 'notif-secret';
  const jwt = new JwtService();
  const as = (sub: string, role = 'passenger') => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const register = (user: string, token: string, app = 'passenger') =>
    http().put('/api/v1/users/me/devices').set('Authorization', as(user)).send({ token, platform: 'android', app });

  beforeEach(async () => {
    db = memoryPrisma();
    push = new FakePush();
    db.user.rows.push(
      { id: 'lea', email: 'lea@x.fr', role: 'passenger', locale: 'fr', deletedAt: null },
      { id: 'tom', email: 'tom@x.fr', role: 'passenger', locale: 'en', deletedAt: null },
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
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r' })] }),
        FakeInfraModule,
        AuthModule,
        NotificationsModule,
      ],
    })
      .overrideProvider(PUSH_SENDER)
      .useValue(push)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    notifications = app.get(NotificationsService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('une notification part en push sur les téléphones du compte, avec ce qu’il faut pour ouvrir le bon écran', async () => {
    await register('lea', TOKEN(1));
    await register('lea', TOKEN(2), 'driver');
    await notifications.notify('lea', 'line.guaranteed', 'Départ confirmé', 'Votre départ est confirmé.', { tripId: 't1', seats: 2 });
    await notifications.settled();
    expect(push.sent.map((s) => s.token).sort()).toEqual([TOKEN(1), TOKEN(2)]);
    expect(push.sent[0].message).toEqual({
      title: 'Départ confirmé',
      body: 'Votre départ est confirmé.',
      data: { type: 'line.guaranteed', tripId: 't1', seats: '2' },
    });
  });

  it('push dans la langue du compte (anglais : catalogue des messages)', async () => {
    await register('tom', TOKEN(3));
    await notifications.notify('tom', 'payout.withheld', 'Compte introuvable ou désactivé', 'Compte introuvable ou désactivé');
    await notifications.settled();
    expect(push.sent[0].message.title).not.toBe('Compte introuvable ou désactivé');
  });

  it('notifications push coupées dans les préférences : rien n’est envoyé, la boîte de réception garde tout', async () => {
    await register('lea', TOKEN(1));
    db.userPreference.rows.push({ userId: 'lea', notifyPush: false });
    await notifications.notify('lea', 'line.booked', 'Réservation confirmée', 'Votre place est réservée.');
    await notifications.settled();
    expect(push.sent).toHaveLength(0);
    const inbox = await http().get('/api/v1/users/me/notifications').set('Authorization', as('lea'));
    expect(inbox.body).toMatchObject({ unread: 1, items: [expect.objectContaining({ type: 'line.booked', title: 'Réservation confirmée' })] });
  });

  it('jeton déclaré invalide par Firebase : le téléphone est oublié', async () => {
    await register('lea', TOKEN(1));
    push.invalid.add(TOKEN(1));
    await notifications.notify('lea', 'line.booked', 'Réservation confirmée', 'Votre place est réservée.');
    await notifications.settled();
    expect(db.pushDevice.rows).toHaveLength(0);
  });

  it('même téléphone, autre compte : le jeton change de propriétaire ; 10 téléphones au plus par compte', async () => {
    await register('lea', TOKEN(1));
    await register('tom', TOKEN(1));
    expect(db.pushDevice.rows).toEqual([expect.objectContaining({ token: TOKEN(1), userId: 'tom' })]);
    for (let i = 10; i < 22; i++) await register('lea', TOKEN(i));
    expect(db.pushDevice.rows.filter((d: any) => d.userId === 'lea')).toHaveLength(10);
  });

  it('déconnexion : le téléphone ne reçoit plus rien ; on ne retire pas le téléphone d’un autre', async () => {
    await register('lea', TOKEN(1));
    expect((await http().post('/api/v1/users/me/devices/remove').set('Authorization', as('tom')).send({ token: TOKEN(1) })).body).toEqual({ removed: 0 });
    expect((await http().post('/api/v1/users/me/devices/remove').set('Authorization', as('lea')).send({ token: TOKEN(1) })).body).toEqual({ removed: 1 });
    expect((await register('lea', 'court')).status).toBe(400);
    expect((await http().put('/api/v1/users/me/devices').send({ token: TOKEN(2), platform: 'android', app: 'passenger' })).status).toBe(401);
  });

  it('boîte de réception : la plus récente d’abord, marquer lu, jamais les notifications d’un autre', async () => {
    db.notification.rows.push(
      { id: '00000000-0000-4000-8000-000000000001', userId: 'lea', type: 'a', title: 'A', body: 'a', readAt: null, createdAt: new Date('2026-10-20') },
      { id: '00000000-0000-4000-8000-000000000002', userId: 'lea', type: 'b', title: 'B', body: 'b', readAt: null, createdAt: new Date('2026-10-21') },
      { id: '00000000-0000-4000-8000-000000000003', userId: 'tom', type: 'c', title: 'C', body: 'c', readAt: null, createdAt: new Date('2026-10-22') },
    );
    const inbox = await http().get('/api/v1/users/me/notifications').set('Authorization', as('lea'));
    expect(inbox.body.items.map((n: any) => n.title)).toEqual(['B', 'A']);
    expect(inbox.body.unread).toBe(2);

    // Lire la notification d'un autre : sans effet.
    await http().post('/api/v1/users/me/notifications/read').set('Authorization', as('lea')).send({ ids: ['00000000-0000-4000-8000-000000000003'] });
    expect(db.notification.rows.find((n: any) => n.userId === 'tom').readAt).toBeNull();

    await http().post('/api/v1/users/me/notifications/read').set('Authorization', as('lea')).send({ ids: ['00000000-0000-4000-8000-000000000002'] });
    expect((await http().get('/api/v1/users/me/notifications').set('Authorization', as('lea'))).body.unread).toBe(1);
    await http().post('/api/v1/users/me/notifications/read').set('Authorization', as('lea')).send({});
    expect((await http().get('/api/v1/users/me/notifications').set('Authorization', as('lea'))).body.unread).toBe(0);
  });
});
