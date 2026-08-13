'use server';

import { getDb } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from './auth.actions';

/**
 * Store settings persisted in the key/value `settings` table. Values are
 * typed jsonb; keys not present in the DB fall back to defaults here.
 */

export interface StoreSettings {
  storeName: string;
  contactEmail: string;
  supportEmail: string;
  storePhone: string;
  storeAddress: string;
  announcementText: string;
}

const DEFAULTS: StoreSettings = {
  storeName: 'Modest Ummah',
  contactEmail: 'admin@modestummah.com',
  supportEmail: 'support@modestummah.com',
  storePhone: '',
  storeAddress: '',
  announcementText: '',
};

const KEY = 'store';

export async function fetchSettingsAction(): Promise<StoreSettings> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, KEY))
    .limit(1);

  if (!row) return DEFAULTS;
  return { ...DEFAULTS, ...(row.value as Partial<StoreSettings>) };
}

export async function saveSettingsAction(
  input: Partial<StoreSettings>
): Promise<StoreSettings> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const clean: Partial<StoreSettings> = {};
  if (typeof input.storeName === 'string') clean.storeName = input.storeName.trim();
  if (typeof input.contactEmail === 'string') clean.contactEmail = input.contactEmail.trim();
  if (typeof input.supportEmail === 'string') clean.supportEmail = input.supportEmail.trim();
  if (typeof input.storePhone === 'string') clean.storePhone = input.storePhone.trim();
  if (typeof input.storeAddress === 'string') clean.storeAddress = input.storeAddress.trim();
  if (typeof input.announcementText === 'string') clean.announcementText = input.announcementText.trim();

  const db = getDb();
  const merged = { ...DEFAULTS, ...clean };

  await db
    .insert(settings)
    .values({ key: KEY, value: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: merged, updatedAt: new Date() },
    });

  return merged;
}
