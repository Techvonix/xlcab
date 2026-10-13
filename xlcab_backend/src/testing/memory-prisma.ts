import { randomUUID } from 'crypto';

// Faux Prisma en mémoire, générique, pour les tests d'intégration des
// modules Bookings / Corporate (exclu du build via tsconfig.build.json).
// Gère les filtres réellement utilisés : égalité, { in }, { not },
// { gte, lt }, les `select` simples, les `create` imbriqués d'une
// relation 1-n (priceLines) et `aggregate` avec _sum / _avg / _count.

type Row = Record<string, any>;

const RANGE_OPS = ['gte', 'gt', 'lte', 'lt'];

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const value = row[key];
    // Dates comparées par valeur, comme PostgreSQL.
    if (cond instanceof Date) return value != null && new Date(value).getTime() === cond.getTime();
    if (cond === null || typeof cond !== 'object') return value === cond;
    if ('in' in cond) return cond.in.includes(value);
    if ('contains' in cond) {
      const insensitive = cond.mode === 'insensitive';
      const hay = String(value ?? '');
      return insensitive ? hay.toLowerCase().includes(String(cond.contains).toLowerCase()) : hay.includes(cond.contains);
    }
    if ('not' in cond) return value !== cond.not;
    if (RANGE_OPS.some((op) => op in cond)) {
      if (value == null) return false;
      const v = new Date(value).getTime();
      const at = (op: string) => new Date(cond[op]).getTime();
      return (
        (!('gte' in cond) || v >= at('gte')) &&
        (!('gt' in cond) || v > at('gt')) &&
        (!('lte' in cond) || v <= at('lte')) &&
        (!('lt' in cond) || v < at('lt'))
      );
    }
    // Clé composée d'un @@unique (ex. corporateId_userId).
    return Object.entries(cond).every(([k, v]) => row[k] === v);
  });
}

type Relation = (row: Row) => Row[] | Row | null;

function project(row: Row, select: Row | undefined, relations: Record<string, Relation>, include?: Row): Row {
  if (include) {
    const out: Row = { ...row };
    for (const key of Object.keys(include)) if (relations[key]) out[key] = relations[key](row);
    return out;
  }
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, sel] of Object.entries(select)) {
    if (relations[key]) {
      const children = relations[key](row);
      out[key] =
        typeof sel === 'object' && sel.select && Array.isArray(children)
          ? children.map((c) => project(c, sel.select, {}))
          : children;
    } else {
      out[key] = row[key];
    }
  }
  return out;
}

/** Écriture avec prise en charge de { increment: n }. */
function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    row[k] = v && typeof v === 'object' && 'increment' in (v as Row) ? (row[k] ?? 0) + (v as Row).increment : v;
  }
}

class Table {
  rows: Row[] = [];

  constructor(
    private defaults: () => Row = () => ({}),
    private relations: Record<string, Relation> = {},
    private nested: Record<string, (parent: Row, data: Row[]) => void> = {},
  ) {}

