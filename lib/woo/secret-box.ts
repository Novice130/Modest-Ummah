import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Reversible storage for WooCommerce consumer secrets.
 *
 * The Basic-auth path only ever needs sha256(secret) — a one-way digest is the
 * correct storage there and stays in place. OAuth 1.0a is different: the server
 * must recompute an HMAC over the request using the secret as the signing key,
 * which means it needs the plaintext back. WooCommerce itself stores
 * consumer_secret in cleartext in wp_woocommerce_api_keys; encrypting at rest
 * is strictly better than matching that.
 *
 * AES-256-GCM, fresh 12-byte IV per secret, authentication tag verified on
 * open. Serialized as `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * 32-byte key from WOO_SECRET_ENC_KEY when set, otherwise derived from
 * JWT_SECRET so local development needs no extra variable. Rotating either one
 * makes existing ciphertexts unreadable — the affected keys must be
 * regenerated, which is why decryptSecret() fails soft and the OAuth path
 * reports "regenerate the key" rather than an opaque 401.
 */
function encryptionKey(): Buffer {
  const configured = process.env.WOO_SECRET_ENC_KEY;
  if (configured) {
    const hex = configured.trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
    // Any other shape is hashed to the right length rather than rejected.
    return createHash('sha256').update(hex, 'utf8').digest();
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      'WOO_SECRET_ENC_KEY or JWT_SECRET must be set to store API key secrets'
    );
  }
  return createHash('sha256').update(`woo-secret-box:${jwtSecret}`, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Returns null rather than throwing on anything malformed, tampered with, or
 * encrypted under a different key. Callers treat null as "this key cannot use
 * OAuth" — never as an authentication success.
 */
export function decryptSecret(serialized: string | null | undefined): string | null {
  if (!serialized) return null;

  const parts = serialized.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;

    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}
