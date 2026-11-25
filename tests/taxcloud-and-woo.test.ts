import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any }));
vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));
vi.mock('@/lib/email', () => ({
  sendShippingNotification: vi.fn(async () => ({ success: true })),
}));

import { calculateTax, getTaxCloudOriginAddress } from '@/lib/taxcloud';
import { isProductLiveAt, serializeProduct } from '@/lib/woo/serialize';
import {
  applyWriteback,
  extractTracking,
  normalizeTrackingNumber,
  parseTrackingMeta,
} from '@/lib/woo/writeback';
import { createFakeDb } from './helpers/fake-db';

beforeEach(() => {
  h.fake = createFakeDb();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TaxCloud origin requirement', () => {
  const taxInput = {
    items: [{ id: 'p1', price: 25, quantity: 2, category: 'abayas' }],
    shippingAddress: {
      address1: '1 Main St',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
    },
  };

  it('uses estimated tax without requiring origin when TaxCloud keys are unset', async () => {
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', '');
    vi.stubEnv('TAXCLOUD_API_KEY', '');
    const res = await calculateTax(taxInput);
    expect(res.success).toBe(true);
    expect(res.totalTax).toBeGreaterThan(0);
  });

  it('fails loudly instead of sending 123 Business St when TaxCloud keys are set without origin', async () => {
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', 'login');
    vi.stubEnv('TAXCLOUD_API_KEY', 'key');
    vi.stubEnv('TAXCLOUD_ORIGIN_ADDRESS1', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_CITY', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_STATE', '');
    vi.stubEnv('TAXCLOUD_ORIGIN_ZIP5', '');

    expect(() => getTaxCloudOriginAddress()).toThrow(/TaxCloud origin is not configured/);
    await expect(calculateTax(taxInput)).rejects.toThrow(/TAXCLOUD_ORIGIN_ADDRESS1/);
  });

  it('sends the configured origin address when all origin fields are present', async () => {
    vi.stubEnv('TAXCLOUD_API_LOGIN_ID', 'login');
    vi.stubEnv('TAXCLOUD_API_KEY', 'key');
    vi.stubEnv('TAXCLOUD_ORIGIN_ADDRESS1', '500 Real St');
    vi.stubEnv('TAXCLOUD_ORIGIN_CITY', 'Austin');
    vi.stubEnv('TAXCLOUD_ORIGIN_STATE', 'TX');
    vi.stubEnv('TAXCLOUD_ORIGIN_ZIP5', '78701');

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ResponseType: 3, CartItemsResponse: [{ CartItemIndex: 0, TaxAmount: 4.13 }], Messages: [] }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await calculateTax(taxInput);
    expect(res.success).toBe(true);
    expect(res.totalTax).toBe(4.13);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.origin.address1).toBe('500 Real St');
    expect(body.origin.city).toBe('Austin');
  });
});

describe('Woo serialize product live rule', () => {
  const baseProduct = {
    id: 'p1',
    wooProductId: 101,
    name: 'Dress',
    slug: 'dress',
    description: '',
    shortDescription: '',
    price: '45.00',
    compareAtPrice: null,
    sku: 'SKU1',
    productType: 'simple',
    visibility: 'public',
    featured: false,
    manageStock: true,
    stockQuantity: 5,
    inStock: true,
    backorderPolicy: 'no',
    taxClass: null,
    weight: '8',
    lengthIn: '10',
    widthIn: '7',
    heightIn: '2',
    images: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as any;

  it('marks due scheduled products as publish and future scheduled / draft as draft', () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);

    expect(isProductLiveAt({ status: 'published', publishedAt: null })).toBe(true);
    expect(isProductLiveAt({ status: 'scheduled', publishedAt: past })).toBe(true);
    expect(isProductLiveAt({ status: 'scheduled', publishedAt: future })).toBe(false);
    expect(isProductLiveAt({ status: 'draft', publishedAt: past })).toBe(false);

    expect(serializeProduct({ ...baseProduct, status: 'scheduled', publishedAt: past }).status).toBe('publish');
    expect(serializeProduct({ ...baseProduct, status: 'scheduled', publishedAt: future }).status).toBe('draft');
  });
});

describe('Woo writeback tracking normalization', () => {
  it('strips spaces and uppercases tracking numbers from meta and notes', () => {
    expect(normalizeTrackingNumber('  1z 999 aa1  ')).toBe('1Z999AA1');
    const parsed = parseTrackingMeta([
      { key: '_wc_shipment_tracking_items', value: [{ tracking_number: ' 1z 999aa10123456784 ', tracking_provider: ' UPS ' }] },
    ]);
    expect(parsed).toEqual({ trackingNumber: '1Z999AA10123456784', carrier: 'UPS' });

    const note = extractTracking('Shipped via ups tracking 1z999aa10123456784');
    expect(note).toEqual({ trackingNumber: '1Z999AA10123456784', carrier: 'UPS' });
  });

  it('treats equivalent tracking numbers with different case/spacing as idempotent', async () => {
    const existingOrder = {
      id: 'o1',
      orderId: 'MU-1',
      email: 'c@example.com',
      status: 'shipped',
      paymentStatus: 'paid',
      trackingNumber: '1Z999AA10123456784',
      trackingCarrier: 'UPS',
      shippedAt: new Date('2026-01-02T00:00:00Z'),
      shippingAddress: { firstName: 'Sam', lastName: 'K', address1: '1 Main', city: 'X', state: 'IL', postalCode: '60601', country: 'US' },
    } as any;

    const result = await applyWriteback(existingOrder, {
      meta_data: [{ key: '_tracking_number', value: ' 1z 999 aa1 0123456784 ' }],
    });

    expect(result.changed).toBe(false);
    expect(result.emailSent).toBe(false);
  });
});
