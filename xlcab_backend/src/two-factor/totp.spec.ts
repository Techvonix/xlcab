import { randomBytes } from 'crypto';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hotp,
  otpauthUrl,
  timeStep,
  verifyTotp,
} from './totp';

// Secret des vecteurs de test officiels : "12345678901234567890" (ASCII).
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP', () => {
  it('HOTP : vecteurs de test du RFC 4226 (annexe D)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it('TOTP SHA-1 : vecteurs du RFC 6238 (annexe B, 8 chiffres)', () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [t, code] of vectors) expect(hotp(RFC_SECRET, timeStep(t), 8)).toBe(code);
  });

  it('accepte le code courant et ±30 s, refuse au-delà', () => {
    const t = 1_790_000_000;
    const code = hotp(RFC_SECRET, timeStep(t));
    expect(verifyTotp(RFC_SECRET, code, t)).toBe(timeStep(t));
    expect(verifyTotp(RFC_SECRET, code, t + 30)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, t - 30)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, t + 90)).toBeNull();
  });

  it('refuse les codes mal formés', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 345']) {
      expect(verifyTotp(RFC_SECRET, code, 1_790_000_000)).toBeNull();
    }
  });

  it('base32 aller-retour (format des applications d’authentification)', () => {
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const secret = randomBytes(20);
    expect(base32Decode(base32Encode(secret))).toEqual(secret);
  });

  it('URI otpauth pour le QR code', () => {
    const url = otpauthUrl(RFC_SECRET, 'ops@xlcab.com');
    expect(url).toMatch(/^otpauth:\/\/totp\/XLCAB%3Aops%40xlcab\.com\?/);
    expect(url).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(url).toContain('issuer=XLCAB');
  });

  it('chiffrement du secret : aller-retour, et toute altération est détectée', () => {
    const key = randomBytes(32);
    const enc = encryptSecret(RFC_SECRET, key);
    expect(enc).not.toContain(RFC_SECRET.toString('base64'));
    expect(decryptSecret(enc, key)).toEqual(RFC_SECRET);

    const [iv, tag, data] = enc.split('.');
    const flipped = Buffer.from(Buffer.from(data, 'base64').map((b) => b ^ 1));
    const tampered = [iv, tag, flipped.toString('base64')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });
});
