/**
 * Store identity and origin address for the WooCommerce-compatible surface.
 *
 * The origin values are the same PIRATESHIP_ORIGIN_* variables lib/shipping.ts
 * reads. If they are unset, lib/shipping.ts falls back to a placeholder
 * ("123 Business St, New York, NY 10001") which would print on real labels —
 * so this module reports whether the origin is actually configured, and the
 * admin integration card surfaces that.
 */

export function storeUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'https://modestummah.com';
  return url.replace(/\/+$/, '');
}

export interface StoreOrigin {
  name: string;
  company: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
}

export function storeOrigin(): StoreOrigin {
  return {
    name: process.env.PIRATESHIP_ORIGIN_NAME || 'Modest Ummah',
    company: process.env.PIRATESHIP_ORIGIN_COMPANY || 'Modest Ummah',
    street1: process.env.PIRATESHIP_ORIGIN_STREET1 || '',
    street2: process.env.PIRATESHIP_ORIGIN_STREET2 || '',
    city: process.env.PIRATESHIP_ORIGIN_CITY || '',
    state: process.env.PIRATESHIP_ORIGIN_STATE || '',
    zip: process.env.PIRATESHIP_ORIGIN_ZIP || '',
    country: 'US',
    phone: process.env.PIRATESHIP_ORIGIN_PHONE || '',
    email: process.env.PIRATESHIP_ORIGIN_EMAIL || '',
  };
}

/** True when a real ship-from address is configured (not the placeholder). */
export function isOriginConfigured(): boolean {
  const origin = storeOrigin();
  return Boolean(origin.street1 && origin.city && origin.state && origin.zip);
}
