/**
 * Customer password reset. Not a 'use server' file, so nothing here is directly
 * callable from a client; lib/actions/password-reset.actions.ts is the surface.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from './db';
import { passwordResetTokens, users } from './schema';
import { hashPassword } from './auth';
import { MIN_PASSWORD_LENGTH } from './account';
import { sendPasswordResetEmail } from './email';
import { getSiteUrl } from './site-url';

/** The email template tells the customer the link lasts one hour. */
const TOKEN_TTL_MS = 60 * 60 * 1000;
/** One email per account in this window, so the form cannot flood an inbox. */
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
/** 32 random bytes in base64url. Anything else is refused without a query. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issues and mails a token if the address has an account. Returns nothing, and
 * the action runs it after the response, so neither the reply nor its timing
 * says whether the account exists.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const db = getDb();

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return;

  const now = Date.now();
  const [recent] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        gt(passwordResetTokens.createdAt, new Date(now - RESEND_COOLDOWN_MS))
      )
    )
    .limit(1);
  if (recent) return;

  // Only the newest link works. Expired rows of other accounts go too, so the
  // table stays small with no scheduled cleanup (nothing may poll the database).
  await db
    .delete(passwordResetTokens)
    .where(
      or(
        eq(passwordResetTokens.userId, user.id),
        lt(passwordResetTokens.expiresAt, new Date(now))
      )
    );

  const rawToken = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(now + TOKEN_TTL_MS),
  });

  const result = await sendPasswordResetEmail({
    email: user.email,
    name: user.name || 'there',
    resetLink: `${getSiteUrl()}/auth/reset-password?token=${rawToken}`,
  });
  if (!result.success) {
    console.error('Password reset email failed:', result.error);
  }
}

export type ConfirmResetResult =
  | { ok: true }
  | { ok: false; reason: 'weak_password' | 'invalid_token' };

/**
 * Spends the token and replaces the password. Bumping token_version signs out
 * every existing session, including an intruder's. Completing the flow also
 * proves the customer controls the mailbox, hence `verified`.
 */
export async function confirmPasswordReset(
  rawToken: string,
  newPassword: string
): Promise<ConfirmResetResult> {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'weak_password' };
  }
  if (typeof rawToken !== 'string' || !TOKEN_FORMAT.test(rawToken)) {
    return { ok: false, reason: 'invalid_token' };
  }

  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const usable = () =>
    and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    );

  // Checked before bcrypt, so a bogus token costs no CPU.
  const [row] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(usable())
    .limit(1);
  if (!row) return { ok: false, reason: 'invalid_token' };

  const passwordHash = await hashPassword(newPassword);

  // The conditional UPDATE is what makes the token single use: of two
  // concurrent requests, only one gets a row back. The Neon HTTP driver has no
  // transactions, so if the next write fails the token is spent and the
  // customer requests a new one, which fails safe.
  const [claimed] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(usable())
    .returning({ id: passwordResetTokens.id });
  if (!claimed) return { ok: false, reason: 'invalid_token' };

  await db
    .update(users)
    .set({
      passwordHash,
      tokenVersion: sql`${users.tokenVersion} + 1`,
      verified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.userId))
    .returning({ id: users.id });

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId));

  return { ok: true };
}
