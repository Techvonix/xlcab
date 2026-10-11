// Faux Redis en mémoire pour les tests (exclu du build via
// tsconfig.build.json). N'implémente que les commandes utilisées par
// les modules Tracking et Matching, avec leur sémantique réelle :
// SET NX, listes, MGET, EXISTS, et les scripts compare-and-delete.

export class FakeRedis {
  store = new Map<string, string>();
  lists = new Map<string, string[]>();
  /** Résultat renvoyé par GEOSEARCH : [driverId, distanceKm][], du plus proche au plus loin. */
  geoResult: [string, string][] = [];
  pushed: { key: string; value: string }[] = [];

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: unknown[]) {
    if (args.includes('NX') && this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n++;
      if (this.lists.delete(k)) n++;
    }
    return n;
  }

  async mget(...keys: (string | string[])[]) {
    return keys.flat().map((k) => this.store.get(k) ?? null);
  }

  async incr(key: string) {
    const n = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(n));
    return n;
  }

  async expire() {
    return 1;
  }

  async rpush(key: string, ...values: string[]) {
    const list = this.lists.get(key) ?? [];
    list.push(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async lpop(key: string) {
    const list = this.lists.get(key);
    return list && list.length > 0 ? list.shift()! : null;
  }

  async lpush(key: string, value: string) {
    this.pushed.push({ key, value });
    return 1;
  }

  async exists(...keys: string[]) {
    return keys.filter((k) => this.store.has(k) || this.lists.has(k)).length;
  }

  /** Scripts utilisés : compare-and-delete (KEYS[1] supprimée si elle vaut l'un des ARGV). */
  async eval(_script: string, _numKeys: number, key: string, ...expected: string[]) {
    const value = this.store.get(key);
    if (value !== undefined && expected.includes(value)) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  /** SCAN en un seul tour (curseur '0'), motif glob simple avec '*'. */
  async scan(_cursor: string, _match: string, pattern: string): Promise<[string, string[]]> {
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    const keys = [...this.store.keys()].filter((k) => (pattern.endsWith('*') ? k.startsWith(prefix) : k === pattern));
    return ['0', keys];
  }

  async geosearch() {
    return this.geoResult;
  }

  async geoadd() {
    return 1;
  }

  async zrem() {
    return 1;
  }
}

/**
 * Faux prisma.trip minimal, avec la sémantique de updateMany
 * (where.status : valeur exacte ou { in: [...] }) nécessaire pour
 * tester les transitions atomiques de statut.
 */
export function fakeTripTable(trips: Record<string, any>) {
  const matches = (trip: any, where: any) => {
    if (!trip || where.id !== trip.id) return false;
    if (where.status === undefined) return true;
    if (typeof where.status === 'string') return trip.status === where.status;
    return where.status.in.includes(trip.status);
  };
  return {
    findUnique: jest.fn(async ({ where }: any) => (trips[where.id] ? { ...trips[where.id] } : null)),
    // Courses engagées des chauffeurs (disponibilité sur le créneau).
    findMany: jest.fn(async ({ where }: any) =>
      Object.values(trips).filter(
        (t: any) =>
          (!where?.driverId?.in || where.driverId.in.includes(t.driverId)) &&
          (!where?.status?.in || where.status.in.includes(t.status)),
      ),
    ),
    findFirst: jest.fn(async () => null),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const trip = trips[where.id];
      if (!matches(trip, where)) return { count: 0 };
      Object.assign(trip, data);
      return { count: 1 };
    }),
  };
}
