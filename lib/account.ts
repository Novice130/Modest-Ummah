/**
 * Self-serve account writes, shared by the storefront's Server Actions
 * (lib/actions/account.actions.ts) and the app's /api/v1/me routes.
 *
 * The logic lives here rather than in either caller because a Dart client
 * cannot invoke a Server Action, and duplicating a password-rotation routine
 * is how the two copies drift.
 */
import { getDb } from './db';
import { users } from './schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './auth';

export const MIN_PASSWORD_LENGTH = 8;

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

/**
 * Renames the account. Email is deliberately not editable: changing the login
 * identity needs a verification flow that does not exist, and rewriting it
 * silently would be worse than refusing — the same reasoning PATCH
 * /api/v1/me already applies.
 */
export async function updateUserName(userId: string, name: string): Promise<AccountProfile> {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error('Name is required');

  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      avatar: users.avatar,
    });

  if (!user) throw new Error('Account not found');
  return { ...user, name: user.name || '' };
}

/**
 * Rotates the password after checking the current one, and bumps
 * users.token_version so every token issued against the old password stops
 * being accepted (see getAuthFromRequest in lib/auth.ts). The caller is
 * responsible for dropping its own session afterwards.
 *
 * Throws on a wrong current password rather than returning a flag: a caller
 * that forgets to check a boolean would tell the user their password changed
 * when it did not, which is the bug this function exists to end.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!currentPassword || !newPassword) throw new Error('Both passwords are required');
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error('Account not found');

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error('Your current password is incorrect');
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      tokenVersion: sql`${users.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
