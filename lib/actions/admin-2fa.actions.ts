'use server';

import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { admins } from '@/lib/schema';
import {
  ADMIN_PENDING_COOKIE,
  createToken,
  isAdmin2faRequired,
  verifyAdminPendingToken,
} from '@/lib/auth';
import { getSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/session-cookie';
import { rateLimitAction } from '@/lib/rate-limit-guards';
import {
  confirmEnrollment,
  getTotpStatus,
  isTotpKeyConfigured,
  removeEnrollment,
  startEnrollment,
  verifySecondFactor,
} from '@/lib/admin-2fa';

/**
 * Every export here is a public endpoint, so each one establishes its own
 * authority: a full admin session, or the pending cookie that says the password
 * was right a few minutes ago. The pending cookie only counts while 2FA is
 * required, and can only ever complete sign-in or a first enrolment.
 */

const EXPIRED = 'Your sign-in has expired. Please start again.';
const UNAVAILABLE =
  'Two-factor sign-in is unavailable. Check that docs/migrations/admin_totp.sql has been ' +
  'applied and ADMIN_TOTP_ENC_KEY is set.';

async function pendingAdminId(): Promise<string | null> {
  if (!isAdmin2faRequired()) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_PENDING_COOKIE)?.value;
  return token ? verifyAdminPendingToken(token) : null;
}

/** Turns the pending cookie into a real session, with the claim that proves 2FA. */
async function completeSignIn(adminId: string): Promise<boolean> {
  const db = getDb();
  const [admin] = await db
    .select({ id: admins.id, email: admins.email, name: admins.name })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  if (!admin) return false;

  const token = await createToken(
    { sub: admin.id, email: admin.email, name: admin.name || '', type: 'admin', mfa: true },
    true
  );
  await setSessionCookie(token, true);
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_PENDING_COOKIE);
  return true;
}

/** Second step of sign-in, for an admin who has an authenticator. */
export async function verifyAdminTwoFactorAction(
  code: string
): Promise<{ ok: true; usedRecoveryCode: boolean } | { error: string }> {
  const adminId = await pendingAdminId();
  if (!adminId) return { error: EXPIRED };

  const limited = await rateLimitAction('admin2fa', { subject: adminId });
  if (limited) return { error: limited };

  try {
    const result = await verifySecondFactor(adminId, code);
    if (!result) return { error: 'That code is not valid. Check it and try again.' };
    if (!(await completeSignIn(adminId))) return { error: EXPIRED };
    return { ok: true, usedRecoveryCode: result.method === 'recovery' };
  } catch (error) {
    console.error('[admin-2fa] verify failed:', error);
    return { error: UNAVAILABLE };
  }
}

async function enrollingAdmin(): Promise<{
  adminId: string;
  account: string;
  viaPending: boolean;
} | null> {
  const session = await getSession(true);
  if (session) return { adminId: session.id, account: session.email, viaPending: false };

  const adminId = await pendingAdminId();
  if (!adminId) return null;
  const db = getDb();
  const [admin] = await db
    .select({ email: admins.email })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);
  return admin ? { adminId, account: admin.email, viaPending: true } : null;
}

export async function startAdminEnrollmentAction(): Promise<
  { secret: string; uri: string; qr: string } | { error: string }
> {
  try {
    const admin = await enrollingAdmin();
    if (!admin) return { error: EXPIRED };

    const started = await startEnrollment(admin.adminId, admin.account);
    if (!started) return { error: 'An authenticator is already set up for this account.' };
    // The QR code is drawn here, on the server, so the secret never reaches a
    // third-party QR service. Returned as an SVG data URL for a plain <img>.
    const svg = await QRCode.toString(started.uri, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });
    return { ...started, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  } catch (error) {
    console.error('[admin-2fa] enrolment start failed:', error);
    return { error: UNAVAILABLE };
  }
}

export async function confirmAdminEnrollmentAction(
  code: string
): Promise<{ recoveryCodes: string[] } | { error: string }> {
  try {
    const admin = await enrollingAdmin();
    if (!admin) return { error: EXPIRED };

    const limited = await rateLimitAction('admin2fa', { subject: admin.adminId });
    if (limited) return { error: limited };

    const recoveryCodes = await confirmEnrollment(admin.adminId, code);
    if (!recoveryCodes) {
      return { error: 'That code is not valid. Check your device clock and try again.' };
    }
    // Enrolling during sign-in is the second factor for this session.
    if (admin.viaPending && !(await completeSignIn(admin.adminId))) return { error: EXPIRED };
    return { recoveryCodes };
  } catch (error) {
    console.error('[admin-2fa] enrolment confirm failed:', error);
    return { error: UNAVAILABLE };
  }
}

export async function getAdminTwoFactorStatusAction(): Promise<
  | {
      required: boolean;
      keyConfigured: boolean;
      /** False when the table could not be read, usually a missing migration. */
      available: boolean;
      enrolled: boolean;
      recoveryCodesLeft: number;
    }
  | { error: string }
> {
  const session = await getSession(true);
  if (!session) return { error: EXPIRED };

  const base = { required: isAdmin2faRequired(), keyConfigured: isTotpKeyConfigured() };
  try {
    return { ...base, available: true, ...(await getTotpStatus(session.id)) };
  } catch (error) {
    console.error('[admin-2fa] status failed:', error);
    return { ...base, available: false, enrolled: false, recoveryCodesLeft: 0 };
  }
}

/**
 * Removes the current authenticator so a new one can be enrolled. Takes a current
 * code or a recovery code, so a borrowed session alone cannot replace it.
 */
export async function removeAdminAuthenticatorAction(
  code: string
): Promise<{ ok: true } | { error: string }> {
  const session = await getSession(true);
  if (!session) return { error: EXPIRED };

  const limited = await rateLimitAction('admin2fa', { subject: session.id });
  if (limited) return { error: limited };

  try {
    if (!(await verifySecondFactor(session.id, code))) {
      return { error: 'That code is not valid. Check it and try again.' };
    }
    await removeEnrollment(session.id);
    return { ok: true };
  } catch (error) {
    console.error('[admin-2fa] remove failed:', error);
    return { error: UNAVAILABLE };
  }
}
