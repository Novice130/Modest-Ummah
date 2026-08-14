import type { ShippingAddressDB } from '@/lib/schema';
import type { ShippingAddress as CarrierAddress } from '@/lib/shipping';

/**
 * Address shape adapters.
 *
 * The DB stores `ShippingAddressDB` (firstName/address1/postalCode). Carriers
 * want `name`/`street1`/`zip`. WooCommerce wants `first_name`/`address_1`/
 * `postcode`. The DB→carrier mapping used to be copy-pasted in three places
 * (pricing, the rates route, the Stripe webhook), which is how they drifted.
 */

export interface WooAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export function normalizeAddress(raw: unknown): ShippingAddressDB {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {} as ShippingAddressDB;
    }
  }
  return (raw || {}) as ShippingAddressDB;
}

export function fullName(address: ShippingAddressDB): string {
  return `${address.firstName || ''} ${address.lastName || ''}`.trim();
}

/** DB shape → carrier shape used by lib/shipping.ts. */
export function toCarrierAddress(
  raw: unknown,
  fallbackEmail?: string
): CarrierAddress {
  const a = normalizeAddress(raw);
  return {
    name: fullName(a) || 'Customer',
    street1: a.address1 || '',
    street2: a.address2 || '',
    city: a.city || '',
    state: a.state || '',
    zip: a.postalCode || '',
    country: a.country || 'US',
    phone: a.phone,
    email: a.email || fallbackEmail,
  };
}

/**
 * DB shape → WooCommerce REST shape.
 *
 * `email` is only ever populated on Woo's billing object. The order row's
 * `email` column is the reliable source — the address blob's copy is optional
 * and frequently absent.
 */
export function toWooAddress(
  raw: unknown,
  options: { includeContact?: boolean; email?: string } = {}
): WooAddress {
  const a = normalizeAddress(raw);
  const base: WooAddress = {
    first_name: a.firstName || '',
    last_name: a.lastName || '',
    company: '',
    address_1: a.address1 || '',
    address_2: a.address2 || '',
    city: a.city || '',
    state: a.state || '',
    postcode: a.postalCode || '',
    country: a.country || 'US',
  };

  if (options.includeContact) {
    base.email = options.email || a.email || '';
    base.phone = a.phone || '';
  } else {
    // Woo emits phone on shipping too (since WC 5.6); email stays billing-only.
    base.phone = a.phone || '';
  }

  return base;
}

/** True when an address has enough to rate and label a shipment. */
export function isShippable(raw: unknown): boolean {
  const a = normalizeAddress(raw);
  return Boolean(a.address1 && a.city && a.state && a.postalCode);
}
