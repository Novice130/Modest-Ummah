import { getDb } from '@/lib/db';
import { adminLoginAttempts } from '@/lib/schema';
import { eq, and, gte, count } from 'drizzle-orm';

export const MAX_ADMIN_ATTEMPTS = 5;
export const ADMIN_ATTEMPT_WINDOW_MINUTES = 15;

export async function adminIsLocked(email: string, ip: string): Promise<boolean> {
  const db = getDb();
  const windowStart = new Date(Date.now() - ADMIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000);

  const [emailAttempts] = await db
    .select({ count: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.email, email),
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
    (emailAttempts?.count ?? 0) >= MAX_ADMIN_ATTEMPTS ||
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
