import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import * as request from 'supertest';
import { AuditModule } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { addDays, localDateOf } from '../common/local-time';
import { NotificationsModule } from '../notifications/notifications.service';
import { DEFAULT_OPERATOR_TERMS_VERSION } from '../operators/line-schedule';
import { OperatorsModule } from '../operators/operators.module';
import { PaymentsService } from '../payments/payments.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { FakeRedis } from '../testing/fake-redis';
import { FakeStripe } from '../testing/fake-stripe';
import { memoryPrisma } from '../testing/memory-prisma';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { LineBookingsModule } from './line-bookings.module';

// Stripe Connect, étape 2 (vrai HTTP ; base, Redis et Stripe simulés) :
// avec le paiement en ligne activé, une place de ligne est retenue à la
// réservation, confirmée une fois payée, rendue si elle ne l'est pas.

const JWT_SECRET = 'line-payments-secret';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DJAMEL = id(1);
const KARIM = id(2); // secours
const PAX1 = id(11);
const PAX2 = id(12);
const VAN = { djamel: id(21), karim: id(22) };
const MIN = 60_000;

describe('Paiement des réservations sur ligne (intégration)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof memoryPrisma>;
  let stripe: FakeStripe;
  let payments: PaymentsService;
  const jwt = new JwtService();
  const as = (sub: string, role: string) => `Bearer ${jwt.sign({ sub, role, jti: `j-${sub}` }, { secret: JWT_SECRET })}`;
  const http = () => request(app.getHttpServer());
  const tomorrow = addDays(localDateOf(new Date(), 'Europe/Paris'), 1);
  let lineId: string;

  const departure = () => db.lineDeparture.rows.find((d: any) => d.lineId === lineId && d.localDate === tomorrow);
  const trip = (tripId: string) => db.trip.rows.find((t: any) => t.id === tripId);
  const notified = (userId: string, type: string) => db.notification.rows.some((n: any) => n.userId === userId && n.type === type);
  const seatsOf = (tripId: string) => db.lineSeat.rows.filter((s: any) => s.tripId === tripId).map((s: any) => s.seatNumber);

  const book = (pax: string, seats: number, seatNumbers?: number[]) =>
    http().post('/api/v1/lines/bookings').set('Authorization', as(pax, 'passenger')).send({ departureId: departure().id, seats, ...(seatNumbers ? { seatNumbers } : {}) });
  const intentOf = (tripId: string) => db.payment.rows.find((p: any) => p.tripId === tripId).stripePaymentIntentId as string;
  /** Le passager valide la feuille de paiement, puis l'app confirme auprès du serveur. */
  async function pay(pax: string, tripId: string) {
    stripe.succeed(intentOf(tripId));
    return http().post('/api/v1/payments/confirm').set('Authorization', as(pax, 'passenger')).send({ tripId });
  }
  const manifest = () => http().get(`/api/v1/operators/me/departures/${departure().id}/manifest`).set('Authorization', as(DJAMEL, 'driver'));

  beforeEach(async () => {
    process.env.LINE_PAYMENT_MODE = 'connect';
    db = memoryPrisma();
    stripe = new FakeStripe();
    const approved = new Date('2026-09-01');
    for (const [uid, email, firstName] of [[DJAMEL, 'djamel@test.fr', 'Djamel'], [KARIM, 'karim@test.fr', 'Karim']]) {
      db.user.rows.push({ id: uid, email, role: 'driver', firstName, phone: '+33611111111', deletedAt: null });
      db.driverProfile.rows.push({ id: uid, approvedAt: approved, rating: 4.9, ratingCount: 10, totalTrips: 10, languages: ['fr'] });
      db.operatorProfile.rows.push({
        id: uid, kind: 'independent', status: 'verified', perSeatAllowed: true, transportLicense: 'LOTI-1',
        termsAcceptedAt: approved, termsVersion: DEFAULT_OPERATOR_TERMS_VERSION, cities: [], services: [],
      });
      // Compte de versement validé : exigé pour ouvrir un départ à la réservation.
      db.payoutAccount.rows.push({ userId: uid, stripeAccountId: `acct_${firstName}`, detailsSubmitted: true, payoutsEnabled: true, transfersActive: true, requirementsDue: 0 });
    }
    db.vehicle.rows.push(
      { id: VAN.djamel, driverId: DJAMEL, brand: 'Renault', model: 'Trafic', plate: 'AA-001-AA', capacity: 8, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR' },
      { id: VAN.karim, driverId: KARIM, brand: 'Renault', model: 'Trafic', plate: 'AA-002-AA', capacity: 8, dashcamActive: true, shuttleType: 'bleue', jurisdiction: 'FR' },
    );
    db.user.rows.push(
      { id: PAX1, email: 'lea@test.fr', role: 'passenger', firstName: 'Léa', phone: '+33622222222', deletedAt: null, stripeCustomerId: null },
      { id: PAX2, email: 'tom@test.fr', role: 'passenger', firstName: 'Tom', deletedAt: null, stripeCustomerId: null },
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
          load: [() => ({ JWT_SECRET, JWT_REFRESH_SECRET: 'r', GOOGLE_MAPS_API_KEY: 'k', TWO_FACTOR_ENC_KEY: randomBytes(32).toString('base64') })],
        }),
        FakeInfraModule,
        AuditModule,
        NotificationsModule,
        AuthModule,
        OperatorsModule,
        LineBookingsModule,
      ],
    })
      .overrideProvider(TrackingGateway)
      .useValue({ emitTripStatus: jest.fn(), emitToDriver: jest.fn() })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    payments = moduleRef.get(PaymentsService);

    // Ligne de Djamel : Paris → Beauvais 5 h, 8 places à 25 €.
    const created = await http().post('/api/v1/operators/me/lines').set('Authorization', as(DJAMEL, 'driver')).send({
      vehicleId: VAN.djamel,
      originAddress: 'Porte Maillot, Paris', originLat: 48.8781, originLng: 2.2834,
      destinationAddress: 'Aéroport de Beauvais', destinationLat: 49.4544, destinationLng: 2.1128,
      departureTime: '05:00', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], startDate: tomorrow, seats: 8, luggage: 16,
      pricingMode: 'per_seat', priceCents: 2500, durationMin: 75,
    });
    expect(created.status).toBe(201);
    lineId = created.body.id;
    const confirmed = await http().post('/api/v1/operators/me/departures/confirm').set('Authorization', as(DJAMEL, 'driver')).send({ lineId, until: tomorrow });
    expect(confirmed.body).toEqual({ confirmed: 1 });
  });

  afterEach(async () => {
    delete process.env.LINE_PAYMENT_MODE;
    await app.close();
  });

  it('réserver retient les places et renvoie la feuille de paiement, sans rien confirmer', async () => {
    const res = await book(PAX1, 2, [4, 5]);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'awaiting_payment', paymentMode: 'connect', seats: 2, seatNumbers: [4, 5], totalPriceCents: 5000 });
    expect(res.body.payment).toMatchObject({ tripId: res.body.tripId, amountCents: 5000, currency: 'EUR' });
    expect(res.body.payment.paymentIntentClientSecret).toMatch(/_secret_/);

    // Montant fixé par le serveur, paiement rattaché à son futur reversement.
    const created = stripe.intentCreates[0];
    expect(created.params).toMatchObject({ amount: 5000, currency: 'eur', transfer_group: `trip_${res.body.tripId}` });
    expect(created.options).toEqual({ idempotencyKey: `trip-payment-${res.body.tripId}` });

    // Places retenues (personne ne peut les prendre), mais rien n'est confirmé.
    expect(departure().seatsBooked).toBe(2);
    expect(seatsOf(res.body.tripId)).toEqual([4, 5]);
    expect(trip(res.body.tripId)).toMatchObject({ status: 'awaiting_payment', acceptedAt: null, source: 'line' });
    expect(notified(DJAMEL, 'line.new_booking')).toBe(false);
    expect(notified(PAX1, 'line.booked')).toBe(false);
    expect((await manifest()).body.passengers ?? []).toHaveLength(0);
  });

  it('une fois payée, la réservation est confirmée auprès du chauffeur du départ', async () => {
    const { body } = await book(PAX1, 2, [4, 5]);
    const res = await pay(PAX1, body.tripId);
    expect(res.body).toEqual({ tripId: body.tripId, paymentStatus: 'succeeded', tripStatus: 'accepted' });
    expect(trip(body.tripId)).toMatchObject({ status: 'accepted', driverId: DJAMEL, vehicleId: VAN.djamel });
    expect(trip(body.tripId).acceptedAt).toBeInstanceOf(Date);
    expect(notified(DJAMEL, 'line.new_booking')).toBe(true);
    expect(notified(PAX1, 'line.booked')).toBe(true);
    // Aucune recherche de chauffeur : c'est un départ de ligne.
    expect(trip(body.tripId).status).not.toBe('searching');
  });

  it('confirmer deux fois ne change rien (webhook et app en même temps)', async () => {
    const { body } = await book(PAX1, 1);
    await pay(PAX1, body.tripId);
    await pay(PAX1, body.tripId);
    expect(db.notification.rows.filter((n: any) => n.type === 'line.new_booking')).toHaveLength(1);
    expect(departure().seatsBooked).toBe(1);
  });

  it('un siège retenu en attente de paiement ne peut pas être pris par un autre', async () => {
    await book(PAX1, 2, [4, 5]);
    expect((await book(PAX2, 1, [4])).status).toBe(409);
    expect((await book(PAX2, 7)).status).toBe(409); // il ne reste que 6 places
    expect((await book(PAX2, 6)).status).toBe(201);
    expect(departure().seatsBooked).toBe(8);
  });

  it('une seule réservation par passager, même tant qu’elle n’est pas payée', async () => {
    await book(PAX1, 1);
    const again = await book(PAX1, 1);
    expect(again.status).toBe(409);
    expect(departure().seatsBooked).toBe(1);
  });

  it('non payée au bout de 30 minutes : annulée, places et sièges rendus', async () => {
    const { body } = await book(PAX1, 2, [4, 5]);
    expect(await payments.expireUnpaid(new Date(Date.now() + 29 * MIN))).toBe(0);
    expect(await payments.expireUnpaid(new Date(Date.now() + 31 * MIN))).toBe(1);
    expect(trip(body.tripId).status).toBe('cancelled');
    expect(departure().seatsBooked).toBe(0);
    expect(seatsOf(body.tripId)).toEqual([]);
    expect(stripe.canceled).toEqual([intentOf(body.tripId)]);
    expect(notified(PAX1, 'booking.expired')).toBe(true);
    // Les sièges sont de nouveau en vente.
    expect((await book(PAX2, 2, [4, 5])).status).toBe(201);
  });

  it('payée juste avant l’expiration : validée par le planificateur au lieu d’être annulée', async () => {
    const { body } = await book(PAX1, 1);
    stripe.succeed(intentOf(body.tripId)); // webhook en retard
    expect(await payments.expireUnpaid(new Date(Date.now() + 31 * MIN))).toBe(0);
    expect(trip(body.tripId)).toMatchObject({ status: 'accepted', driverId: DJAMEL });
    expect(departure().seatsBooked).toBe(1);
  });

  it('paiement arrivé après l’expiration : remboursé intégralement', async () => {
    const { body } = await book(PAX1, 2);
    await payments.expireUnpaid(new Date(Date.now() + 31 * MIN));
    // La carte avait été validée chez Stripe malgré l'annulation de la demande.
    db.payment.rows[0].status = 'requires_payment';
    await pay(PAX1, body.tripId);
    expect(trip(body.tripId).status).toBe('cancelled');
    expect(stripe.refundsCreated[0].params).toMatchObject({ amount: 5000 });
    expect(departure().seatsBooked).toBe(0);
  });

  it('abandon par le passager avant de payer : places rendues, rien de débité', async () => {
    const { body } = await book(PAX1, 2, [4, 5]);
    const res = await http().post(`/api/v1/trips/${body.tripId}/cancel`).set('Authorization', as(PAX1, 'passenger')).send({ reason: 'Changement de plan' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', feeCents: 0, refundedCents: 0 });
    expect(departure().seatsBooked).toBe(0);
    expect(seatsOf(body.tripId)).toEqual([]);
    expect(stripe.canceled).toEqual([intentOf(body.tripId)]);
    expect(stripe.refundsCreated).toHaveLength(0);
  });

  it('annulation après paiement : remboursement, places rendues', async () => {
    const { body } = await book(PAX1, 2);
    await pay(PAX1, body.tripId);
    const res = await http().post(`/api/v1/trips/${body.tripId}/cancel`).set('Authorization', as(PAX1, 'passenger')).send({ reason: 'Vol annulé' });
    expect(res.status).toBe(200);
    expect(res.body.refundedCents).toBe(5000 - res.body.feeCents);
    expect(departure().seatsBooked).toBe(0);
  });

  it('chauffeur en cours de remplacement pendant le paiement : la réservation attend le secours', async () => {
    const { body } = await book(PAX1, 1);
    Object.assign(departure(), { rescueStatus: 'searching', driverId: DJAMEL });
    await pay(PAX1, body.tripId);
    expect(trip(body.tripId)).toMatchObject({ status: 'accepted', driverId: null, vehicleId: null });
    expect(notified(DJAMEL, 'line.new_booking')).toBe(false);
  });

  it('départ repris par un secours pendant le paiement : confirmée auprès du secours', async () => {
    const { body } = await book(PAX1, 1);
    Object.assign(departure(), { rescueStatus: 'rescued', driverId: KARIM, vehicleId: VAN.karim });
    await pay(PAX1, body.tripId);
    expect(trip(body.tripId)).toMatchObject({ status: 'accepted', driverId: KARIM, vehicleId: VAN.karim });
    expect(notified(KARIM, 'line.new_booking')).toBe(true);
    expect(notified(DJAMEL, 'line.new_booking')).toBe(false);
  });

  it('départ annulé faute de secours pendant le paiement : remboursée, places rendues', async () => {
    const { body } = await book(PAX1, 2, [4, 5]);
    Object.assign(departure(), { rescueStatus: 'failed', status: 'closed' });
    await pay(PAX1, body.tripId);
    expect(trip(body.tripId)).toMatchObject({ status: 'cancelled', cancellationFeeCents: 0 });
    expect(stripe.refundsCreated[0].params).toMatchObject({ amount: 5000 });
    expect(seatsOf(body.tripId)).toEqual([]);
    expect(notified(PAX1, 'line.booking_cancelled')).toBe(true);
  });

  it('Stripe en panne à la réservation : rien ne reste retenu, le passager peut réessayer', async () => {
    const create = stripe.paymentIntents.create;
    stripe.paymentIntents.create = async () => {
      throw new Error('Stripe API indisponible');
    };
    const failed = await book(PAX1, 2, [4, 5]);
    expect(failed.status).toBe(500);
    expect(departure().seatsBooked).toBe(0);
    expect(db.lineSeat.rows).toHaveLength(0);
    expect(db.trip.rows.every((t: any) => t.status === 'cancelled')).toBe(true);

    stripe.paymentIntents.create = create;
    expect((await book(PAX1, 2, [4, 5])).status).toBe(201);
  });

  it('le montant vient du serveur : un paiement d’un autre montant ne confirme rien', async () => {
    const { body } = await book(PAX1, 2);
    const intent = stripe.intents.get(intentOf(body.tripId));
    Object.assign(intent, { status: 'succeeded', amount_received: 100 });
    await http().post('/api/v1/payments/confirm').set('Authorization', as(PAX1, 'passenger')).send({ tripId: body.tripId });
    expect(trip(body.tripId).status).toBe('awaiting_payment');
  });

  it('la réservation d’un autre passager ne peut pas être payée ni confirmée par moi', async () => {
    const { body } = await book(PAX1, 1);
    expect((await http().post('/api/v1/payments/intent').set('Authorization', as(PAX2, 'passenger')).send({ tripId: body.tripId })).status).toBe(404);
    expect((await http().post('/api/v1/payments/confirm').set('Authorization', as(PAX2, 'passenger')).send({ tripId: body.tripId })).status).toBe(404);
  });
});
