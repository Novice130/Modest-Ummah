import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), plus the secret and recovery-code
 * handling around it. Pure functions with no framework or database imports, so
 * scripts/check-totp.ts can run them directly against the RFC vectors.
 */

export type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.toUpperCase().replace(/[\s=-]/g, '')) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: TotpAlgorithm = 'sha1'
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpStep(unixSeconds: number): number {
  return Math.floor(unixSeconds / TOTP_PERIOD_SECONDS);
}

export function totp(
  secret: Buffer,
  unixSeconds: number,
  digits = TOTP_DIGITS,
  algorithm: TotpAlgorithm = 'sha1'
): string {
  return hotp(secret, totpStep(unixSeconds), digits, algorithm);
}

/**
 * Returns the time step the code matched, or null. Accepts one step either side
 * for clock drift. A step at or below `afterStep` is never accepted, which is the
 * replay protection: the caller stores the returned step and passes it back.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  unixSeconds: number,
  afterStep: number | null = null
): number | null {
  if (!/^\d{6}$/.test(code)) return null;

  const current = totpStep(unixSeconds);
  const given = Buffer.from(code);
  let matched: number | null = null;
  // No early return, so the time taken does not reveal which step matched.
  for (const step of [current - 1, current, current + 1]) {
    if (step < 0 || (afterStep !== null && step <= afterStep)) continue;
    if (timingSafeEqual(given, Buffer.from(hotp(secret, step)))) matched = step;
  }
  return matched;
}

export function generateTotpSecret(): Buffer {
  return randomBytes(20); // 160 bits, the size RFC 4226 recommends.
}

export function otpauthUri(params: { secret: Buffer; account: string; issuer: string }): string {
  const issuer = encodeURIComponent(params.issuer);
  const label = `${issuer}:${encodeURIComponent(params.account)}`;
  return (
    `otpauth://totp/${label}?secret=${base32Encode(params.secret)}&issuer=${issuer}` +
    `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`
  );
}

// ─── Secret at rest ─────────────────────────────────────

/**
 * ADMIN_TOTP_ENC_KEY must be 32 bytes of hex. It has no fallback: deriving it
 * from JWT_SECRET would put both factors behind one secret.
 */
export function parseEncryptionKey(value: string | undefined): Buffer | null {
  const hex = value?.trim();
  return hex && /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

/** AES-256-GCM. The admin id is bound in, so a ciphertext cannot be moved between rows. */
export function encryptTotpSecret(secret: Buffer, key: Buffer, adminId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(adminId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Null on anything malformed, tampered with, or encrypted under another key. */
export function decryptTotpSecret(
  serialized: string,
  key: Buffer,
  adminId: string
): Buffer | null {
  const parts = serialized.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
    decipher.setAAD(Buffer.from(adminId, 'utf8'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

// ─── Recovery codes ─────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10;

/** 80 random bits as XXXX-XXXX-XXXX-XXXX, readable from a printout. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const code = base32Encode(randomBytes(10));
    return code.match(/.{4}/g)!.join('-');
  });
}

/**
 * SHA-256 suffices here, unlike for a password: the input is 80 random bits, so
 * there is nothing to guess offline and no need for a slow hash.
 */
export function hashRecoveryCode(adminId: string, code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return createHash('sha256')
    .update(`admin-totp-recovery:${adminId}:${normalized}`, 'utf8')
    .digest('hex');
}
