import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService, DEFAULT_TERMS_VERSION } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const IP = '203.0.113.7';
// Consentement aux CGU en vigueur (Partie 8, RGPD).
const CONSENT = { termsVersion: DEFAULT_TERMS_VERSION, ipAddress: IP, userAgent: 'XLCAB/1.0 (Android)' };

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: any };
  let redis: Record<string, jest.Mock>;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
      del: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };

    // Chaque appel à sign() renvoie un token distinct, pour pouvoir
    // distinguer access / refresh et ancienne / nouvelle session.
    let n = 0;
    jwt = {
      sign: jest.fn().mockImplementation(() => `fake.jwt.token.${++n}`),
      verify: jest.fn(),
    };

    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: JwtService, useValue: jwt },
        // TERMS_VERSION non défini : version par défaut ; tout le reste vaut 'secret'.
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => (key === 'TERMS_VERSION' ? undefined : 'secret')) } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── Inscription ───────────────────────────────────────────────────

  describe('signup', () => {
    it('crée un utilisateur et retourne une paire de tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', role: 'passenger' });

      const result = await service.signup('test@xlcab.com', 'motdepasse123', CONSENT);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('impose toujours le rôle "passenger" (Partie 8)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', role: 'passenger' });

      await service.signup('test@xlcab.com', 'motdepasse123', CONSENT);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'passenger' }),
      });
    });

    it('enregistre le consentement : version des CGU, date, et IP / appareil en audit (RGPD)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', role: 'passenger' });

      await service.signup('test@xlcab.com', 'motdepasse123', CONSENT);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ termsVersion: DEFAULT_TERMS_VERSION, termsAcceptedAt: expect.any(Date) }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'user.consent',
          ipAddress: IP,
          userAgent: 'XLCAB/1.0 (Android)',
          metadata: { termsVersion: DEFAULT_TERMS_VERSION },
        }),
      );
    });

    it('refuse une version des CGU périmée (application pas à jour)', async () => {
      await expect(
        service.signup('test@xlcab.com', 'motdepasse123', { ...CONSENT, termsVersion: '2025-01-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejette si l'email existe déjà", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.signup('test@xlcab.com', 'motdepasse123', CONSENT)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── Connexion ─────────────────────────────────────────────────────

  describe('login', () => {
    it('rejette un email inexistant sans révéler la raison', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('inconnu@xlcab.com', 'x', IP)).rejects.toThrow(
        'Email ou mot de passe incorrect',
      );
    });

    it('compte la tentative par email+IP AVANT la recherche en base (Partie 10)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('Inconnu@xlcab.com', 'x', IP)).rejects.toThrow();

      expect(redis.incr).toHaveBeenCalledWith(`login:attempts:inconnu@xlcab.com:${IP}`);
      // L'incrément a bien eu lieu avant l'accès à la base.
      expect(redis.incr.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('bloque un email inexistant après 5 tentatives, sans toucher la base', async () => {
      redis.incr.mockResolvedValue(6);

      await expect(service.login('inconnu@xlcab.com', 'x', IP)).rejects.toThrow(
        'Trop de tentatives',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejette un mot de passe incorrect', async () => {
      const hash = await bcrypt.hash('bonMotDePasse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'passenger',
        passwordHash: hash,
      });

      await expect(service.login('test@xlcab.com', 'mauvaisMotDePasse', IP)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('bloque après 6 tentatives même avec le bon mot de passe', async () => {
      const hash = await bcrypt.hash('bonMotDePasse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'passenger',
        passwordHash: hash,
      });
      redis.incr.mockResolvedValue(6);

      await expect(service.login('test@xlcab.com', 'bonMotDePasse', IP)).rejects.toThrow(
        'Trop de tentatives',
      );
    });

    it('connecte avec succès et réinitialise le compteur', async () => {
      const hash = await bcrypt.hash('bonMotDePasse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'passenger',
        passwordHash: hash,
      });

      const result = await service.login('test@xlcab.com', 'bonMotDePasse', IP);

      expect(redis.del).toHaveBeenCalledWith(`login:attempts:test@xlcab.com:${IP}`);
      expect(result).toHaveProperty('accessToken');
    });
  });

  // ── OTP ───────────────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('envoie un code et compte par numéro ET par IP (Partie 8)', async () => {
      const result = await service.sendOtp('+33612345678', IP);

      expect(result).toEqual({ sent: true });
      expect(redis.incr).toHaveBeenCalledWith('otp:send:phone:+33612345678');
      expect(redis.incr).toHaveBeenCalledWith(`otp:send:ip:${IP}`);
      expect(redis.set).toHaveBeenCalledWith(
        'otp:code:+33612345678',
        expect.stringMatching(/^\d{6}$/),
        'EX',
        300,
      );
    });

    it('refuse au-delà de 3 envois pour le même numéro', async () => {
      redis.incr.mockImplementation(async (key: string) =>
        key.startsWith('otp:send:phone:') ? 4 : 1,
      );

      await expect(service.sendOtp('+33612345678', IP)).rejects.toThrow(
        'Trop de demandes de code',
      );
      expect(redis.set).not.toHaveBeenCalled(); // aucun code généré
    });

    it('refuse au-delà de 10 envois depuis la même IP', async () => {
      redis.incr.mockImplementation(async (key: string) =>
        key.startsWith('otp:send:ip:') ? 11 : 1,
      );

      await expect(service.sendOtp('+33699999999', IP)).rejects.toThrow(
        'Trop de demandes de code',
      );
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('valide un code correct et marque le téléphone vérifié', async () => {
      redis.get.mockResolvedValue('123456');

      const result = await service.verifyOtp('+33612345678', '123456');

      expect(result).toEqual({ verified: true });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { phone: '+33612345678' },
        data: { phoneVerified: true },
      });
    });

    it('rejette un code incorrect', async () => {
      redis.get.mockResolvedValue('654321');

      await expect(service.verifyOtp('+33612345678', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── Sessions / refresh ────────────────────────────────────────────

  describe('sessions et refresh', () => {
    it('stocke une clé de refresh par session : refresh:{userId}:{jti} (Partie 10)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', role: 'passenger' });

      await service.signup('a@xlcab.com', 'motdepasse123', CONSENT);
      await service.signup('b@xlcab.com', 'motdepasse123', CONSENT);

      const keys = redis.set.mock.calls.map((c) => c[0] as string);
      expect(keys).toHaveLength(2);
      keys.forEach((k) => expect(k).toMatch(/^refresh:user-1:[0-9a-f-]{36}$/));
      // Deux sessions distinctes → deux clés distinctes (multi-appareils).
      expect(keys[0]).not.toEqual(keys[1]);
    });

    it("fait la rotation et relit le rôle actuel en base (Partie 10)", async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', role: 'driver', jti: 'old-jti' });
      redis.get.mockResolvedValue('old.refresh.token');
      // Le rôle a changé depuis l'émission du token.
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'passenger' });

      const result = await service.refresh('old.refresh.token');

      expect(redis.get).toHaveBeenCalledWith('refresh:user-1:old-jti');
      expect(redis.del).toHaveBeenCalledWith('refresh:user-1:old-jti');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', role: 'passenger' }),
        expect.anything(),
      );
      expect(result).toHaveProperty('refreshToken');
    });

    it('refuse un refresh pour un compte supprimé', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', role: 'passenger', jti: 'j1' });
      redis.get.mockResolvedValue('tok');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'passenger',
        deletedAt: new Date(),
      });

      await expect(service.refresh('tok')).rejects.toThrow('Compte introuvable ou désactivé');
      expect(redis.del).toHaveBeenCalledWith('refresh:user-1:j1');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it("refuse la réutilisation d'un ancien refresh token", async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', role: 'passenger', jti: 'j1' });
      redis.get.mockResolvedValue('nouveau.token.apres.rotation');

      await expect(service.refresh('ancien.token')).rejects.toThrow('Refresh token révoqué');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("le logout ne révoque que la session de l'appareil courant", async () => {
      await service.logout('user-1', 'j1', 'access.token');

      expect(redis.del).toHaveBeenCalledWith('refresh:user-1:j1');
      expect(redis.del).not.toHaveBeenCalledWith('refresh:user-1');
      expect(redis.set).toHaveBeenCalledWith('blacklist:access.token', '1', 'EX', 900);
    });
  });
});
