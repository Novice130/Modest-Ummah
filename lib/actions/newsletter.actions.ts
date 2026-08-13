'use server';

import { getDb } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * Newsletter signup. Emails land in the settings-backed store email
 * inbox (support email) — a dedicated mailing-list provider can swap in
 * here without touching the two forms that call this action.
 */
export async function subscribeNewsletterAction(email: string) {
  const clean = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error('Please enter a valid email address');
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'store'))
    .limit(1);

  const store = (row?.value || {}) as Record<string, any>;
  const contactEmail =
    (typeof store.contactEmail === 'string' && store.contactEmail.trim()) ||
    'admin@modestummah.com';

  // Store the subscription as a setting entry keyed by email. A real
  // provider integration (Mailchimp, Resend, etc.) replaces this block.
  await db
    .insert(settings)
    .values({
      key: `newsletter:${clean}`,
      value: { email: clean, subscribedAt: new Date().toISOString(), notify: contactEmail },
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { email: clean, subscribedAt: new Date().toISOString(), notify: contactEmail } },
    });

  return { subscribed: true };
}
