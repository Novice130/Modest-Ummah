'use server';

import { getDb } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from './auth.actions';
import { getFreeShippingInfo } from '@/lib/shipping';
import { storeUrl, storeOrigin, isOriginConfigured, STORE_CURRENCY } from '@/lib/store-info';

/**
 * Store settings persisted in the key/value `settings` table under key
 * `store`. Values are typed jsonb; keys not present in the DB fall back to
 * defaults here.
 *
 * Only `contactEmail` has a reader today (lib/actions/contact.actions.ts and
 * lib/actions/newsletter.actions.ts stamp it on each submission). The other
 * fields are kept in the type and preserved on save so existing rows are not
 * lost, but the admin page no longer offers them: nothing on the storefront
 * reads them, so editing them changed nothing.
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 500;

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  return session;
}

async function readStored(): Promise<Partial<StoreSettings>> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, KEY))
    .limit(1);
  return (row?.value as Partial<StoreSettings>) || {};
}

export async function fetchSettingsAction(): Promise<StoreSettings> {
  await requireAdmin();
  return { ...DEFAULTS, ...(await readStored()) };
}

export async function saveSettingsAction(
  input: Partial<StoreSettings>
): Promise<StoreSettings> {
  await requireAdmin();

  const clean: Partial<StoreSettings> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof StoreSettings)[]) {
    const value = input[key];
    if (typeof value === 'string') clean[key] = value.trim().slice(0, MAX_LEN);
  }

  for (const key of ['contactEmail', 'supportEmail'] as const) {
    if (clean[key] !== undefined) {
      if (!clean[key]) throw new Error('Email address is required');
      if (!EMAIL_RE.test(clean[key]!)) throw new Error(`"${clean[key]}" is not a valid email address`);
      clean[key] = clean[key]!.toLowerCase();
    }
  }

  // Merge over what is stored, not over the defaults: a partial save must not
  // reset fields the caller did not send.
  const merged: StoreSettings = { ...DEFAULTS, ...(await readStored()), ...clean };

  const db = getDb();
  await db
    .insert(settings)
    .values({ key: KEY, value: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: merged, updatedAt: new Date() },
    });

  return merged;
}

// ─── Read-only store configuration ──────────────────────

export interface StoreConfigItem {
  label: string;
  value: string;
  /** false = needs attention (unset / placeholder / test mode). */
  ok: boolean;
  /** Where the value comes from, so the owner knows how to change it. */
  source: string;
}

/**
 * The values the storefront and checkout actually use, which live in code
 * and environment variables rather than the settings table. Reports presence
 * and mode only: no key, token or secret is ever returned.
 */
export async function fetchStoreConfigAction(): Promise<StoreConfigItem[]> {
  await requireAdmin();

  const env = process.env;
  const origin = storeOrigin();
  const originOk = isOriginConfigured();
  const stripeKey = env.STRIPE_SECRET_KEY || '';
  const stripeMode = stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')
    ? 'live'
    : stripeKey.startsWith('sk_test_') && stripeKey !== 'sk_test_dummy'
      ? 'test'
      : null;
  const freeShipping = getFreeShippingInfo(0).threshold;
  const pirateShip = Boolean(env.PIRATESHIP_API_KEY);
  const taxCloud = Boolean(env.TAXCLOUD_API_LOGIN_ID && env.TAXCLOUD_API_KEY);

  return [
    {
      label: 'Store name',
      value: env.NEXT_PUBLIC_APP_NAME || 'Modest Ummah',
      ok: true,
      source: 'NEXT_PUBLIC_APP_NAME (email sender name)',
    },
    {
      label: 'Store URL',
      value: storeUrl(),
      ok: true,
      source: 'NEXT_PUBLIC_APP_URL',
    },
    {
      label: 'Currency',
      value: STORE_CURRENCY,
      ok: true,
      source: 'Fixed in code (prices, Stripe and the Pirate Ship API all use USD)',
    },
    {
      label: 'Payments',
      value: stripeMode === 'live' ? 'Stripe, live mode' : stripeMode === 'test' ? 'Stripe, TEST mode' : 'Stripe not configured',
      ok: stripeMode === 'live',
      source: 'STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    },
    {
      label: 'Free shipping',
      value: `Orders of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: STORE_CURRENCY }).format(freeShipping)} or more`,
      ok: true,
      source: 'lib/shipping.ts getFreeShippingInfo (the cart, header banner and checkout repeat this figure)',
    },
    {
      label: 'Shipping rates',
      value: pirateShip && originOk
        ? 'Live USPS rates from Pirate Ship'
        : 'Estimated flat rates (Pirate Ship API key or ship-from address missing)',
      ok: pirateShip && originOk,
      source: 'PIRATESHIP_API_KEY + PIRATESHIP_ORIGIN_*',
    },
    {
      label: 'Ship-from address',
      value: originOk
        ? [origin.street1, origin.city, `${origin.state} ${origin.zip}`].filter(Boolean).join(', ')
        : 'Not configured',
      ok: originOk,
      source: 'PIRATESHIP_ORIGIN_STREET1 / _CITY / _STATE / _ZIP',
    },
    {
      label: 'Sales tax',
      value: taxCloud ? 'TaxCloud' : 'Estimated state rate (TaxCloud not configured)',
      ok: taxCloud,
      source: 'TAXCLOUD_API_LOGIN_ID / TAXCLOUD_API_KEY',
    },
    {
      label: 'Order emails',
      value: env.BREVO_API_KEY ? 'Sent by Brevo from orders@modestummah.com' : 'Not sent (Brevo not configured)',
      ok: Boolean(env.BREVO_API_KEY),
      source: 'BREVO_API_KEY',
    },
    {
      label: 'Support email shown to customers',
      value: 'support@modestummah.com',
      ok: true,
      source: 'Fixed in the footer, policy pages and email templates',
    },
  ];
}
