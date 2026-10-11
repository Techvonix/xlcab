import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// TOTP (RFC 6238, sur HOTP RFC 4226) : codes à 6 chiffres renouvelés
// toutes les 30 s, compatibles Google Authenticator, Authy, 1Password…

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error('Caractère base32 invalide');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret aléatoire de 160 bits (recommandation RFC 4226). */
export const generateSecret = () => randomBytes(20);

/** Code HOTP pour un compteur donné (troncature dynamique RFC 4226 §5.3). */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export const timeStep = (unixSeconds: number) => Math.floor(unixSeconds / TOTP_STEP_SECONDS);

/**
 * Vérifie un code en tolérant ±1 pas (horloge du téléphone décalée de
 * 30 s au plus). Retourne le pas qui correspond, ou null.
 * Comparaison en temps constant (pas de fuite par le temps de réponse).
 */
export function verifyTotp(secret: Buffer, code: string, unixSeconds: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = timeStep(unixSeconds);
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** URI à afficher en QR code pour l'application d'authentification. */
export function otpauthUrl(secret: Buffer, accountName: string, issuer = 'XLCAB'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Chiffrement du secret au repos (AES-256-GCM) ──────────────────────────

/** "iv.tag.chiffré" en base64. La clé fait 32 octets. */
export function encryptSecret(secret: Buffer, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string, key: Buffer): Buffer {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