  private sort(rows: Row[], orderBy?: Row): Row[] {
    if (!orderBy) return rows;
    const [[k, dir]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  }

  findUnique = async ({ where, select, include }: Row) => {
    const row = this.rows.find((r) => matches(r, where));
    return row ? project(row, select, this.relations, include) : null;
  };

  findFirst = async ({ where, select, orderBy, include }: Row) => {
    const row = this.sort(this.rows.filter((r) => matches(r, where)), orderBy)[0];
    return row ? project(row, select, this.relations, include) : null;
  };

  findMany = async ({ where, select, orderBy, skip = 0, take, include }: Row = {}) =>
    this.sort(this.rows.filter((r) => matches(r, where)), orderBy)
      .slice(skip, take === undefined ? undefined : skip + take)
      .map((r) => project(r, select, this.relations, include));

  count = async ({ where }: Row = {}) => this.rows.filter((r) => matches(r, where)).length;

  delete = async ({ where }: Row) => {
    const idx = this.rows.findIndex((r) => matches(r, where));
    if (idx < 0) throw new Error('Enregistrement introuvable');
    return this.rows.splice(idx, 1)[0];
  };

  create = async ({ data, select }: Row) => {
    const plain: Row = {};
    const nestedData: Record<string, Row[]> = {};
    for (const [k, v] of Object.entries(data)) {
      if (this.nested[k] && v && typeof v === 'object' && 'create' in (v as Row)) nestedData[k] = (v as Row).create;
      else plain[k] = v;
    }
    const row = { id: randomUUID(), ...this.defaults(), ...plain };
    this.rows.push(row);
    for (const [k, children] of Object.entries(nestedData)) this.nested[k](row, children);
    return project(row, select, this.relations);
  };

  update = async ({ where, data }: Row) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) throw new Error('Enregistrement introuvable');
    applyData(row, data);
    return { ...row };
  };

  deleteMany = async ({ where }: Row = {}) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  };

  updateMany = async ({ where, data }: Row) => {
    const rows = this.rows.filter((r) => matches(r, where));
    rows.forEach((r) => applyData(r, data));
    return { count: rows.length };
  };

  upsert = async ({ where, create, update }: Row) => {
    const row = this.rows.find((r) => matches(r, where));
    if (row) {
      applyData(row, update);
      return { ...row };
    }
    return this.create({ data: create });
  };

  aggregate = async ({ _sum, _avg, _count, where }: Row) => {
    const rows = this.rows.filter((r) => matches(r, where));
    const out: Row = {};
    if (_sum) {
      out._sum = {};
      for (const k of Object.keys(_sum)) out._sum[k] = rows.length ? rows.reduce((s, r) => s + (r[k] ?? 0), 0) : null;
    }
    if (_avg) {
      out._avg = {};
      for (const k of Object.keys(_avg)) out._avg[k] = rows.length ? rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) / rows.length : null;
    }
    if (_count) out._count = _count === true ? rows.length : { _all: rows.length };
    return out;
  };
}

