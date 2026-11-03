import { getDb } from '@/lib/db';
import { adminLoginAttempts } from '@/lib/schema';
import { eq, and, gte, count } from 'drizzle-orm';

export const MAX_ADMIN_ATTEMPTS = 5;
export const ADMIN_ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Locks on email + IP and on IP, never on email alone. A counter on the email
 * let anyone who knew the address lock the real admin out, from anywhere, for as
 * long as they kept sending five bad passwords every 15 minutes.
 *
 * The cost is that many addresses can each try a few passwords against one
 * account. bcrypt, the IP limits and the second factor carry that risk; a
 * per-email ceiling would bring the lockout back for anyone with enough IPs.
 *
 * `ip` must come from ipLimitKey(), so an IPv6 caller cannot rotate through its
 * /64 for fresh counts.
 */
export async function adminIsLocked(email: string, ip: string): Promise<boolean> {
  const db = getDb();
  const windowStart = new Date(Date.now() - ADMIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000);

  const [pairAttempts] = await db
    .select({ count: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.email, email),
        eq(adminLoginAttempts.ip, ip),
        gte(adminLoginAttempts.attemptedAt, windowStart)
      )
    );

  const [ipAttempts] = await db
    .select({ count: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.ip, ip),
        gte(adminLoginAttempts.attemptedAt, windowStart)
      )
    );

  return (
    (pairAttempts?.count ?? 0) >= MAX_ADMIN_ATTEMPTS ||
    (ipAttempts?.count ?? 0) >= MAX_ADMIN_ATTEMPTS
  );
}

export async function recordAdminAttempt(email: string, ip: string) {
  const db = getDb();
  await db.insert(adminLoginAttempts).values({
    email,
    ip,
    attemptedAt: new Date(),
  });
}
