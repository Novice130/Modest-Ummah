import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { adminTotp } from '@/lib/schema';
import {
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  parseEncryptionKey,
  verifyTotp,
} from '@/lib/totp';

/**
 * Database side of admin two-factor. Nothing here runs at import time, and
 * nothing on the sign-in path calls it unless ADMIN_2FA_REQUIRED=true.
 */

export type AdminTotpStage = 'verify' | 'enroll';

function encryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.ADMIN_TOTP_ENC_KEY);
}

export function isTotpKeyConfigured(): boolean {
  return encryptionKey() !== null;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/** Throws if the table is missing, which refuses the sign-in: fails closed. */
export async function adminTotpStage(adminId: string): Promise<AdminTotpStage> {
  const db = getDb();
  const [row] = await db
    .select({ confirmedAt: adminTotp.confirmedAt })
    .from(adminTotp)
    .where(eq(adminTotp.adminId, adminId))
    .limit(1);
  return row?.confirmedAt ? 'verify' : 'enroll';
}

export async function getTotpStatus(adminId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      confirmedAt: adminTotp.confirmedAt,
      recoveryCodeHashes: adminTotp.recoveryCodeHashes,
    })
    .from(adminTotp)
    .where(eq(adminTotp.adminId, adminId))
    .limit(1);
  return {
    enrolled: Boolean(row?.confirmedAt),
    recoveryCodesLeft: row?.confirmedAt ? row.recoveryCodeHashes.length : 0,
  };
}

/**
 * Stores a new secret, replacing any unconfirmed one. Returns null if this admin
 * already has a confirmed authenticator: that one is only removed after proving
 * possession of it, see removeEnrollment.
 */
export async function startEnrollment(adminId: string, account: string) {
  const key = encryptionKey();
  if (!key) throw new Error('ADMIN_TOTP_ENC_KEY is not set to 64 hex characters');

  const secret = generateTotpSecret();
  const secretEnc = encryptTotpSecret(secret, key, adminId);

  const db = getDb();
  const saved = await db
    .insert(adminTotp)
    .values({ adminId, secretEnc })
    .onConflictDoUpdate({
      target: adminTotp.adminId,
      set: { secretEnc, updatedAt: new Date() },
      where: isNull(adminTotp.confirmedAt),
    })
    .returning({ adminId: adminTotp.adminId });
  if (saved.length === 0) return null;

  return {
    secret: base32Encode(secret),
    uri: otpauthUri({ secret, account, issuer: 'Modest Ummah' }),
  };
}

/** Returns the plaintext recovery codes, once, or null if the code was wrong. */
export async function confirmEnrollment(adminId: string, code: string): Promise<string[] | null> {
  const key = encryptionKey();
  if (!key) return null;

  const db = getDb();
  const [row] = await db
    .select({ secretEnc: adminTotp.secretEnc })
    .from(adminTotp)
    .where(and(eq(adminTotp.adminId, adminId), isNull(adminTotp.confirmedAt)))
    .limit(1);
  if (!row) return null;

  const secret = decryptTotpSecret(row.secretEnc, key, adminId);
  const step = secret && verifyTotp(secret, normalizeCode(code), unixNow());
  if (step === null || step === undefined) return null;

  const codes = generateRecoveryCodes();
  const updated = await db
    .update(adminTotp)
    .set({
      confirmedAt: new Date(),
      lastUsedStep: step,
      recoveryCodeHashes: codes.map((plain) => hashRecoveryCode(adminId, plain)),
      updatedAt: new Date(),
    })
    .where(and(eq(adminTotp.adminId, adminId), isNull(adminTotp.confirmedAt)))
    .returning({ adminId: adminTotp.adminId });
  return updated.length === 1 ? codes : null;
}

function normalizeCode(code: string): string {
  return String(code).replace(/\s/g, '');
}

/**
 * Checks a six-digit code or a recovery code. Both are spent by a single
 * conditional UPDATE, so two simultaneous requests cannot use the same one.
 *
 * Recovery codes need neither the encryption key nor the secret, so they still
 * work if ADMIN_TOTP_ENC_KEY is lost.
 */
export async function verifySecondFactor(
  adminId: string,
  rawCode: string
): Promise<{ method: 'totp' | 'recovery' } | null> {
  const code = normalizeCode(rawCode);
  const db = getDb();

  const [row] = await db
    .select({
      secretEnc: adminTotp.secretEnc,
      confirmedAt: adminTotp.confirmedAt,
      lastUsedStep: adminTotp.lastUsedStep,
    })
    .from(adminTotp)
    .where(eq(adminTotp.adminId, adminId))
    .limit(1);
  if (!row?.confirmedAt) return null;

  if (/^\d{6}$/.test(code)) {
    const key = encryptionKey();
    const secret = key && decryptTotpSecret(row.secretEnc, key, adminId);
    if (!secret) {
      console.error('[admin-2fa] cannot decrypt the secret: check ADMIN_TOTP_ENC_KEY');
      return null;
    }
    const step = verifyTotp(secret, code, unixNow(), row.lastUsedStep);
    if (step === null) return null;

    const spent = await db
      .update(adminTotp)
      .set({ lastUsedStep: step, updatedAt: new Date() })
      .where(
        and(
          eq(adminTotp.adminId, adminId),
          or(isNull(adminTotp.lastUsedStep), lt(adminTotp.lastUsedStep, step))
        )
      )
      .returning({ adminId: adminTotp.adminId });
    return spent.length === 1 ? { method: 'totp' } : null;
  }

  const hash = hashRecoveryCode(adminId, code);
  const spent = await db
    .update(adminTotp)
    .set({
      recoveryCodeHashes: sql`array_remove(${adminTotp.recoveryCodeHashes}, ${hash}::text)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adminTotp.adminId, adminId),
        sql`${hash}::text = ANY(${adminTotp.recoveryCodeHashes})`
      )
    )
    .returning({ adminId: adminTotp.adminId });
  return spent.length === 1 ? { method: 'recovery' } : null;
}

export async function removeEnrollment(adminId: string): Promise<void> {
  const db = getDb();
  await db.delete(adminTotp).where(eq(adminTotp.adminId, adminId));
}