export function memoryPrisma() {
  let auditSeq = 0;
  const tripPriceLine = new Table();
  const db: Row = {
    user: new Table(() => ({ role: 'passenger', jurisdiction: 'FR', deletedAt: null, firstName: null, lastName: null })),
    corporateAccount: new Table(() => ({
      createdAt: new Date(), vatNumber: null, siret: null, billingAddress: null, costCenter: null, monthlyLimitCents: null,
    })),
    corporateMember: new Table(() => ({ isActive: true, addedAt: new Date(), monthlyLimitCents: null, costCenter: null })),
    passengerBooking: new Table(),
    tripPriceLine,
    jurisdictionConfig: new Table(),
    driverProfile: new Table(() => ({
      approvedAt: null, documentsVerified: false, roseEligible: false, pmrTrained: false, languages: ['fr'], rating: 5, ratingCount: 0, totalTrips: 0, isOnline: false,
    })),
    vehicle: new Table(() => ({ isAvailable: true, pmrEquipped: false, dashcamActive: false })),
    driverDocument: new Table(() => ({ status: 'pending', uploadedAt: new Date() })),
    twoFactorAuth: new Table(() => ({ enabledAt: null, createdAt: new Date() })),
    incident: new Table(() => ({
      status: 'open', acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, notes: null, createdAt: new Date(),
    })),
    auditLog: new Table(() => ({ id: BigInt(++auditSeq), createdAt: new Date() })),
    notification: new Table(() => ({ readAt: null, createdAt: new Date() })),
    tariff: new Table(() => ({ createdAt: new Date() })),
    invoice: new Table(() => ({ issuedAt: new Date(), currency: "EUR", tripIds: [], pdfKey: null, corporateId: null, creditedInvoiceId: null, dueDate: null, periodStart: null, periodEnd: null })),
    invoiceCounter: new Table(),
    userActivity: new Table(),
    trackingPoint: new Table(() => ({ recordedAt: new Date() })),
    payment: new Table(() => ({ currency: 'EUR', refundedCents: 0, method: null, createdAt: new Date() })),
    savedAddress: new Table(() => ({ createdAt: new Date() })),
    userPreference: new Table(() => ({ notifyPush: true, notifyEmail: true, notifySms: false, marketing: false, autoShareTrips: false, preferWomanDriver: false, updatedAt: new Date() })),
    trustedContact: new Table(() => ({ createdAt: new Date() })),
    lineSeat: new Table(() => ({ createdAt: new Date() })),
    tripShare: new Table(() => ({ createdAt: new Date(), revokedAt: null })),
    tripRating: new Table(() => ({ comment: null, tags: [], createdAt: new Date() })),
    operatorProfile: new Table(() => ({
      kind: 'independent', legalName: null, siret: null, transportLicense: null, cities: [], services: [], description: null,
      status: 'pending', perSeatAllowed: false, verifiedAt: null, termsAcceptedAt: null, termsVersion: null, createdAt: new Date(), updatedAt: new Date(),
    })),
    recurringLine: new Table(() => ({
      pickupRadiusKm: 5, returnTime: null, timezone: 'Europe/Paris', jurisdiction: 'FR', endDate: null, durationMin: null,
      conditions: null, status: 'active', closedAt: null, createdAt: new Date(), updatedAt: new Date(),
    })),
    lineException: new Table(() => ({ seats: null, reason: null })),
    lineDeparture: new Table(() => ({
      direction: 'outbound', seatsBooked: 0, status: 'to_confirm', confirmedAt: null, createdAt: new Date(),
      driverId: null, vehicleId: null, driverReadyAt: null, rescueStatus: 'none', rescueStage: null,
    })),
    lineBackup: new Table(() => ({ status: 'invited', vehicleId: null, respondedAt: null, createdAt: new Date() })),
    rescueOffer: new Table(() => ({ status: 'pending', vehicleId: null, respondedAt: null, createdAt: new Date() })),
    driverCancellation: new Table(() => ({ reason: null, justification: null, reviewedBy: null, reviewedAt: null, createdAt: new Date() })),
    driverPenalty: new Table(() => ({
      status: 'pending', contestReason: null, decidedBy: null, decisionReason: null, decidedAt: null, createdAt: new Date(),
    })),
    driverBonus: new Table(() => ({ penaltyId: null, createdAt: new Date() })),
    passengerCredit: new Table(() => ({ tripId: null, usedAt: null, createdAt: new Date() })),
    transportRequest: new Table(() => ({
      partnerRef: null, flexMin: 0, returnAt: null, luggage: 0, accessible: false, recurring: false, frequency: null, budgetCents: null,
      needs: null, comment: null, status: 'draft', publishedAt: null, acceptedOfferId: null, tripId: null, returnTripId: null,
      createdAt: new Date(), updatedAt: new Date(),
    })),
    transportOffer: new Table(() => ({
      includesReturn: false, conditions: null, status: 'pending', confirmDeadline: null, respondedAt: null, createdAt: new Date(),
    })),
    offerMessage: new Table(() => ({ createdAt: new Date() })),
    payoutAccount: new Table(() => ({
      detailsSubmitted: false, payoutsEnabled: false, transfersActive: false, requirementsDue: 0, disabledReason: null, createdAt: new Date(), updatedAt: new Date(),
    })),
  };
  db.trip = new Table(
    () => ({ status: 'pending', vatCents: 0, createdAt: new Date(), source: 'instant', lineDepartureId: null, commissionCents: null, paidWithTripId: null }),
    {
      priceLines: (trip) => tripPriceLine.rows.filter((l) => l.tripId === trip.id),
      passengerBooking: (trip) => db.passengerBooking.rows.find((b: Row) => b.tripId === trip.id) ?? null,
      parcelBooking: (trip) => db.parcelBooking.rows.find((b: Row) => b.tripId === trip.id) ?? null,
    },
    { priceLines: (trip, lines) => lines.forEach((l) => tripPriceLine.rows.push({ id: randomUUID(), tripId: trip.id, ...l })) },
  );
  // Relation PassengerBooking → Trip (scan du QR d'un départ de ligne).
  db.passengerBooking = new Table(() => ({ childSeats: 0, wifiRequested: false, extraLuggage: false, petsAllowed: false, checkedIn: false, notes: null }), {
    trip: (b) => db.trip.rows.find((t: Row) => t.id === b.tripId) ?? null,
  });
  db.parcelBooking = new Table(
    () => ({ status: 'pending', isFragile: false, carrierTripId: null, onReturnLeg: false, photoKey: null, proofOfDeliveryKey: null, failureReason: null, pickedUpAt: null, deliveredAt: null, createdAt: new Date() }),
    { trip: (parcel) => db.trip.rows.find((t: Row) => t.id === parcel.tripId) ?? null },
  );
  db.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(db);
  db.jurisdictionConfig.rows.push({
    code: 'FR', minTripKm: 60, vatPassengerRate: 0, vatParcelRate: 20, currency: 'EUR', requiresVtcCard: true,
  });
  return db;
}
