import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DocumentStorage, detectFileType } from './document-storage';
import {
  ApplicationStatus,
  DOCUMENT_UPLOADS_PER_HOUR,
  DocumentType,
  MAX_DOCUMENT_BYTES,
  requiredDocuments,
} from './drivers.constants';
import { DriverApplicationDto } from './dto/driver-application.dto';

// Rôles autorisés à candidater : un passager qui devient chauffeur, ou un
// chauffeur qui renouvelle ses documents. Les comptes corporate et admin
// n'ont pas vocation à conduire.
const APPLICANT_ROLES = ['passenger', 'driver'];

export interface RequestUser {
  sub: string;
  role: string;
}

/** Fichier reçu par multer (stockage mémoire). */
export interface UploadedDocumentFile {
  buffer: Buffer;
  size: number;
}

export interface ApplicationView {
  status: ApplicationStatus;
  documents: { type: string; status: string; uploadedAt: Date }[];
  requiredDocuments: DocumentType[];
  missingDocuments: DocumentType[];
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private storage: DocumentStorage,
  ) {}

  // ── POST /drivers/me/documents ───────────────────────────────────────

  async uploadDocument(user: RequestUser, type: DocumentType, file: UploadedDocumentFile | undefined) {
    this.assertApplicant(user);
    if (!file || file.size === 0) throw new BadRequestException('Aucun fichier reçu');
    // Multer bloque déjà au-delà de 2 Mo ; double contrôle ici.
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new PayloadTooLargeException('Fichier trop volumineux (2 Mo maximum)');
    }

    await this.enforceUploadRate(user.sub);

    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Format non accepté : photo JPEG/PNG ou PDF uniquement');
    }

    const storageKey = `${randomUUID()}.${detected.ext}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer, detected.mime);

    const previous = await this.prisma.driverDocument.findUnique({
      where: { userId_type: { userId: user.sub, type } },
      select: { storageKey: true },
    });

    let saved;
    try {
      saved = await this.prisma.driverDocument.upsert({
        where: { userId_type: { userId: user.sub, type } },
        create: { userId: user.sub, type, storageKey, mimeType: detected.mime, sizeBytes: file.size, sha256 },
        // Nouveau fichier : repasse en attente de vérification.
        update: { storageKey, mimeType: detected.mime, sizeBytes: file.size, sha256, status: 'pending', uploadedAt: new Date() },
        select: { type: true, status: true, uploadedAt: true },
      });
    } catch (err) {
      // Pas de fichier orphelin si l'écriture en base échoue.
      await this.storage.delete(storageKey);
      throw err;
    }

    // L'ancien fichier remplacé est supprimé (minimisation RGPD).
    if (previous) await this.storage.delete(previous.storageKey);
    return saved;
  }

  // ── GET /drivers/me/profile ──────────────────────────────────────────

  async getApplication(user: RequestUser): Promise<ApplicationView> {
    this.assertApplicant(user);
    const [account, profile, documents] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.sub }, select: { jurisdiction: true } }),
      this.prisma.driverProfile.findUnique({ where: { id: user.sub }, select: { approvedAt: true } }),
      this.prisma.driverDocument.findMany({
        where: { userId: user.sub },
        // Jamais la clé de stockage ni l'empreinte : inutiles au client.
        select: { type: true, status: true, uploadedAt: true },
        orderBy: { uploadedAt: 'asc' },
      }),
    ]);
    if (!account) throw new UnauthorizedException('Compte introuvable');

    const required = requiredDocuments(await this.requiresVtcCard(account.jurisdiction));
    const uploaded = new Set(documents.map((d) => d.type));
    return {
      status: !profile ? 'draft' : profile.approvedAt ? 'approved' : 'pending',
      documents,
      requiredDocuments: required,
      missingDocuments: required.filter((t) => !uploaded.has(t)),
    };
  }

  // ── POST /drivers/apply ──────────────────────────────────────────────

  async apply(user: RequestUser, dto: DriverApplicationDto): Promise<ApplicationView> {
    this.assertApplicant(user);

    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { jurisdiction: true, deletedAt: true },
    });
    if (!account || account.deletedAt) throw new UnauthorizedException('Compte introuvable ou désactivé');

    const existing = await this.prisma.driverProfile.findUnique({
      where: { id: user.sub },
      select: { approvedAt: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.approvedAt ? 'Votre compte chauffeur est déjà validé' : 'Votre candidature est déjà en cours de vérification',
      );
    }

    const requiresVtcCard = await this.requiresVtcCard(account.jurisdiction);
    this.validateBusinessRules(dto, requiresVtcCard);

    // Tous les documents obligatoires doivent déjà être envoyés.
    const docs = await this.prisma.driverDocument.findMany({
      where: { userId: user.sub },
      select: { type: true },
    });
    const uploaded = new Set(docs.map((d) => d.type));
    const missing = requiredDocuments(requiresVtcCard).filter((t) => !uploaded.has(t));
    if (missing.length > 0) {
      throw new BadRequestException(`Documents manquants : ${missing.map(documentLabel).join(', ')}`);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.sub },
          data: { firstName: dto.personal.firstName, lastName: dto.personal.lastName, phone: dto.personal.phone },
        });
        await tx.driverProfile.create({
          data: {
            id: user.sub,
            licenseNumber: dto.licenses.licenseNumber,
            licenseExpiry: new Date(dto.licenses.licenseExpiry),
            vtcCardNumber: dto.licenses.vtcCardNumber ?? null,
            vtcCardExpiry: dto.licenses.vtcCardExpiry ? new Date(dto.licenses.vtcCardExpiry) : null,
            revtcNumber: dto.licenses.revtcNumber ?? null,
            pmrTrained: dto.pmrTrained,
            languages: dto.personal.languages,
            preferredShuttle: dto.vehicle.shuttleType,
            // roseEligible, documentsVerified, approvedAt : décidés par un
            // admin (Module 10), jamais par le candidat.
          },
        });
        await tx.vehicle.create({
          data: {
            driverId: user.sub,
            shuttleType: dto.vehicle.shuttleType,
            brand: dto.vehicle.brand,
            model: dto.vehicle.model,
            color: dto.vehicle.color,
            plate: dto.vehicle.plate,
            capacity: dto.vehicle.capacity,
            pmrEquipped: dto.vehicle.pmrEquipped,
            dashcamActive: dto.vehicle.dashcamInstalled,
            insuranceExpiry: new Date(dto.vehicle.insuranceExpiry),
            technicalControlExpiry: new Date(dto.vehicle.technicalControlExpiry),
            // Hors matching tant que le dossier n'est pas validé.
            isAvailable: false,
            jurisdiction: account.jurisdiction,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String((err.meta as any)?.target ?? '');
        throw new ConflictException(
          target.includes('plate')
            ? 'Ce véhicule est déjà enregistré'
            : 'Ce numéro de téléphone est déjà utilisé',
        );
      }
      throw err;
    }

    this.logger.log(`Candidature chauffeur envoyée (utilisateur ${user.sub})`);
    return this.getApplication(user);
  }

  // ── Règles ───────────────────────────────────────────────────────────

  private validateBusinessRules(dto: DriverApplicationDto, requiresVtcCard: boolean) {
    const now = Date.now();
    const future = (iso: string | undefined, label: string) => {
      if (!iso || new Date(iso).getTime() <= now) {
        throw new BadRequestException(`${label} : la date d'échéance doit être dans le futur`);
      }
    };
    future(dto.licenses.licenseExpiry, 'Permis de conduire');
    future(dto.vehicle.insuranceExpiry, 'Assurance');
    future(dto.vehicle.technicalControlExpiry, 'Contrôle technique');
    if (requiresVtcCard) {
      if (!dto.licenses.vtcCardNumber) throw new BadRequestException('Numéro de carte VTC requis');
      future(dto.licenses.vtcCardExpiry, 'Carte VTC');
    }
    // Partie 8 : navette Accessibilité = véhicule équipé + chauffeur formé.
    if (dto.vehicle.shuttleType === 'accessibility' && (!dto.vehicle.pmrEquipped || !dto.pmrTrained)) {
      throw new BadRequestException(
        'La navette Accessibilité exige un véhicule équipé PMR et un chauffeur formé à l’accueil PMR',
      );
    }
  }

  private assertApplicant(user: RequestUser) {
    if (!APPLICANT_ROLES.includes(user.role)) {
      throw new ForbiddenException('Ce type de compte ne peut pas devenir chauffeur');
    }
  }

  private async requiresVtcCard(jurisdiction: string): Promise<boolean> {
    const config = await this.prisma.jurisdictionConfig.findUnique({
      where: { code: jurisdiction },
      select: { requiresVtcCard: true },
    });
    // Juridiction inconnue : on applique la règle la plus stricte.
    return config?.requiresVtcCard ?? true;
  }

  private async enforceUploadRate(userId: string) {
    const key = `driver:upload:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > DOCUMENT_UPLOADS_PER_HOUR) {
      throw new HttpException('Trop d’envois de documents — réessayez dans une heure', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

function documentLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    vehicle_registration: 'carte grise',
    vehicle_insurance: 'attestation d’assurance',
    technical_control: 'contrôle technique',
    driving_license: 'permis de conduire',
    vtc_card: 'carte VTC',
    revtc_proof: 'justificatif REVTC',
  };
  return labels[type];
}
