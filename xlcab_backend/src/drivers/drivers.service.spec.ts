import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FakeRedis } from '../testing/fake-redis';
import { detectFileType } from './document-storage';
import { DriversService } from './drivers.service';
import { FakeStorage, JPEG, PDF, PNG, fakePrisma, inDays, validApplication } from '../testing/drivers-fakes';

describe('detectFileType', () => {
  it('reconnaît JPEG, PNG et PDF par leur contenu', () => {
    expect(detectFileType(JPEG)?.mime).toBe('image/jpeg');
    expect(detectFileType(PNG)?.mime).toBe('image/png');
    expect(detectFileType(PDF)?.mime).toBe('application/pdf');
  });

  it('refuse tout le reste, même avec un nom trompeur', () => {
    expect(detectFileType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00'))).toBeNull(); // exécutable Windows
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('DriversService', () => {
  let service: DriversService;
  let prisma: ReturnType<typeof fakePrisma>;
  let storage: FakeStorage;
  let redis: FakeRedis;
  const passenger = { sub: 'passenger-a', role: 'passenger' };
  const file = (buffer: Buffer) => ({ buffer, size: buffer.length });

  const uploadAllRequired = async () => {
    for (const type of ['vehicle_registration', 'vehicle_insurance', 'technical_control', 'driving_license', 'vtc_card'] as const) {
      await service.uploadDocument(passenger, type, file(JPEG));
    }
  };

  beforeEach(() => {
    prisma = fakePrisma();
    storage = new FakeStorage();
    redis = new FakeRedis();
    service = new DriversService(prisma, redis as any, storage);
  });

  describe('uploadDocument', () => {
    it('stocke le fichier sous une clé opaque et ne renvoie ni clé ni empreinte', async () => {
      const res = await service.uploadDocument(passenger, 'driving_license', file(JPEG));

      expect(res).toEqual({ type: 'driving_license', status: 'pending', uploadedAt: expect.any(Date) });
      const [key] = [...storage.files.keys()];
      expect(key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      expect(prisma.docs.get('passenger-a|driving_license')).toMatchObject({
        mimeType: 'image/jpeg', sizeBytes: JPEG.length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    });

    it('un nouvel envoi remplace l’ancien et supprime l’ancien fichier', async () => {
      await service.uploadDocument(passenger, 'driving_license', file(JPEG));
      await service.uploadDocument(passenger, 'driving_license', file(PDF));

      expect(storage.files.size).toBe(1);
      expect([...storage.files.values()][0]).toEqual(PDF);
    });

    it('refuse un fichier qui n’est ni une photo ni un PDF', async () => {
      await expect(
        service.uploadDocument(passenger, 'driving_license', file(Buffer.from('<html></html>'))),
      ).rejects.toThrow('Format non accepté');
      expect(storage.files.size).toBe(0);
    });

    it('refuse un fichier vide ou de plus de 2 Mo', async () => {
      await expect(service.uploadDocument(passenger, 'vtc_card', undefined)).rejects.toThrow(BadRequestException);
      const big = { buffer: JPEG, size: 2 * 1024 * 1024 + 1 };
      await expect(service.uploadDocument(passenger, 'vtc_card', big)).rejects.toMatchObject({ status: 413 });
    });

    it('supprime le fichier si l’écriture en base échoue (pas d’orphelin)', async () => {
      prisma.driverDocument.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(service.uploadDocument(passenger, 'vtc_card', file(JPEG))).rejects.toThrow('db down');
      expect(storage.files.size).toBe(0);
    });

    it('limite à 20 envois par heure', async () => {
      for (let i = 0; i < 20; i++) await service.uploadDocument(passenger, 'vtc_card', file(JPEG));
      await expect(service.uploadDocument(passenger, 'vtc_card', file(JPEG))).rejects.toMatchObject({ status: 429 });
    });

    it('refuse les comptes corporate et admin', async () => {
      await expect(
        service.uploadDocument({ sub: 'x', role: 'corporate_admin' }, 'vtc_card', file(JPEG)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('apply', () => {
    it('crée profil + véhicule hors service et met à jour l’identité', async () => {
      await uploadAllRequired();
      const res = await service.apply(passenger, validApplication());

      expect(res.status).toBe('pending');
      expect(res.missingDocuments).toEqual([]);
      expect(prisma.users.get('passenger-a')).toMatchObject({ firstName: 'Nadia', phone: '+33612345678' });
      expect(prisma.profiles.get('passenger-a')).toMatchObject({ languages: ['fr', 'en'], preferredShuttle: 'bleue' });
      // Jamais décidés par le candidat :
      expect(prisma.profiles.get('passenger-a')).not.toHaveProperty('roseEligible');
      expect(prisma.profiles.get('passenger-a')).not.toHaveProperty('documentsVerified');
      expect(prisma.vehicles[0]).toMatchObject({ plate: 'AB-123-CD', isAvailable: false, dashcamActive: true, jurisdiction: 'FR' });
    });

    it('refuse tant que des documents obligatoires manquent', async () => {
      await service.uploadDocument(passenger, 'driving_license', file(JPEG));
      await expect(service.apply(passenger, validApplication())).rejects.toThrow(
        'Documents manquants : carte grise, attestation d’assurance, contrôle technique, carte VTC',
      );
    });

    it('refuse une échéance passée (permis, assurance, contrôle technique, carte VTC)', async () => {
      await uploadAllRequired();
      const dto = validApplication();
      dto.vehicle.insuranceExpiry = inDays(-1);
      await expect(service.apply(passenger, dto)).rejects.toThrow('Assurance');
    });

    it('navette Accessibilité : véhicule équipé ET chauffeur formé exigés', async () => {
      await uploadAllRequired();
      const dto = validApplication();
      dto.vehicle.shuttleType = 'accessibility';
      dto.vehicle.pmrEquipped = true;
      dto.pmrTrained = false;
      await expect(service.apply(passenger, dto)).rejects.toThrow('Accessibilité');
    });

    it('refuse une deuxième candidature', async () => {
      await uploadAllRequired();
      await service.apply(passenger, validApplication());
      await expect(service.apply(passenger, validApplication())).rejects.toThrow('déjà en cours');
    });

    it('immatriculation déjà enregistrée : 409 explicite', async () => {
      await uploadAllRequired();
      prisma.vehicles.push({ plate: 'AB-123-CD' });
      await expect(service.apply(passenger, validApplication())).rejects.toThrow(
        new ConflictException('Ce véhicule est déjà enregistré'),
      );
    });
  });

  it('état de la candidature : brouillon puis en attente', async () => {
    let view = await service.getApplication(passenger);
    expect(view.status).toBe('draft');
    expect(view.missingDocuments).toHaveLength(5);

    await uploadAllRequired();
    await service.apply(passenger, validApplication());
    view = await service.getApplication(passenger);
    expect(view.status).toBe('pending');
    expect(view.documents[0]).not.toHaveProperty('storageKey');
  });
});
