import { Prisma } from '@prisma/client';
import { DocumentStorage } from '../drivers/document-storage';
import { DriverApplicationDto } from '../drivers/dto/driver-application.dto';

// Doubles de test du module Drivers (exclus du build via tsconfig.build.json).

// Contenus minimaux reconnus par leur signature binaire.
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
export const PDF = Buffer.from('%PDF-1.7\n...');

export class FakeStorage extends DocumentStorage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, data);
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error('Fichier introuvable');
    return f;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

export const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

export const validApplication = (): DriverApplicationDto => ({
  personal: { firstName: 'Nadia', lastName: 'Benali', phone: '+33612345678', languages: ['fr', 'en'] },
  licenses: {
    licenseNumber: '12AB34567',
    licenseExpiry: inDays(800),
    vtcCardNumber: 'VTC-075-123',
    vtcCardExpiry: inDays(400),
  },
  vehicle: {
    brand: 'Renault', model: 'Trafic', color: 'Gris', plate: 'AB-123-CD', capacity: 8,
    shuttleType: 'bleue', pmrEquipped: false, dashcamInstalled: true,
    insuranceExpiry: inDays(200), technicalControlExpiry: inDays(300),
  },
  pmrTrained: false,
  consent: true,
});

/** Faux Prisma en mémoire pour les tables du module. */
export function fakePrisma() {
  const docs = new Map<string, any>(); // clé : userId|type
  const profiles = new Map<string, any>();
  const vehicles: any[] = [];
  const users = new Map<string, any>([
    ['passenger-a', { id: 'passenger-a', role: 'passenger', jurisdiction: 'FR', deletedAt: null }],
  ]);

  const prisma: any = {
    docs, profiles, vehicles, users,
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(users.get(where.id), data)),
    },
    jurisdictionConfig: { findUnique: jest.fn(async () => ({ requiresVtcCard: true })) },
    driverDocument: {
      findUnique: jest.fn(async ({ where }: any) => docs.get(`${where.userId_type.userId}|${where.userId_type.type}`) ?? null),
      // Respecte `select` comme le vrai Prisma : un test peut ainsi
      // vérifier qu'aucun champ interne (clé de stockage) ne fuit.
      findMany: jest.fn(async ({ where, select }: any) =>
        [...docs.values()]
          .filter((d) => d.userId === where.userId)
          .map((d) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, d[k]])) : d)),
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = `${where.userId_type.userId}|${where.userId_type.type}`;
        const row = docs.has(key) ? { ...docs.get(key), ...update } : { status: 'pending', uploadedAt: new Date(), ...create };
        docs.set(key, row);
        return { type: row.type, status: row.status, uploadedAt: row.uploadedAt };
      }),
    },
    driverProfile: {
      findUnique: jest.fn(async ({ where }: any) => profiles.get(where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        profiles.set(data.id, { approvedAt: null, ...data });
        return data;
      }),
    },
    vehicle: {
      create: jest.fn(async ({ data }: any) => {
        if (vehicles.some((v) => v.plate === data.plate)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002', clientVersion: 'test', meta: { target: ['plate'] },
          });
        }
        vehicles.push(data);
        return data;
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma;
}
