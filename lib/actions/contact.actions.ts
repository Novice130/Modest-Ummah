'use server';

import { getDb } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * Contact form submission. The message is stored in the settings table
 * (key `contact:<timestamp>`) and flagged for the store's contact inbox.
 * A real mail provider can swap in without touching the form.
 */
export async function submitContactAction(input: {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
}) {
  const firstName = (input.firstName || '').trim();
  const lastName = (input.lastName || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const subject = (input.subject || '').trim();
  const message = (input.message || '').trim();

  if (!firstName || !lastName) throw new Error('First and last name are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address');
  }
  if (!subject) throw new Error('Subject is required');
  if (message.length < 10) throw new Error('Message is too short');

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

  const key = `contact:${Date.now()}`;
  await db.insert(settings).values({
    key,
    value: {
      firstName,
      lastName,
      email,
      subject,
      message,
      receivedAt: new Date().toISOString(),
      notify: contactEmail,
    },
  });

  return { received: true };
}
